import fs from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import type { AppConfig } from "./config.js";
import { buildPaths, type Paths } from "./paths.js";
import { ensureDir } from "./paths.js";
import { listRecipes, resolveRecipeDiskPath, safeRecipeStem } from "./recipeScanner.js";
import {
  loadUsageStatsFile,
  saveUsageStatsFile,
  sortRecipesByUsage,
} from "./recipeUsage.js";
import { SlotController, type LogBroadcast, type StateBroadcast } from "./slotController.js";
import { ensureDockerImageAliases } from "./dockerImageAliases.js";
import { diskUsageForPath, nvidiaGpuSnapshot } from "./metrics/hostMetrics.js";
import { findDockerContainerForHostPort } from "./metrics/dockerPs.js";
import { parseVllmLiveStatsFromPrometheus } from "./metrics/vllmLiveStats.js";
import { fetchServedModelIds } from "./metrics/vllmModels.js";
import { TokenRateTracker } from "./metrics/vllmTokens.js";
import {
  RUNNER_API_SLOT,
  type DockerContainerInfo,
  type ModelCacheProgress,
  type RecipeDeckPathsPayload,
  type RecipeListItem,
  type MetricsPayload,
  type SlotSnapshot,
} from "../types/index.js";
import { readHfTokenFromFile } from "./envMerge.js";
import { computeModelCacheProgress } from "./modelCacheProgress.js";
import { readCurrentRecipeState } from "./currentRecipe.js";

/** Single object for GET /api/state and WebSocket `state` messages (keep in sync). */
export interface DeckFullStatePayload {
  listenHost: string;
  listenPort: number;
  slots: { a: SlotSnapshot };
  metrics: MetricsPayload;
  recipes: RecipeListItem[];
  /** Hub download vs expected size while booting (null otherwise). */
  modelCacheProgress: ModelCacheProgress | null;
  /** Matches `MODEL_CACHE_POLL_MS` (for client polling while booting). */
  modelCachePollIntervalMs: number;
  recipePaths: RecipeDeckPathsPayload;
}

export class DeckService {
  readonly paths: Paths;
  /** Single managed vLLM process (wire id `RUNNER_API_SLOT` / JSON `slots.a`). */
  readonly runner: SlotController;
  private readonly usageStatsPath: string;
  private recipeRunCounts: Record<string, number> = {};
  private recipes: RecipeListItem[] = [];
  private diskCache: MetricsPayload["disk"] = null;
  private gpuCache: MetricsPayload["gpu"] = null;
  private diskTimer: ReturnType<typeof setInterval> | null = null;
  private gpuTimer: ReturnType<typeof setInterval> | null = null;
  private vllmTimer: ReturnType<typeof setInterval> | null = null;
  private modelCacheTimer: ReturnType<typeof setInterval> | null = null;
  private modelCacheProgress: ModelCacheProgress | null = null;
  private readonly runnerTokenTracker = new TokenRateTracker();

  constructor(
    readonly cfg: AppConfig,
    broadcastLog: LogBroadcast,
    private readonly broadcastState: StateBroadcast,
  ) {
    ensureDir(cfg.logDir);
    this.usageStatsPath = path.join(cfg.logDir, "recipe-run-counts.json");
    this.paths = buildPaths(cfg);
    this.runner = new SlotController(
      RUNNER_API_SLOT,
      cfg.vllmPortA,
      cfg,
      this.paths,
      broadcastLog,
      broadcastState,
    );
  }

  async init(): Promise<void> {
    if (this.cfg.dockerImageAliases.length > 0) {
      try {
        await ensureDockerImageAliases(this.cfg.dockerImageAliases);
        console.info(
          `[recipe-deck] Docker image aliases OK: ${this.cfg.dockerImageAliases
            .map((p) => `${p.source} → ${p.target}`)
            .join(", ")}`,
        );
      } catch (e) {
        console.error(
          `[recipe-deck] Docker image alias failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.recipeRunCounts = await loadUsageStatsFile(this.usageStatsPath);
    await this.refreshRecipes();

    // Try to auto-start the last configured recipe
    await this.tryAutoStart();

    const watcher = chokidar.watch(this.paths.recipesDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 200 },
    });
    watcher.on("all", () => {
      void this.refreshRecipes();
    });

    this.diskTimer = setInterval(() => {
      void this.refreshDisk();
    }, this.cfg.diskStatsIntervalMs);
    void this.refreshDisk();

    this.gpuTimer = setInterval(() => {
      void this.refreshGpu();
    }, this.cfg.gpuStatsIntervalMs);
    void this.refreshGpu();

    this.vllmTimer = setInterval(() => {
      void this.refreshVllmRates();
    }, this.cfg.vllmMetricsIntervalMs);
    void this.refreshVllmRates();

    this.modelCacheTimer = setInterval(() => {
      void this.refreshModelCacheProgress();
    }, this.cfg.modelCachePollIntervalMs);
    void this.refreshModelCacheProgress();
  }

  private async refreshModelCacheProgress(): Promise<void> {
    const sa = this.runner.snapshot();
    const bootModelId =
      sa.phase === "BOOTING" && sa.recipeModelId ? sa.recipeModelId : null;
    if (!bootModelId) {
      if (this.modelCacheProgress !== null) {
        this.modelCacheProgress = null;
        this.broadcastState();
      }
      return;
    }
    let hfToken: string | null =
      process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN ?? null;
    if (!hfToken?.trim()) {
      hfToken = await readHfTokenFromFile(this.paths.envFile);
    }
    const tok = hfToken?.trim() || null;

    const snap = await computeModelCacheProgress(bootModelId, {
      hfHubCacheDir: this.cfg.hfHubCacheDir,
      hfToken: tok,
      envFile: this.paths.envFile,
    });
    const next: ModelCacheProgress = {
      modelId: snap.modelId,
      bytesOnDisk: snap.bytesOnDisk,
      bytesExpected: snap.bytesExpected,
      percent: snap.percent,
    };
    this.modelCacheProgress = next;
    this.broadcastState();
  }

  private async refreshDisk(): Promise<void> {
    const d = await diskUsageForPath(this.cfg.sparkVllmRoot);
    this.diskCache = d
      ? { path: this.cfg.sparkVllmRoot, freeBytes: d.freeBytes, totalBytes: d.totalBytes }
      : null;
  }

  private async refreshGpu(): Promise<void> {
    this.gpuCache = await nvidiaGpuSnapshot();
  }

  private async refreshVllmRates(): Promise<void> {
    await this.probeLiveEndpoints();
    await this.scrapePrometheusTokOnly(this.runner, this.runnerTokenTracker);
    this.broadcastState();
  }

  /**
   * Probe the vLLM port for OpenAI `/v1/models` + Docker publish,
   * even when Recipe Deck’s runner is IDLE (workloads started outside the UI).
   */
  private async probeLiveEndpoints(): Promise<void> {
    const a = await this.probeOnePort(this.cfg.vllmPortA);
    this.runner.servedModels = a.models;
    this.runner.docker = a.docker;
  }

  private async probeOnePort(port: number): Promise<{
    models: string[] | null;
    docker: DockerContainerInfo | null;
  }> {
    const [models, docker] = await Promise.all([
      fetchServedModelIds(port),
      findDockerContainerForHostPort(port),
    ]);
    return { models, docker };
  }

  private async scrapePrometheusTokOnly(
    slot: SlotController,
    tracker: TokenRateTracker,
  ): Promise<void> {
    const phase = slot.getPhase();
    if (phase === "IDLE" || phase === "ERROR") {
      tracker.reset();
      slot.tokPerSec = null;
      slot.liveStats = null;
      return;
    }
    if (phase !== "HEALTHY") {
      slot.tokPerSec = null;
      slot.liveStats = null;
      return;
    }
    const port = this.cfg.vllmPortA;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/metrics`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) {
        slot.tokPerSec = null;
        slot.liveStats = null;
        return;
      }
      const body = await r.text();
      slot.liveStats = parseVllmLiveStatsFromPrometheus(body);
      const rate = tracker.updateFromMetricsBody(body);
      slot.tokPerSec = rate !== null ? Math.round(rate * 10) / 10 : null;
    } catch {
      slot.tokPerSec = null;
      slot.liveStats = null;
    }
  }

  private async reloadRecipesSorted(): Promise<void> {
    const raw = await listRecipes(this.paths.recipesDir);
    this.recipes = sortRecipesByUsage(raw, this.recipeRunCounts);
  }

  async refreshRecipes(): Promise<void> {
    await this.reloadRecipesSorted();
    this.broadcastState();
  }

  /** Call after a successful `run` so the recipe list re-orders by usage. */
  async recordRecipeRun(stem: string): Promise<void> {
    this.recipeRunCounts[stem] = (this.recipeRunCounts[stem] ?? 0) + 1;
    try {
      await saveUsageStatsFile(this.usageStatsPath, this.recipeRunCounts);
    } catch (e) {
      console.error(
        `[recipe-deck] failed to save recipe usage: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await this.reloadRecipesSorted();
    this.broadcastState();
  }

  getRecipes(): RecipeListItem[] {
    return this.recipes;
  }

  /**
   * Removes the recipe file under `recipesDir`. Refuses while the managed runner is
   * actively running this stem (BOOTING or HEALTHY). Clears usage stats for the stem.
   */
  async deleteRecipe(
    stem: string,
  ): Promise<{ ok: true } | { ok: false; reason: "invalid" | "not_found" | "busy" }> {
    const normalized = safeRecipeStem(stem);
    if (!normalized) {
      return { ok: false, reason: "invalid" };
    }
    const abs = resolveRecipeDiskPath(this.paths.recipesDir, normalized);
    if (!abs) {
      return { ok: false, reason: "not_found" };
    }
    const snap = this.runner.snapshot();
    if (
      (snap.phase === "BOOTING" || snap.phase === "HEALTHY") &&
      snap.recipeStem === normalized
    ) {
      return { ok: false, reason: "busy" };
    }
    await fs.unlink(abs);
    if (this.recipeRunCounts[normalized] !== undefined) {
      delete this.recipeRunCounts[normalized];
      try {
        await saveUsageStatsFile(this.usageStatsPath, this.recipeRunCounts);
      } catch (e) {
        console.error(
          `[recipe-deck] failed to save recipe usage after delete: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    await this.refreshRecipes();
    return { ok: true };
  }

  getMetricsPayload(): MetricsPayload {
    return {
      disk: this.diskCache,
      gpu: this.gpuCache,
      slots: {
        [RUNNER_API_SLOT]: { tokPerSec: this.runner.tokPerSec },
      } as MetricsPayload["slots"],
    };
  }

  snapshotSlots() {
    return {
      [RUNNER_API_SLOT]: this.runner.snapshot(),
    } as DeckFullStatePayload["slots"];
  }

  /** Current runner log ring (for WebSocket snapshot on connect / reconnect). */
  getRunnerLogSnapshot(): string {
    return this.runner.ring.snapshot();
  }

  /** Shared by REST `/api/state` and WebSocket `state` broadcasts. */
  getFullState(): DeckFullStatePayload {
    return {
      listenHost: this.cfg.switcherHost,
      listenPort: this.cfg.switcherPort,
      slots: this.snapshotSlots(),
      metrics: this.getMetricsPayload(),
      recipes: this.getRecipes(),
      modelCacheProgress: this.modelCacheProgress,
      modelCachePollIntervalMs: this.cfg.modelCachePollIntervalMs,
      recipePaths: {
        sparkRoot: this.cfg.sparkVllmRoot,
        recipesDir: this.cfg.recipesDir,
        tempRunsDir: this.cfg.tempRunsDir,
        runRecipePy: this.cfg.runRecipePy,
        runRecipeSh: this.cfg.runRecipeSh,
        envFile: this.cfg.envFile,
      },
    };
  }

  /** Re-probe vLLM `/v1/models` and `docker ps` for the managed runner (e.g. after `docker stop`). */
  async refreshLiveDiscovery(): Promise<void> {
    await this.probeLiveEndpoints();
    this.broadcastState();
  }

  /**
   * Try to auto-start the last configured recipe on server startup.
   * Only runs if auto-start is enabled and the recipe file still exists.
   */
  private async tryAutoStart(): Promise<void> {
    const state = await readCurrentRecipeState();
    if (!state || !state.autoStart || !state.recipeStem) {
      return;
    }

    // Check the recipe file exists before attempting to run
    const recipeAbs =
      resolveRecipeDiskPath(this.paths.recipesDir, state.recipeStem);
    if (!recipeAbs) {
      console.error(
        `[recipe-deck] auto-start recipe not found on disk: ${state.recipeStem}`,
      );
      return;
    }

    console.info(
      `[recipe-deck] auto-starting recipe: ${state.recipeStem}`,
    );
    try {
      await this.runner.run({
        recipeStem: state.recipeStem,
        recipeAbsPath: recipeAbs,
        solo: true,
        recipeOverrides: undefined,
      });
      console.info(
        `[recipe-deck] auto-start completed for: ${state.recipeStem}`,
      );
    } catch (e) {
      console.error(
        `[recipe-deck] auto-start failed for ${state.recipeStem}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Save the current recipe state (called after a successful run). */
  async saveCurrentRecipeState(
    recipeStem: string,
    autoStart: boolean,
  ): Promise<void> {
    const { writeCurrentRecipeState } = await import("./currentRecipe.js");
    await writeCurrentRecipeState(recipeStem, autoStart);
  }

  /** Clear the current recipe state (called on stop/kill). */
  async clearCurrentRecipeState(): Promise<void> {
    const { clearCurrentRecipeState: fn } = await import("./currentRecipe.js");
    await fn();
  }

  shutdown(): void {
    if (this.diskTimer) clearInterval(this.diskTimer);
    if (this.gpuTimer) clearInterval(this.gpuTimer);
    if (this.vllmTimer) clearInterval(this.vllmTimer);
    if (this.modelCacheTimer) clearInterval(this.modelCacheTimer);
    this.runner.close();
  }
}
