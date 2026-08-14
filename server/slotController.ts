import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Paths } from "./paths.js";
import { ensureDir } from "./paths.js";
import { killListenersOnPort } from "./portKill.js";
import { LogRingBuffer } from "./logRing.js";
import { RollingLogWriter } from "./rollingLog.js";
import { loadEnvKeyValue } from "./envMerge.js";
import {
  injectHfTokenIntoRecipeYaml,
  resolveHfTokenForRecipe,
} from "./recipeHfTokenMerge.js";
import { probeRecipeYaml } from "./recipeProbe.js";
import type {
  DockerContainerInfo,
  RecipeRunOverrides,
  SlotId,
  SlotPhase,
  SlotSnapshot,
  VllmLiveStats,
} from "../types/index.js";
import { buildLaunchHint, pushRecipeOverrideArgs } from "./slotControllerSpawn.js";
import { stopChildForce, stopChildGraceful } from "./slotControllerStop.js";
import type { LogBroadcast, StateBroadcast } from "./slotController.types.js";

export type { LogBroadcast, StateBroadcast } from "./slotController.types.js";

export class SlotController {
  private phase: SlotPhase = "IDLE";
  private child: ChildProcess | null = null;
  private recipeStem: string | null = null;
  /** Hugging Face repo id from YAML `model:` (set at run start). */
  private recipeModelId: string | null = null;
  private recipePath: string | null = null;
  private recipeLaunchHint: string | null = null;
  private containerReuseWarning: string | null = null;
  private bootStartedAt: number | null = null;
  private lastError: string | null = null;
  private exitCode: number | null = null;
  private bootWatchdog: ReturnType<typeof setTimeout> | null = null;
  private streamBuf = "";
  private intentionalStop = false;
  tokPerSec: number | null = null;
  /** Latest vLLM Prometheus gauges (DeckService) while HEALTHY. */
  liveStats: VllmLiveStats | null = null;
  /** Set by DeckService via vLLM `GET /v1/models` while BOOTING/HEALTHY. */
  servedModels: string[] | null = null;
  /** Set by DeckService via `docker ps` for this slot’s published port. */
  docker: DockerContainerInfo | null = null;

  readonly ring: LogRingBuffer;
  readonly rolling: RollingLogWriter;

  constructor(
    private readonly slot: SlotId,
    private readonly port: number,
    private readonly cfg: AppConfig,
    private readonly paths: Paths,
    private readonly broadcastLog: LogBroadcast,
    private readonly broadcastState: StateBroadcast,
  ) {
    this.ring = new LogRingBuffer(cfg.maxLogLines, cfg.maxLogBytes);
    const base = `slot-${slot}`;
    this.rolling = new RollingLogWriter(
      cfg.logDir,
      base,
      cfg.logMaxFileMb * 1024 * 1024,
      cfg.logMaxFiles,
    );
  }

  getPhase(): SlotPhase {
    return this.phase;
  }

  snapshot(): SlotSnapshot {
    return {
      slot: this.slot,
      phase: this.phase,
      port: this.port,
      recipeStem: this.recipeStem,
      recipeModelId: this.recipeModelId,
      recipePath: this.recipePath,
      recipeLaunchHint: this.recipeLaunchHint,
      containerReuseWarning: this.containerReuseWarning,
      servedModels: this.servedModels,
      docker: this.docker,
      pid: this.child?.pid ?? null,
      bootElapsedMs:
        this.bootStartedAt !== null ? Date.now() - this.bootStartedAt : null,
      lastError: this.lastError,
      exitCode: this.exitCode,
      tokPerSec: this.tokPerSec,
      liveStats: this.liveStats,
    };
  }

  private async buildEnvForRun(): Promise<NodeJS.ProcessEnv> {
    const base = { ...process.env } as NodeJS.ProcessEnv;
    const fromFile = await loadEnvKeyValue(this.paths.envFile);
    for (const [k, v] of Object.entries(fromFile)) {
      base[k] = v;
    }
    return base;
  }

  private clearBootWatchdog(): void {
    if (this.bootWatchdog) {
      clearTimeout(this.bootWatchdog);
      this.bootWatchdog = null;
    }
  }

  /**
   * spark-vllm-docker may skip `docker run` when `vllm_node` is already up and
   * exec into it instead — second recipe may not run in isolation.
   */
  private detectSparkContainerReuse(line: string): void {
    if (this.containerReuseWarning) {
      return;
    }
    const skipLaunch =
      line.includes("Cluster containers are already running") &&
      line.includes("Skipping launch");
    const headReuse =
      /Container ['"][^'"]+['"] is already running on head node/i.test(line);
    if (skipLaunch || headReuse) {
      this.containerReuseWarning =
        "Spark reused an existing container (log: container already running / Skipping launch). Stop the current run and try again so this recipe gets a fresh container; otherwise exec may run the wrong model or hit VRAM errors.";
      this.broadcastState();
    }
  }

  /** Log line without evaluating readyRegex (for synthetic banners). */
  private appendRawLogLine(line: string): void {
    const full = `${line}\n`;
    this.ring.push(full);
    this.rolling.append(full);
    this.broadcastLog(this.slot, full);
  }

  private pushCompleteLine(line: string): void {
    this.detectSparkContainerReuse(line);
    const full = `${line}\n`;
    this.ring.push(full);
    this.rolling.append(full);
    this.broadcastLog(this.slot, full);
    if (this.phase === "BOOTING" && this.cfg.readyRegex.test(full)) {
      this.phase = "HEALTHY";
      this.clearBootWatchdog();
      this.broadcastState();
    }
  }

  private ingestStreamChunk(chunk: string): void {
    this.streamBuf += chunk;
    let idx: number;
    while ((idx = this.streamBuf.indexOf("\n")) >= 0) {
      const line = this.streamBuf.slice(0, idx);
      this.streamBuf = this.streamBuf.slice(idx + 1);
      this.pushCompleteLine(line);
    }
  }

  private flushStreamBuf(): void {
    if (this.streamBuf.length > 0) {
      this.pushCompleteLine(this.streamBuf);
      this.streamBuf = "";
    }
  }

  async run(opts: {
    recipeStem: string;
    recipeAbsPath: string;
    solo: boolean;
    bufferYaml?: string;
    recipeOverrides?: RecipeRunOverrides;
  }): Promise<void> {
    if (this.phase === "BOOTING" || this.phase === "HEALTHY") {
      throw new Error("A run is already in progress");
    }
    await this.stopGraceful();
    await killListenersOnPort(this.port);

    let rawYaml: string;
    if (opts.bufferYaml !== undefined) {
      rawYaml = opts.bufferYaml;
    } else {
      rawYaml = await fs.readFile(opts.recipeAbsPath, "utf8");
    }

    const hfTok = await resolveHfTokenForRecipe(this.paths);
    const mergedYaml = injectHfTokenIntoRecipeYaml(rawYaml, hfTok);
    if (mergedYaml !== null) {
      rawYaml = mergedYaml;
    }

    let recipeArg: string;
    if (opts.bufferYaml !== undefined || mergedYaml !== null) {
      ensureDir(this.paths.tempRunsDir);
      const tmp = path.join(
        this.paths.tempRunsDir,
        `run-${this.slot}-${Date.now()}.yaml`,
      );
      await fs.writeFile(tmp, rawYaml, "utf8");
      recipeArg = tmp;
    } else {
      recipeArg = opts.recipeAbsPath;
    }

    const probe = probeRecipeYaml(rawYaml);

    this.recipeStem = opts.recipeStem;
    const mid = probe.model?.trim();
    this.recipeModelId = mid ? mid : null;
    this.recipePath = recipeArg;
    this.recipeLaunchHint = null;
    this.containerReuseWarning = null;
    this.lastError = null;
    this.exitCode = null;
    this.intentionalStop = false;
    this.streamBuf = "";
    this.tokPerSec = null;
    this.liveStats = null;
    this.servedModels = null;
    this.docker = null;
    this.ring.clear();
    this.phase = "BOOTING";
    this.bootStartedAt = Date.now();

    const env = await this.buildEnvForRun();

    let exe: string;
    let args: string[];
    if (this.cfg.runRecipeUseShellWrapper) {
      exe = this.paths.runRecipeSh;
      args = [recipeArg, "--port", String(this.port)];
    } else {
      exe = this.cfg.python;
      args = [this.paths.runRecipePy, recipeArg, "--port", String(this.port)];
    }
    if (opts.solo) {
      args.push("--solo");
    }

    const ro = opts.recipeOverrides;
    pushRecipeOverrideArgs(args, ro);

    const { hintParts, argvDisplay, recipeLaunchHint } = buildLaunchHint(
      probe,
      ro,
      exe,
      args,
    );
    this.recipeLaunchHint = recipeLaunchHint;

    this.broadcastState();

    this.appendRawLogLine(`[recipe-deck] launch: ${hintParts.join(" | ")}`);
    if (mergedYaml !== null) {
      this.appendRawLogLine(
        "[recipe-deck] note: HF_TOKEN merged into recipe env (from Recipe Deck / $SPARK_VLLM_ROOT/.env)",
      );
    }
    this.appendRawLogLine(`[recipe-deck] argv: ${argvDisplay}`);

    console.info(
      "[recipe-deck]",
      JSON.stringify({
        runnerId: this.slot,
        stem: opts.recipeStem,
        recipePath: recipeArg,
        probe,
        overrides: ro ?? null,
        argv: [exe, ...args],
      }),
    );

    this.bootWatchdog = setTimeout(() => {
      if (this.phase === "BOOTING") {
        this.lastError = "Boot timeout (ready signal not seen in logs)";
        this.phase = "ERROR";
        void this.stopForceInternal();
        this.broadcastState();
      }
    }, this.cfg.healthProbeTimeoutMs);

    const child = spawn(exe, args, {
      env,
      cwd: this.paths.sparkRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    child.stdout?.on("data", (d: Buffer) => this.ingestStreamChunk(d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => this.ingestStreamChunk(d.toString("utf8")));

    child.on("error", (err) => {
      this.lastError = err.message;
      this.phase = "ERROR";
      this.clearBootWatchdog();
      this.broadcastState();
    });

    child.on("close", (code) => {
      this.flushStreamBuf();
      this.exitCode = code;
      this.clearBootWatchdog();
      if (this.intentionalStop) {
        this.phase = "IDLE";
        this.intentionalStop = false;
        this.recipeModelId = null;
      } else if (this.phase === "BOOTING" || this.phase === "HEALTHY") {
        this.phase = "ERROR";
        if (!this.lastError) {
          this.lastError =
            code === 0 ? "Process exited unexpectedly" : `Exit code ${code ?? "?"}`;
        }
      }
      this.child = null;
      this.bootStartedAt = null;
      this.broadcastState();
    });
  }

  async stopGraceful(): Promise<void> {
    this.clearBootWatchdog();
    const ch = this.child;
    if (!ch?.pid) {
      this.phase = "IDLE";
      this.recipeModelId = null;
      this.broadcastState();
      return;
    }
    this.intentionalStop = true;
    await stopChildGraceful({ child: ch, graceMs: this.cfg.bootSigtermGraceMs });
  }

  private async stopForceInternal(): Promise<void> {
    const ch = this.child;
    if (!ch?.pid) return;
    this.intentionalStop = true;
    await stopChildForce(ch);
  }

  async stopForce(): Promise<void> {
    this.clearBootWatchdog();
    const ch = this.child;
    if (!ch?.pid) {
      this.phase = "IDLE";
      this.recipeModelId = null;
      this.broadcastState();
      return;
    }
    this.intentionalStop = true;
    await stopChildForce(ch);
  }

  close(): void {
    this.clearBootWatchdog();
    this.rolling.close();
  }
}
