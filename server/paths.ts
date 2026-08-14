import fs from "node:fs";
import type { AppConfig } from "./config.js";
import type { Paths } from "./paths.types.js";

export type { Paths } from "./paths.types.js";

/** Resolved paths from env + `SPARK_VLLM_ROOT` (see `loadConfig`). */
export function buildPaths(cfg: AppConfig): Paths {
  return {
    sparkRoot: cfg.sparkVllmRoot,
    recipesDir: cfg.recipesDir,
    runRecipePy: cfg.runRecipePy,
    runRecipeSh: cfg.runRecipeSh,
    envFile: cfg.envFile,
    tempRunsDir: cfg.tempRunsDir,
  };
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}
