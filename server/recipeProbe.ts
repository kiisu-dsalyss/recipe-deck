/**
 * Lightweight parse of recipe YAML text for debugging (no full YAML dependency).
 * Used to confirm which model/container/gpu_mem the file on disk contains and to
 * decide whether Recipe Deck should launch a solo `run-recipe.py` or a
 * `sparkrun run` cluster workload.
 */
import type { RecipeLaunchKind } from "../types/index.js";

function stripYamlComment(s: string): string {
  const i = s.indexOf("#");
  if (i < 0) return s.trim();
  return s.slice(0, i).trim();
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/gu, "").trim();
}

export interface RecipeProbeResult {
  model: string | null;
  container: string | null;
  gpuMemDefault: string | null;
  recipeVersion: string | null;
  minNodes: number | null;
  runtime: string | null;
  /** Listen port from YAML `port:` when present (top-level or nested). */
  port: number | null;
  kind: RecipeLaunchKind;
}

/**
 * Decide the launch kind from probe metadata.
 * Cluster if `min_nodes > 1`, OR sparkrun v2 (recipe_version `2`/`2.0` and non-empty runtime).
 */
export function classifyRecipeLaunch(opts: {
  minNodes: number | null;
  recipeVersion: string | null;
  runtime: string | null;
}): RecipeLaunchKind {
  if (opts.minNodes != null && opts.minNodes > 1) {
    return "sparkrun-cluster";
  }
  if (
    (opts.recipeVersion === "2" || opts.recipeVersion === "2.0") &&
    opts.runtime != null &&
    opts.runtime.length > 0
  ) {
    return "sparkrun-cluster";
  }
  return "solo";
}

export function probeRecipeYaml(content: string): RecipeProbeResult {
  const modelM = content.match(/^model:\s*(.+)$/m);
  const containerM = content.match(/^container:\s*(.+)$/m);
  const model =
    modelM?.[1] != null ? stripQuotes(stripYamlComment(modelM[1])) : null;
  const container =
    containerM?.[1] != null
      ? stripQuotes(stripYamlComment(containerM[1]))
      : null;
  // Do not anchor to EOL: values often have trailing `# comment` (e.g. under defaults:).
  const gpuMemDefault =
    content.match(/^\s*gpu_memory_utilization:\s*([0-9.]+)/m)?.[1] ?? null;

  const recipeVersionRaw =
    content.match(/^recipe_version:\s*(.+)$/m)?.[1] ?? null;
  const recipeVersion =
    recipeVersionRaw != null
      ? stripQuotes(stripYamlComment(recipeVersionRaw))
      : null;

  const minNodesRaw = content.match(/^min_nodes:\s*(\d+)/m)?.[1];
  const minNodesParsed =
    minNodesRaw != null ? Number.parseInt(minNodesRaw, 10) : null;
  const minNodes =
    minNodesParsed != null && Number.isFinite(minNodesParsed)
      ? minNodesParsed
      : null;

  const runtimeRaw = content.match(/^runtime:\s*(.+)$/m)?.[1] ?? null;
  const runtime =
    runtimeRaw != null ? stripQuotes(stripYamlComment(runtimeRaw)) : null;

  const portRaw =
    content.match(/^port:\s*(\d+)/m)?.[1] ??
    content.match(/^\s+port:\s*(\d+)/m)?.[1] ??
    null;
  const portParsed = portRaw != null ? Number.parseInt(portRaw, 10) : null;
  const port =
    portParsed != null && Number.isFinite(portParsed) ? portParsed : null;

  const kind = classifyRecipeLaunch({
    minNodes,
    recipeVersion,
    runtime,
  });

  return {
    model: model || null,
    container: container || null,
    gpuMemDefault: gpuMemDefault || null,
    recipeVersion,
    minNodes,
    runtime,
    port,
    kind,
  };
}
