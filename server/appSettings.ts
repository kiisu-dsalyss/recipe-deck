import type { AppConfig } from "./config.js";
import type { AppSettingsEffective } from "../types/api.js";

export type { AppSettingsEffective } from "../types/api.js";

/** Keys written to `$SPARK_VLLM_ROOT/.env` for Recipe Deck. */
export const APP_SETTINGS_ENV_KEYS = [
  "SWITCHER_PORT",
  "VLLM_PORT",
  "PYTHON",
  "READY_REGEX",
  "HEALTH_PROBE_TIMEOUT_MS",
  "BOOT_SIGTERM_GRACE_MS",
  "DISK_STATS_INTERVAL_MS",
  "GPU_STATS_INTERVAL_MS",
  "VLLM_METRICS_INTERVAL_MS",
  /** Client UI only; read from disk for GET /api/settings/app (no restart). */
  "RECIPE_DECK_SIMPLE_UI",
] as const;

export type AppSettingsEnvKey = (typeof APP_SETTINGS_ENV_KEYS)[number];

export function pickAppSettingsFromFile(
  savedAll: Record<string, string>,
): Partial<Record<AppSettingsEnvKey, string>> {
  const out: Partial<Record<AppSettingsEnvKey, string>> = {};
  for (const k of APP_SETTINGS_ENV_KEYS) {
    if (savedAll[k] !== undefined) {
      out[k] = savedAll[k]!;
    }
  }
  return out;
}

export function appSettingsEffective(cfg: AppConfig): AppSettingsEffective {
  return {
    sparkVllmRoot: cfg.sparkVllmRoot,
    switcherPort: cfg.switcherPort,
    vllmPortA: cfg.vllmPortA,
    python: cfg.python,
    readyRegex: cfg.readyRegex.source,
    healthProbeTimeoutMs: cfg.healthProbeTimeoutMs,
    bootSigtermGraceMs: cfg.bootSigtermGraceMs,
    diskStatsIntervalMs: cfg.diskStatsIntervalMs,
    gpuStatsIntervalMs: cfg.gpuStatsIntervalMs,
    vllmMetricsIntervalMs: cfg.vllmMetricsIntervalMs,
    simpleUi: false,
  };
}

function parseSimpleUiFromSaved(saved: Record<string, string>): boolean {
  const raw = saved["RECIPE_DECK_SIMPLE_UI"];
  if (raw === undefined) return false;
  const v = raw.trim();
  if (v === "") return false;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

/** Effective settings including UI flags read from the saved `.env` file on disk. */
export function appSettingsEffectiveWithSaved(
  cfg: AppConfig,
  savedAll: Record<string, string>,
): AppSettingsEffective {
  return {
    ...appSettingsEffective(cfg),
    simpleUi: parseSimpleUiFromSaved(savedAll),
  };
}

/** True when `$SPARK_VLLM_ROOT/.env` differs from what this process was started with. */
export function appSettingsRestartRequired(
  cfg: AppConfig,
  saved: Record<string, string>,
): boolean {
  const g = (key: string, val: number | string): boolean => {
    if (saved[key] === undefined) return false;
    return saved[key] !== String(val);
  };
  return (
    g("SWITCHER_PORT", cfg.switcherPort) ||
    g("VLLM_PORT", cfg.vllmPortA) ||
    g("PYTHON", cfg.python) ||
    g("READY_REGEX", cfg.readyRegex.source) ||
    g("HEALTH_PROBE_TIMEOUT_MS", cfg.healthProbeTimeoutMs) ||
    g("BOOT_SIGTERM_GRACE_MS", cfg.bootSigtermGraceMs) ||
    g("DISK_STATS_INTERVAL_MS", cfg.diskStatsIntervalMs) ||
    g("GPU_STATS_INTERVAL_MS", cfg.gpuStatsIntervalMs) ||
    g("VLLM_METRICS_INTERVAL_MS", cfg.vllmMetricsIntervalMs)
  );
}

function num(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function str(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (typeof v !== "string") return null;
  return v;
}

export function parseAppSettingsPost(
  body: unknown,
): { ok: true; updates: Record<string, string> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "expected JSON object" };
  }
  const b = body as Record<string, unknown>;

  const switcherPort = num(b, "switcherPort");
  const vllmPortA = num(b, "vllmPortA");
  const python = str(b, "python");
  const readyRegex = str(b, "readyRegex");
  const healthProbeTimeoutMs = num(b, "healthProbeTimeoutMs");
  const bootSigtermGraceMs = num(b, "bootSigtermGraceMs");
  const diskStatsIntervalMs = num(b, "diskStatsIntervalMs");
  const gpuStatsIntervalMs = num(b, "gpuStatsIntervalMs");
  const vllmMetricsIntervalMs = num(b, "vllmMetricsIntervalMs");
  const simpleUiRaw = b.simpleUi;
  if (typeof simpleUiRaw !== "boolean") {
    return { ok: false, error: "simpleUi must be boolean" };
  }

  if (
    switcherPort === null ||
    vllmPortA === null ||
    python === null ||
    readyRegex === null ||
    healthProbeTimeoutMs === null ||
    bootSigtermGraceMs === null ||
    diskStatsIntervalMs === null ||
    gpuStatsIntervalMs === null ||
    vllmMetricsIntervalMs === null
  ) {
    return { ok: false, error: "missing or invalid fields" };
  }

  const portOk = (p: number) => p >= 1 && p <= 65535;
  if (!portOk(switcherPort) || !portOk(vllmPortA)) {
    return { ok: false, error: "ports must be 1–65535" };
  }
  if (switcherPort === vllmPortA) {
    return { ok: false, error: "Recipe Deck HTTP port and vLLM port must differ" };
  }
  if (!python.trim()) {
    return { ok: false, error: "PYTHON is required" };
  }
  try {
    void new RegExp(readyRegex);
  } catch {
    return { ok: false, error: "READY_REGEX is not a valid JavaScript regexp" };
  }
  if (
    healthProbeTimeoutMs < 1000 ||
    bootSigtermGraceMs < 0 ||
    diskStatsIntervalMs < 1000 ||
    gpuStatsIntervalMs < 1000 ||
    vllmMetricsIntervalMs < 500
  ) {
    return { ok: false, error: "timeouts/intervals out of range" };
  }

  return {
    ok: true,
    updates: {
      SWITCHER_PORT: String(switcherPort),
      VLLM_PORT: String(vllmPortA),
      PYTHON: python.trim(),
      READY_REGEX: readyRegex,
      HEALTH_PROBE_TIMEOUT_MS: String(healthProbeTimeoutMs),
      BOOT_SIGTERM_GRACE_MS: String(bootSigtermGraceMs),
      DISK_STATS_INTERVAL_MS: String(diskStatsIntervalMs),
      GPU_STATS_INTERVAL_MS: String(gpuStatsIntervalMs),
      VLLM_METRICS_INTERVAL_MS: String(vllmMetricsIntervalMs),
      RECIPE_DECK_SIMPLE_UI: simpleUiRaw ? "true" : "false",
    },
  };
}
