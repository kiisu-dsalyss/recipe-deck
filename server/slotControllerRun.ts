import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Paths } from "./paths.js";
import { ensureDir } from "./paths.js";
import { loadEnvKeyValue } from "./envMerge.js";
import {
  injectHfTokenIntoRecipeYaml,
  resolveHfTokenForRecipe,
} from "./recipeHfTokenMerge.js";
import { probeRecipeYaml, type RecipeProbeResult } from "./recipeProbe.js";
import type { RecipeLaunchKind, SlotId } from "../types/index.js";
import {
  buildLaunchHint,
  pushRecipeOverrideArgs,
} from "./slotControllerSpawn.js";
import type { SlotRunOpts } from "./slotController.types.js";

/**
 * Resolve the YAML text (raw or buffer), merge HF_TOKEN if needed, and materialize
 * a temp YAML file when the effective YAML differs from the on-disk one.
 * Returns the argument to pass to `run-recipe.py` / `sparkrun run` and the probe.
 */
export async function prepareRunYaml(opts: {
  runOpts: SlotRunOpts;
  paths: Paths;
  slot: SlotId;
}): Promise<{
  recipeArg: string;
  rawYaml: string;
  mergedYaml: string | null;
  probe: RecipeProbeResult;
}> {
  let rawYaml = opts.runOpts.bufferYaml;
  if (rawYaml === undefined) {
    rawYaml = await fs.readFile(opts.runOpts.recipeAbsPath, "utf8");
  }
  const hfTok = await resolveHfTokenForRecipe(opts.paths);
  const mergedYaml = injectHfTokenIntoRecipeYaml(rawYaml, hfTok);
  const yamlText = mergedYaml ?? rawYaml;

  let recipeArg: string;
  if (opts.runOpts.bufferYaml !== undefined || mergedYaml !== null) {
    ensureDir(opts.paths.tempRunsDir);
    recipeArg = path.join(
      opts.paths.tempRunsDir,
      `run-${opts.slot}-${Date.now()}.yaml`,
    );
    await fs.writeFile(recipeArg, yamlText, "utf8");
  } else {
    recipeArg = opts.runOpts.recipeAbsPath;
  }

  return { recipeArg, rawYaml: yamlText, mergedYaml, probe: probeRecipeYaml(yamlText) };
}

/** Compose exe/args for a solo or sparkrun-cluster launch. */
export function buildRunArgv(opts: {
  runOpts: SlotRunOpts;
  cfg: AppConfig;
  paths: Paths;
  launchKind: RecipeLaunchKind;
  recipeArg: string;
  listenPort: number;
}): { exe: string; args: string[] } {
  const { runOpts, cfg, paths, launchKind, recipeArg, listenPort } = opts;
  if (launchKind === "sparkrun-cluster") {
    return {
      exe: cfg.sparkrunBin,
      args: [...cfg.sparkrunExtraArgs, "run", recipeArg],
    };
  }
  const args: string[] = [];
  let exe: string;
  if (cfg.runRecipeUseShellWrapper) {
    exe = paths.runRecipeSh;
    args.push(recipeArg, "--port", String(listenPort));
  } else {
    exe = cfg.python;
    args.push(paths.runRecipePy, recipeArg, "--port", String(listenPort));
  }
  if (runOpts.solo) {
    args.push("--solo");
  }
  pushRecipeOverrideArgs(args, runOpts.recipeOverrides);
  return { exe, args };
}

/** Environment merged from `process.env` + spark `.env` (HF_TOKEN etc.). */
export async function buildRunEnv(paths: Paths): Promise<NodeJS.ProcessEnv> {
  const base = { ...process.env } as NodeJS.ProcessEnv;
  const fromFile = await loadEnvKeyValue(paths.envFile);
  for (const [k, v] of Object.entries(fromFile)) {
    base[k] = v;
  }
  return base;
}

export interface LaunchHint {
  hintParts: string[];
  argvDisplay: string;
  recipeLaunchHint: string;
}

export function launchHint(opts: {
  probe: RecipeProbeResult;
  runOpts: SlotRunOpts;
  exe: string;
  args: string[];
  launchKind: RecipeLaunchKind;
  listenPort: number;
}): LaunchHint {
  const { hintParts, argvDisplay, recipeLaunchHint } = buildLaunchHint(
    opts.probe,
    opts.runOpts.recipeOverrides,
    opts.exe,
    opts.args,
    { kind: opts.launchKind, port: opts.listenPort },
  );
  return { hintParts, argvDisplay, recipeLaunchHint };
}

/** spawn(exe, args, detached child with piped stdout/stderr). */
export function spawnChild(opts: {
  exe: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}): ChildProcess {
  return spawn(opts.exe, opts.args, {
    env: opts.env,
    cwd: opts.cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
