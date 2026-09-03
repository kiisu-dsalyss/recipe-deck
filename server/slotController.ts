import type { ChildProcess } from "node:child_process";
import type { AppConfig } from "./config.js";
import type { Paths } from "./paths.js";
import { killListenersOnPort } from "./portKill.js";
import { LogRingBuffer } from "./logRing.js";
import { RollingLogWriter } from "./rollingLog.js";
import type {
  DockerContainerInfo,
  RecipeLaunchKind,
  SlotId,
  SlotPhase,
  SlotSnapshot,
  VllmLiveStats,
} from "../types/index.js";
import {
  buildRunArgv,
  buildRunEnv,
  launchHint,
  prepareRunYaml,
  spawnChild,
} from "./slotControllerRun.js";
import { stopControllerRun } from "./slotControllerStop.js";
import { sparkrunStop } from "./slotControllerSparkrun.js";
import {
  detectSparkContainerReuseInLine,
  pushLogLine,
} from "./slotControllerLog.js";
import type {
  LogBroadcast,
  SlotRunOpts,
  StateBroadcast,
} from "./slotController.types.js";

export type {
  LogBroadcast,
  SlotRunOpts,
  StateBroadcast,
} from "./slotController.types.js";

export class SlotController {
  private phase: SlotPhase = "IDLE";
  private child: ChildProcess | null = null;
  private recipeStem: string | null = null;
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
  private listenPort: number;
  private launchKind: RecipeLaunchKind = "solo";
  /** Last run parameters — used to relaunch after cooldown and to `sparkrun stop`. */
  private lastRunOpts: SlotRunOpts | null = null;
  private autoRestartEnabled = true;
  private autoRestartAtMs: number | null = null;
  private autoRestartTimer: ReturnType<typeof setTimeout> | null = null;
  tokPerSec: number | null = null;
  liveStats: VllmLiveStats | null = null;
  servedModels: string[] | null = null;
  docker: DockerContainerInfo | null = null;
  readonly ring: LogRingBuffer;
  readonly rolling: RollingLogWriter;

  constructor(
    private readonly slot: SlotId,
    defaultPort: number,
    private readonly cfg: AppConfig,
    private readonly paths: Paths,
    private readonly broadcastLog: LogBroadcast,
    private readonly broadcastState: StateBroadcast,
  ) {
    this.listenPort = defaultPort;
    this.ring = new LogRingBuffer(cfg.maxLogLines, cfg.maxLogBytes);
    this.rolling = new RollingLogWriter(
      cfg.logDir,
      `slot-${slot}`,
      cfg.logMaxFileMb * 1024 * 1024,
      cfg.logMaxFiles,
    );
  }

  getPhase = (): SlotPhase => this.phase;
  getListenPort = (): number => this.listenPort;
  getLaunchKind = (): RecipeLaunchKind => this.launchKind;

  /** Called by DeckService when `.current-recipe` auto-restart flag flips. */
  setAutoRestartEnabled(enabled: boolean): void {
    this.autoRestartEnabled = enabled;
    if (!enabled) this.cancelAutoRestart();
  }

  snapshot(): SlotSnapshot {
    return {
      slot: this.slot,
      phase: this.phase,
      port: this.listenPort,
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
      autoRestartAtMs: this.autoRestartAtMs,
      autoRestartCooldownMs:
        this.autoRestartAtMs != null ? this.cfg.autoRestartCooldownMs : null,
    };
  }

  private clearBootWatchdog(): void {
    if (this.bootWatchdog) {
      clearTimeout(this.bootWatchdog);
      this.bootWatchdog = null;
    }
  }

  cancelAutoRestart(): void {
    if (this.autoRestartTimer) {
      clearTimeout(this.autoRestartTimer);
      this.autoRestartTimer = null;
    }
    if (this.autoRestartAtMs != null) {
      this.autoRestartAtMs = null;
      this.broadcastState();
    }
  }

  private scheduleAutoRestart(): void {
    this.cancelAutoRestart();
    if (!this.autoRestartEnabled || !this.lastRunOpts) return;
    const cooldown = this.cfg.autoRestartCooldownMs;
    this.autoRestartAtMs = Date.now() + cooldown;
    this.lastError = "Process exited; auto-restarting…";
    this.broadcastState();
    this.autoRestartTimer = setTimeout(() => {
      this.autoRestartTimer = null;
      this.autoRestartAtMs = null;
      const opts = this.lastRunOpts;
      if (!opts || !this.autoRestartEnabled) {
        this.broadcastState();
        return;
      }
      console.info(
        `[recipe-deck] auto-restarting recipe after cooldown: ${opts.recipeStem}`,
      );
      void this.run(opts).catch((e) => {
        this.lastError =
          e instanceof Error ? e.message : `Auto-restart failed: ${String(e)}`;
        this.phase = "ERROR";
        this.broadcastState();
      });
    }, cooldown);
  }

  private appendRawLogLine(line: string): void {
    pushLogLine({
      line,
      ring: this.ring,
      rolling: this.rolling,
      onLine: (f) => this.broadcastLog(this.slot, f),
    });
  }

  private pushCompleteLine(line: string): void {
    if (!this.containerReuseWarning) {
      const warn = detectSparkContainerReuseInLine(line);
      if (warn) {
        this.containerReuseWarning = warn;
        this.broadcastState();
      }
    }
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

  private runSparkrunStop(recipeAbs: string): Promise<void> {
    return sparkrunStop({
      sparkrunBin: this.cfg.sparkrunBin,
      sparkrunExtraArgs: this.cfg.sparkrunExtraArgs,
      cwd: this.paths.sparkRoot,
      recipeAbsPath: recipeAbs,
      onLine: (line: string) => this.ingestStreamChunk(line),
    });
  }

  private wireChild(child: ChildProcess): void {
    child.stdout?.on("data", (d: Buffer) =>
      this.ingestStreamChunk(d.toString("utf8")),
    );
    child.stderr?.on("data", (d: Buffer) =>
      this.ingestStreamChunk(d.toString("utf8")),
    );
    child.on("error", (err) => {
      this.lastError = err.message;
      this.phase = "ERROR";
      this.clearBootWatchdog();
      this.broadcastState();
      if (!this.intentionalStop && this.autoRestartEnabled) {
        this.scheduleAutoRestart();
      }
    });
    child.on("close", (code) => this.handleChildClose(code));
  }

  private handleChildClose(code: number | null): void {
    this.flushStreamBuf();
    this.exitCode = code;
    this.clearBootWatchdog();
    if (this.intentionalStop) {
      this.phase = "IDLE";
      this.intentionalStop = false;
      this.recipeModelId = null;
      this.cancelAutoRestart();
    } else if (this.phase === "BOOTING" || this.phase === "HEALTHY") {
      this.phase = "ERROR";
      if (!this.lastError) {
        this.lastError =
          code === 0
            ? "Process exited unexpectedly"
            : `Exit code ${code ?? "?"}`;
      }
      if (this.autoRestartEnabled) this.scheduleAutoRestart();
    }
    this.child = null;
    this.bootStartedAt = null;
    this.broadcastState();
  }

  private resetRunState(recipeArg: string, opts: SlotRunOpts, probe: { model: string | null }): void {
    this.autoRestartEnabled = opts.autoRestart !== false;
    this.lastRunOpts = { ...opts, autoRestart: this.autoRestartEnabled };
    this.recipeStem = opts.recipeStem;
    this.recipeModelId = probe.model?.trim() ? probe.model.trim() : null;
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
  }

  async run(opts: SlotRunOpts): Promise<void> {
    this.cancelAutoRestart();
    if (this.phase === "BOOTING" || this.phase === "HEALTHY") {
      throw new Error("A run is already in progress");
    }
    await this.stopGraceful();

    const { recipeArg, mergedYaml, probe } = await prepareRunYaml({
      runOpts: opts,
      paths: this.paths,
      slot: this.slot,
    });
    this.launchKind = probe.kind;
    this.listenPort =
      probe.port != null && Number.isFinite(probe.port)
        ? probe.port
        : this.cfg.vllmPortA;
    if (this.launchKind === "solo") {
      await killListenersOnPort(this.listenPort);
    }
    this.resetRunState(recipeArg, opts, probe);

    const env = await buildRunEnv(this.paths);
    const { exe, args } = buildRunArgv({
      runOpts: opts,
      cfg: this.cfg,
      paths: this.paths,
      launchKind: this.launchKind,
      recipeArg,
      listenPort: this.listenPort,
    });
    const hint = launchHint({
      probe,
      runOpts: opts,
      exe,
      args,
      launchKind: this.launchKind,
      listenPort: this.listenPort,
    });
    this.recipeLaunchHint = hint.recipeLaunchHint;
    this.broadcastState();

    this.appendRawLogLine(`[recipe-deck] launch: ${hint.hintParts.join(" | ")}`);
    if (mergedYaml !== null) {
      this.appendRawLogLine(
        "[recipe-deck] note: HF_TOKEN merged into recipe env (from Recipe Deck / $SPARK_VLLM_ROOT/.env)",
      );
    }
    this.appendRawLogLine(`[recipe-deck] argv: ${hint.argvDisplay}`);
    console.info(
      "[recipe-deck]",
      JSON.stringify({
        runnerId: this.slot,
        stem: opts.recipeStem,
        recipePath: recipeArg,
        kind: this.launchKind,
        probe,
        overrides:
          this.launchKind === "solo" ? (opts.recipeOverrides ?? null) : null,
        argv: [exe, ...args],
      }),
    );

    this.bootWatchdog = setTimeout(() => {
      if (this.phase === "BOOTING") {
        this.lastError = "Boot timeout (ready signal not seen in logs)";
        this.phase = "ERROR";
        if (this.child?.pid) void this.stopCommon("force");
        this.broadcastState();
      }
    }, this.cfg.healthProbeTimeoutMs);

    this.child = spawnChild({ exe, args, env, cwd: this.paths.sparkRoot });
    this.wireChild(this.child);
  }

  private stopCommon(mode: "graceful" | "force"): Promise<void> {
    this.clearBootWatchdog();
    this.cancelAutoRestart();
    return stopControllerRun({
      child: this.child,
      mode,
      graceMs: this.cfg.bootSigtermGraceMs,
      wasCluster: this.launchKind === "sparkrun-cluster",
      clusterRecipeAbs: this.lastRunOpts?.recipeAbsPath ?? this.recipePath,
      runSparkrunStop: (a) => this.runSparkrunStop(a),
      markIntentionalStop: () => {
        this.intentionalStop = true;
      },
      markIdle: () => {
        this.phase = "IDLE";
        this.recipeModelId = null;
        this.broadcastState();
      },
    });
  }

  stopGraceful(): Promise<void> {
    return this.stopCommon("graceful");
  }
  stopForce(): Promise<void> {
    return this.stopCommon("force");
  }

  close(): void {
    this.clearBootWatchdog();
    this.cancelAutoRestart();
    this.rolling.close();
  }
}
