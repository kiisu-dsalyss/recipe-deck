import type { SlotId, SlotSnapshot } from "./slot.js";

/** Resolved paths from the server (same sources as `HF_TOKEN`: `$SPARK_VLLM_ROOT/.env` + process env). */
export interface RecipeDeckPathsPayload {
  sparkRoot: string;
  recipesDir: string;
  tempRunsDir: string;
  runRecipePy: string;
  runRecipeSh: string;
  envFile: string;
}

export interface RecipeListItem {
  stem: string;
  relativePath: string;
  /** First path segment under the recipe store dir for UI grouping (empty = root `.yaml` files). */
  group?: string;
  /** Set via `recipe_deck.broken` in the YAML; sorted last in lists. */
  broken?: boolean;
  /** Times this recipe was started via Recipe Deck (for list ordering). */
  runCount?: number;
}

export interface MetricsPayload {
  disk: { path: string; freeBytes: number; totalBytes: number } | null;
  gpu: GpuMetrics | null;
  slots: Record<SlotId, { tokPerSec: number | null }>;
}

export interface GpuMetrics {
  temperatureC: number | null;
  utilizationPct: number | null;
  memUsedMiB: number | null;
  memTotalMiB: number | null;
  powerW: number | null;
  /** Number of GPUs (rows from nvidia-smi). */
  gpuCount: number | null;
  /** Per-GPU VRAM; index 0 is the first GPU. */
  perGpuMem: { usedMiB: number; totalMiB: number }[] | null;
}

/** Passed to `run-recipe.py` as `--gpu-mem`, `--tp`, etc. (see spark `run-recipe.py` override group). */
export interface RecipeRunOverrides {
  gpu_memory_utilization?: number;
  tensor_parallel?: number;
  max_model_len?: number;
  /** Sets `-e CUDA_VISIBLE_DEVICES=…` for this run only. */
  cuda_visible_devices?: string;
}

export interface HfTokenStatus {
  stored: boolean;
}

/** Model download progress vs HF hub cache (shown while the runner is BOOTING). */
export interface ModelCacheProgress {
  modelId: string;
  bytesOnDisk: number;
  bytesExpected: number | null;
  percent: number | null;
  /** When `bytesExpected` is null: short reason (HF unreachable, 403, parse error). */
  expectedSizeError?: string | null;
}

/** One row from `docker ps` for operator stop controls (zombie containers). */
export interface DockerListRow {
  id: string;
  image: string;
  names: string;
  ports: string;
}

/** Auto-start state for the current recipe (persisted in `.current-recipe`). */
export interface AutoStartState {
  /** The recipe stem configured for auto-start (null if no recipe is configured). */
  recipeStem: string | null;
  /** Whether auto-start is enabled. */
  autoStart: boolean;
}

export interface FullStatePayload {
  listenHost?: string;
  listenPort: number;
  slots: { a: SlotSnapshot };
  metrics: MetricsPayload;
  recipes: RecipeListItem[];
  modelCacheProgress?: ModelCacheProgress | null;
  modelCachePollIntervalMs?: number;
  recipePaths?: RecipeDeckPathsPayload;
}

export interface HfTokenPayload {
  stored: boolean;
  token: string | null;
}

export interface AppSettingsEffective {
  sparkVllmRoot: string;
  switcherPort: number;
  vllmPortA: number;
  python: string;
  readyRegex: string;
  healthProbeTimeoutMs: number;
  bootSigtermGraceMs: number;
  diskStatsIntervalMs: number;
  gpuStatsIntervalMs: number;
  vllmMetricsIntervalMs: number;
  simpleUi: boolean;
}

export type AppSettingsSaveBody = Omit<AppSettingsEffective, "sparkVllmRoot">;

export interface AppSettingsPayload {
  effective: AppSettingsEffective;
  saved: Partial<
    Record<
      | "SWITCHER_PORT"
      | "VLLM_PORT"
      | "PYTHON"
      | "READY_REGEX"
      | "HEALTH_PROBE_TIMEOUT_MS"
      | "BOOT_SIGTERM_GRACE_MS"
      | "DISK_STATS_INTERVAL_MS"
      | "GPU_STATS_INTERVAL_MS"
      | "VLLM_METRICS_INTERVAL_MS"
      | "RECIPE_DECK_SIMPLE_UI",
      string
    >
  >;
  restartRequired: boolean;
}
