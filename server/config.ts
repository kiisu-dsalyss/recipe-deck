import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { resolveDockerImageAliases } from "./dockerImageAliases.js";
import type { AppConfig } from "./config.types.js";

export type { AppConfig } from "./config.types.js";

loadDotenv();

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function optionalPath(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (v === undefined || v === "") return undefined;
  return path.resolve(v);
}

/**
 * Default `0.0.0.0` so the UI is reachable on the LAN (typical homelab). Set
 * `SWITCHER_HOST=127.0.0.1` to listen on loopback only (e.g. SSH tunnel + local browser).
 */
function listenHost(): string {
  const raw = process.env.SWITCHER_HOST?.trim();
  if (raw === undefined || raw === "") {
    return "0.0.0.0";
  }
  return raw;
}

function requireRoot(): string {
  const r = process.env.SPARK_VLLM_ROOT;
  if (!r) {
    throw new Error("SPARK_VLLM_ROOT is required");
  }
  return path.resolve(r);
}

/** Absolute path from env `name`, or `defaultAbs` when unset/empty. */
function resolvedPathEnv(name: string, defaultAbs: string): string {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") {
    return defaultAbs;
  }
  return path.resolve(raw);
}

export function loadConfig(): AppConfig {
  const sparkVllmRoot = requireRoot();
  /** Prefer keys from the spark checkout `.env` (same file as HF_TOKEN) over cwd `.env`. */
  loadDotenv({ path: path.join(sparkVllmRoot, ".env"), override: true });

  const envFile = path.join(sparkVllmRoot, ".env");
  const recipesDir = resolvedPathEnv(
    "RECIPE_DECK_RECIPES_DIR",
    path.join(sparkVllmRoot, "recipes"),
  );
  const tempRunsDir = resolvedPathEnv(
    "RECIPE_DECK_TEMP_DIR",
    path.join(sparkVllmRoot, ".recipe-deck-tmp"),
  );
  const runRecipePy = resolvedPathEnv(
    "RUN_RECIPE_PY",
    path.join(sparkVllmRoot, "run-recipe.py"),
  );
  const runRecipeSh = resolvedPathEnv(
    "RUN_RECIPE_SH",
    path.join(sparkVllmRoot, "run-recipe.sh"),
  );

  const defaultLogDir = path.join(
    process.env.HOME ?? process.cwd(),
    ".local/share/recipe-deck/logs",
  );

  const readyRaw = process.env.READY_REGEX ?? "Uvicorn running|Application startup complete";
  return {
    sparkVllmRoot,
    recipesDir,
    tempRunsDir,
    runRecipePy,
    runRecipeSh,
    envFile,
    python: process.env.PYTHON ?? "python3",
    switcherHost: listenHost(),
    switcherPort: int("SWITCHER_PORT", 3000),
    vllmPortA: int("VLLM_PORT", 8000),
    readyRegex: new RegExp(readyRaw),
    maxLogLines: int("MAX_LOG_LINES", 4000),
    maxLogBytes: int("MAX_LOG_BYTES", 2_000_000),
    diskStatsIntervalMs: int("DISK_STATS_INTERVAL_MS", 45_000),
    gpuStatsIntervalMs: int("GPU_STATS_INTERVAL_MS", 10_000),
    vllmMetricsIntervalMs: int("VLLM_METRICS_INTERVAL_MS", 5000),
    logDir: process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : defaultLogDir,
    logMaxFileMb: int("LOG_MAX_FILE_MB", 32),
    logMaxFiles: int("LOG_MAX_FILES", 8),
    runRecipeUseShellWrapper: bool("RUN_RECIPE_USE_SHELL_WRAPPER", false),
    healthProbeTimeoutMs: int("HEALTH_PROBE_TIMEOUT_MS", 600_000),
    bootSigtermGraceMs: int("BOOT_SIGTERM_GRACE_MS", 15_000),
    dockerImageAliases: resolveDockerImageAliases(
      process.env.DOCKER_IMAGE_ALIASES,
      bool("DISABLE_SIDEKICK_IMAGE_ALIAS", false),
    ),
    hfHubCacheDir: (() => {
      const explicit = optionalPath("HF_HUB_CACHE");
      if (explicit) {
        return explicit;
      }
      const hfHome = process.env.HF_HOME?.trim();
      if (hfHome) {
        return path.join(path.resolve(hfHome), "hub");
      }
      const home = process.env.HOME ?? process.cwd();
      return path.join(home, ".cache", "huggingface", "hub");
    })(),
    modelCachePollIntervalMs: int("MODEL_CACHE_POLL_MS", 2000),
  };
}
