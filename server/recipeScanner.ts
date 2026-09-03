import { existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parseRecipeBroken } from "./recipeDeckMeta.js";
import { probeRecipeYaml } from "./recipeProbe.js";
import type { RecipeListItem } from "../types/index.js";

/** Allowed path segment (filename or directory name under `recipes/`). */
const SEG = /^[a-zA-Z0-9._-]+$/;

/**
 * Validate a recipe stem: relative path under `recipes/` without extension,
 * e.g. `my-recipe` or `cluster/qwen3.5-122b-fp8`. No `..`, no leading `/`.
 */
export function safeRecipeStem(stem: string): string | null {
  const t = stem.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!t || t.includes("..")) {
    return null;
  }
  const parts = t.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  for (const p of parts) {
    if (!SEG.test(p)) {
      return null;
    }
  }
  return parts.join("/");
}

export async function listRecipes(recipesDir: string): Promise<RecipeListItem[]> {
  const items: RecipeListItem[] = [];
  async function walk(dir: string, relPrefix: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) {
        continue;
      }
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, rel);
      } else if (/\.(yaml|yml)$/i.test(ent.name)) {
        const stem = rel.replace(/\.(yaml|yml)$/i, "").replace(/\\/g, "/");
        const storeLabel = path.basename(path.resolve(recipesDir));
        const relPath = path.join(storeLabel, rel).replace(/\\/g, "/");
        const group = stem.includes("/") ? stem.slice(0, stem.indexOf("/")) : "";
        items.push({ stem, relativePath: relPath, group, broken: false });
      }
    }
  }
  await walk(recipesDir, "");
  for (const item of items) {
    const abs = resolveRecipeDiskPath(recipesDir, item.stem);
    if (abs) {
      try {
        const c = await readRecipeFile(abs);
        item.broken = parseRecipeBroken(c);
        const probe = probeRecipeYaml(c);
        item.kind = probe.kind;
        item.minNodes = probe.minNodes;
        item.runtime = probe.runtime;
      } catch {
        item.broken = false;
      }
    }
  }
  return items.sort((a, b) => a.stem.localeCompare(b.stem));
}

export async function readRecipeFile(absPath: string): Promise<string> {
  return fs.readFile(absPath, "utf8");
}

function isUnderRecipesRoot(recipesDir: string, candidate: string): boolean {
  const rootResolved = path.resolve(recipesDir);
  const p = path.resolve(candidate);
  return p === rootResolved || p.startsWith(rootResolved + path.sep);
}

/** Existing file on disk: prefers `.yaml`, then `.yml` in the same folder. */
export function resolveRecipeDiskPath(recipesDir: string, stem: string): string | null {
  const normalized = safeRecipeStem(stem);
  if (!normalized) {
    return null;
  }
  const parts = normalized.split("/");
  const baseName = parts[parts.length - 1];
  const dir = path.join(recipesDir, ...parts.slice(0, -1));
  const y1 = path.resolve(path.join(dir, `${baseName}.yaml`));
  const y2 = path.resolve(path.join(dir, `${baseName}.yml`));
  if (!isUnderRecipesRoot(recipesDir, y1)) {
    return null;
  }
  if (existsSync(y1)) {
    return y1;
  }
  if (existsSync(y2)) {
    return y2;
  }
  return null;
}

/** Target path for create/update (always writes `.yaml`). */
export function recipeSavePath(recipesDir: string, stem: string): string | null {
  const normalized = safeRecipeStem(stem);
  if (!normalized) {
    return null;
  }
  const parts = normalized.split("/");
  const resolved = path.resolve(
    path.join(recipesDir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.yaml`),
  );
  if (!isUnderRecipesRoot(recipesDir, resolved)) {
    return null;
  }
  return resolved;
}
