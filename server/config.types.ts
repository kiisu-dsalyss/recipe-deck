import type { DockerImageAliasPair } from "./dockerImageAliases.types.js";

export interface AppConfig {
  sparkVllmRoot: string;
  /** Absolute directory containing `*.yaml` recipes (default `$SPARK_VLLM_ROOT/recipes`). */
  recipesDir: string;
  /** Temp YAML copies for runs; default `$SPARK_VLLM_ROOT/.recipe-deck-tmp`. */
  tempRunsDir: string;
  /** Path to `run-recipe.py` (default `$SPARK_VLLM_ROOT/run-recipe.py`). */
  runRecipePy: string;
  /** Path to `run-recipe.sh` (default `$SPARK_VLLM_ROOT/run-recipe.sh`). */
  runRecipeSh: string;
  /** Same file Recipe Deck merges `HF_TOKEN` into (always `$SPARK_VLLM_ROOT/.env`). */
  envFile: string;
  python: string;
  /** HTTP bind address (default `0.0.0.0`). Set `127.0.0.1` for loopback only. */
  switcherHost: string;
  switcherPort: number;
  vllmPortA: number;
  readyRegex: RegExp;
  maxLogLines: number;
  maxLogBytes: number;
  diskStatsIntervalMs: number;
  gpuStatsIntervalMs: number;
  vllmMetricsIntervalMs: number;
  logDir: string;
  logMaxFileMb: number;
  logMaxFiles: number;
  runRecipeUseShellWrapper: boolean;
  healthProbeTimeoutMs: number;
  bootSigtermGraceMs: number;
  /**
   * Before each `run-recipe.py` launch, run `docker tag source target` for each pair
   * so recipe `container:` can reference a distinct tag (parallel sidekick pattern).
   */
  dockerImageAliases: DockerImageAliasPair[];
  /**
   * Hugging Face hub cache root (contains `models--*`). Default: `~/.cache/huggingface/hub`
   * or `$HF_HOME/hub` when set.
   */
  hfHubCacheDir: string;
  /** How often to refresh on-disk vs expected model size while a slot is BOOTING (default 2000). */
  modelCachePollIntervalMs: number;
}
