import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DockerImageAliasPair } from "./dockerImageAliases.types.js";

export type { DockerImageAliasPair } from "./dockerImageAliases.types.js";

const execFileAsync = promisify(execFile);

/** Docker image refs only — avoids shell injection from env. */
const IMAGE_REF_RE = /^[a-zA-Z0-9._/@:-]+$/;

function safeImageRef(s: string): boolean {
  return s.length > 0 && s.length <= 256 && IMAGE_REF_RE.test(s);
}

/**
 * Parse `DOCKER_IMAGE_ALIASES` from env.
 *
 * Format: comma-separated `TARGET=SOURCE` pairs (same order as `docker tag SOURCE TARGET`).
 * Example: `vllm-sidekick=vllm-node-tf5` or `sidekick=vllm-node-tf5:latest,other=my/base:1`
 */
export function parseDockerImageAliases(raw: string | undefined): DockerImageAliasPair[] {
  if (!raw?.trim()) return [];
  const out: DockerImageAliasPair[] = [];
  for (const segment of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const eq = segment.indexOf("=");
    if (eq <= 0) continue;
    const target = segment.slice(0, eq).trim();
    const source = segment.slice(eq + 1).trim();
    if (!safeImageRef(target) || !safeImageRef(source)) continue;
    out.push({ source, target });
  }
  return out;
}

/** spark-vllm-docker default TF5 image name (sidekick recipes use a distinct `container:` tag). */
const BUILTIN_SIDEKICK_SOURCE = "vllm-node-tf5";
const BUILTIN_SIDEKICK_TARGET = "vllm-sidekick";

/**
 * Env `DOCKER_IMAGE_ALIASES` plus an optional built-in `vllm-node-tf5` → `vllm-sidekick` so
 * sidekick recipes work without extra config. Disable with `DISABLE_SIDEKICK_IMAGE_ALIAS=1`.
 */
export function resolveDockerImageAliases(
  raw: string | undefined,
  disableBuiltin: boolean,
): DockerImageAliasPair[] {
  const explicit = parseDockerImageAliases(raw);
  if (disableBuiltin) {
    return explicit;
  }
  const hasSidekickTarget = explicit.some(
    (p) =>
      p.target === BUILTIN_SIDEKICK_TARGET ||
      p.target.startsWith(`${BUILTIN_SIDEKICK_TARGET}:`),
  );
  if (hasSidekickTarget) {
    return explicit;
  }
  return [
    ...explicit,
    {
      source: BUILTIN_SIDEKICK_SOURCE,
      target: BUILTIN_SIDEKICK_TARGET,
      optional: true,
    },
  ];
}

/**
 * Idempotent: `docker tag source target` for each pair so recipe `container:` names resolve
 * without building (spark run-recipe.py image checks).
 */
export async function ensureDockerImageAliases(
  pairs: DockerImageAliasPair[],
): Promise<void> {
  for (const { source, target, optional } of pairs) {
    try {
      await execFileAsync("docker", ["tag", source, target], {
        timeout: 120_000,
        maxBuffer: 256 * 1024,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (optional) {
        console.warn(
          `[recipe-deck] optional docker tag skipped (${source} → ${target}): ${msg}`,
        );
        continue;
      }
      throw new Error(
        `docker tag ${source} ${target} failed: ${msg}. ` +
          `Fix: ensure the source image exists (docker images), or run manually: docker tag ${source} ${target}. ` +
          `Recipes that use container: ${target} require DOCKER_IMAGE_ALIASES=${target}=${source} so run-recipe.py does not prompt (non-interactive).`,
      );
    }
  }
}
