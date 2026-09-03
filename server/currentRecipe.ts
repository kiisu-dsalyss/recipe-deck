import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CurrentRecipeState } from "../types/api.js";

/**
 * Resolve the repo root from this file's module path.
 * Same pattern as server/main.ts.
 */
function repoRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  /**
   * In dev: `server/currentRecipe.ts` → go up one → repo root
   * In prod: `dist/server/currentRecipe.js` → go up two → repo root
   * Heuristic: if the parent directory is `dist`, we're inside dist/.
   */
  const parentDir = path.basename(path.dirname(moduleDir));
  return parentDir === "dist"
    ? path.join(moduleDir, "..", "..")
    : path.join(moduleDir, "..");
}

/** Absolute path to the app's .current-recipe state file. */
const STATE_PATH = path.join(repoRoot(), ".current-recipe");

function parseBoolValue(value: string): boolean {
  return value === "true" || value === "1" || value.toLowerCase() === "yes";
}

/** Parse `.current-recipe` KEY=VAL text. Null if there is no stem. */
export function parseCurrentRecipeText(raw: string): CurrentRecipeState | null {
  const lines = raw.split(/\r?\n/);
  let recipeStem: string | null = null;
  let autoStart = false;
  /** Default: on (matches operator expectation — crash auto-restart is enabled unless explicitly disabled). */
  let autoRestart = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    if (key === "CURRENT_RECIPE" && value.length > 0) {
      recipeStem = value;
    } else if (key === "AUTOSTART_CURRENT_RECIPE") {
      autoStart = parseBoolValue(value);
    } else if (key === "AUTORESTART_CURRENT_RECIPE") {
      autoRestart = parseBoolValue(value);
    }
  }

  if (!recipeStem) {
    return null;
  }

  return { recipeStem, autoStart, autoRestart };
}

/**
 * Read the current recipe state from `.current-recipe`.
 * Returns null state if the file doesn't exist or is empty.
 */
export async function readCurrentRecipeState(): Promise<CurrentRecipeState | null> {
  let raw: string;
  try {
    raw = await fs.readFile(STATE_PATH, "utf8");
  } catch {
    return null;
  }
  return parseCurrentRecipeText(raw);
}

/**
 * Write the current recipe state to `.current-recipe`.
 * Creates the file if it doesn't exist, overwrites if it does.
 * Uses atomic write (tmp + rename) for safety.
 */
export async function writeCurrentRecipeState(
  recipeStem: string,
  autoStart: boolean,
  autoRestart: boolean,
): Promise<void> {
  const autoStr = autoStart ? "true" : "false";
  const restartStr = autoRestart ? "true" : "false";
  const body =
    `CURRENT_RECIPE=${recipeStem}\n` +
    `AUTOSTART_CURRENT_RECIPE=${autoStr}\n` +
    `AUTORESTART_CURRENT_RECIPE=${restartStr}\n`;
  const tmp = `${STATE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, STATE_PATH);
}

/**
 * Clear (remove) the current recipe state file.
 * Called when a recipe is stopped or force-killed.
 */
export async function clearCurrentRecipeState(): Promise<void> {
  try {
    await fs.unlink(STATE_PATH);
  } catch {
    // File doesn't exist — that's fine
  }
}

/**
 * Update only the auto-start flag for the current recipe.
 * Keeps the existing recipe stem and auto-restart flag.
 */
export async function updateCurrentRecipeAutoStart(
  autoStart: boolean,
): Promise<void> {
  const existing = await readCurrentRecipeState();
  if (!existing || !existing.recipeStem) {
    return;
  }
  await writeCurrentRecipeState(
    existing.recipeStem,
    autoStart,
    existing.autoRestart,
  );
}

/**
 * Update only the auto-restart flag for the current recipe.
 * Keeps the existing recipe stem and auto-start flag.
 */
export async function updateCurrentRecipeAutoRestart(
  autoRestart: boolean,
): Promise<void> {
  const existing = await readCurrentRecipeState();
  if (!existing || !existing.recipeStem) {
    return;
  }
  await writeCurrentRecipeState(
    existing.recipeStem,
    existing.autoStart,
    autoRestart,
  );
}
