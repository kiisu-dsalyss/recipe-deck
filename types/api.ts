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

/** How Recipe Deck launches a recipe. */
export type RecipeLaunchKind = "solo" | "sparkrun-cluster";

export interface RecipeListItem {
  stem: string;
  relativePath: string;
  /** First path segment under the recipe store dir for UI grouping (empty = root `.yaml` files). */
  group?: string;
  /** Set via `recipe_deck.broken` in the YAML; sorted last in lists. */
  broken?: boolean;
  /** Times this recipe was started via Recipe Deck (for list ordering). */
  runCount?: number;
  /** Solo `run-recipe.py` vs sparkrun multi-node cluster. */
  kind?: RecipeLaunchKind;
  /** From YAML `min_nodes` when present. */
  minNodes?: number | null;
  /** From YAML `runtime` when present (e.g. `vllm`). */
  runtime?: string | null;
}

export interface MetricsPayload {
  disk: { path: string; freeBytes: number; totalBytes: number } | null;
  /** Host CPU utilization (from `/proc/stat` delta). */
  cpu: CpuMetrics | null;
  gpu: GpuMetrics | null;
  slots: Record<SlotId, { tokPerSec: number | null }>;
  /** Per-cluster-host CPU/GPU (head + workers). Absent/null when cluster metrics are off or single-host. */
  hosts?: HostAccelMetrics[] | null;
}

/** CPU/GPU metrics for one cluster host (local head node or remote worker via SSH). */
export interface HostAccelMetrics {
  /** Host identifier as configured (IP or hostname). */
  id: string;
  /** Short UI label, e.g. `.100` for an IPv4 or hostname segment. */
  label: string;
  /** True when sampled locally (not via SSH). */
  local: boolean;
  cpu: CpuMetrics | null;
  gpu: GpuMetrics | null;
  /** ISO timestamp of last successful sample, or null. */
  updatedAt: string | null;
  /** Last error string when the sample failed. */
  error?: string | null;
}

export interface CpuMetrics {
  /** Host CPU utilization 0–100 from `/proc/stat` delta (null before first delta). */
  utilizationPct: number | null;
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
  /** Where weights will come from for this boot. */
  source?: "nvme" | "archive" | "huggingface";
}

/** One row from `docker ps` for operator stop controls (zombie containers). */
export interface DockerListRow {
  id: string;
  image: string;
  names: string;
  ports: string;
}

/**
 * Persisted `.current-recipe` state — recipe stem, auto-start at boot, and
 * auto-restart on unexpected exit.
 */
export interface CurrentRecipeState {
  /** The recipe stem (null if no recipe is configured). */
  recipeStem: string | null;
  /** Auto-start this recipe on Recipe Deck boot. */
  autoStart: boolean;
  /** Auto-restart on unexpected process exit (default `true`). */
  autoRestart: boolean;
}

/** @deprecated Prefer {@link CurrentRecipeState}. */
export type AutoStartState = CurrentRecipeState;

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
  /** Cold HF archive. Off by default; other hosts may have no archive disk. */
  hfArchiveEnabled: boolean;
  hfArchiveDir: string;
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
      | "RECIPE_DECK_SIMPLE_UI"
      | "HF_ARCHIVE_ENABLED"
      | "HF_ARCHIVE_DIR",
      string
    >
  >;
  restartRequired: boolean;
}
