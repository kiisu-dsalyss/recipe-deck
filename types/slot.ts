/**
 * Wire id for the single managed vLLM runner. JSON still uses this key (`slots.a`, `slot` in POST bodies,
 * WebSocket `log.slot`) for backward compatibility — there is no second runner.
 */
export type SlotId = "a";

/** Canonical API id for the single runner (same as the only `SlotId`). */
export const RUNNER_API_SLOT = "a" as const satisfies SlotId;

export type SlotPhase = "IDLE" | "BOOTING" | "HEALTHY" | "ERROR";

/** From `docker ps` for the container publishing the runner’s listen port. */
export interface DockerContainerInfo {
  image: string;
  containerName: string;
}

/** Gauges from vLLM `GET /metrics` (best-effort; only while HEALTHY). */
export interface VllmLiveStats {
  /**
   * GPU / KV-cache usage fraction 0–1 (Prometheus: `gpu_cache_usage_perc` or `kv_cache_usage_perc`).
   */
  gpuCacheUsageFrac: number | null;
  /** CPU KV-cache usage fraction 0–1 when exported (older vLLM; often absent on V1). */
  cpuCacheUsageFrac: number | null;
  /**
   * Prefix hit rate 0–1 from GPU-named / generic gauges or V1 counters — not `cpu_prefix_cache_hit_rate`
   * (that gauge is {@link cpuPrefixCacheHitRateFrac} only).
   */
  gpuPrefixCacheHitRateFrac: number | null;
  /** `cpu_prefix_cache_hit_rate` gauge when present (else use {@link gpuPrefixCacheHitRateFrac}). */
  cpuPrefixCacheHitRateFrac: number | null;
  /** P95 time to first token (seconds) from summary or histogram; null if not exported. */
  timeToFirstTokenP95Seconds: number | null;
  numRequestsRunning: number | null;
  numRequestsWaiting: number | null;
  /** `num_requests_swapped` gauge when present. */
  numRequestsSwapped: number | null;
  promptTokensTotal: number | null;
  generationTokensTotal: number | null;
}

export interface SlotSnapshot {
  /** Same as {@link RUNNER_API_SLOT} (only one runner exists). */
  slot: SlotId;
  phase: SlotPhase;
  port: number;
  /** Recipe stem chosen when this run was started (Recipe Deck–managed runs). */
  recipeStem: string | null;
  /**
   * Hugging Face repo id from YAML `model:` at run start (e.g. `google/gemma-4-26B-A4B-it`).
   * Used for hub cache progress while BOOTING.
   */
  recipeModelId: string | null;
  recipePath: string | null;
  /**
   * One-line summary from the YAML on disk + CLI overrides (set at run start).
   */
  recipeLaunchHint: string | null;
  /**
   * Set when spark-vllm-docker log indicates an existing container was reused
   * (e.g. "Skipping launch") so this run may not get an isolated recipe.
   */
  containerReuseWarning: string | null;
  /**
   * Model IDs reported by vLLM OpenAI API (`GET /v1/models`) while HEALTHY.
   * Filled by autodiscovery; null if not yet probed or endpoint unavailable.
   */
  servedModels: string[] | null;
  /** Populated while BOOTING/HEALTHY when `docker ps` matches the runner’s port. */
  docker: DockerContainerInfo | null;
  pid: number | null;
  bootElapsedMs: number | null;
  lastError: string | null;
  exitCode: number | null;
  tokPerSec: number | null;
  /** Latest Prometheus scrape for the runner (null when not HEALTHY or unavailable). */
  liveStats: VllmLiveStats | null;
}
