import type { Express, Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import type { DeckService } from "../deckService.js";
import {
  mergeEnvKeysIntoEnvFile,
  mergeHfTokenIntoEnvFile,
  readHfTokenFromFile,
  removeHfTokenFromEnvFile,
  loadEnvKeyValue,
} from "../envMerge.js";
import {
  appSettingsEffectiveWithSaved,
  appSettingsRestartRequired,
  parseAppSettingsPost,
  pickAppSettingsFromFile,
} from "../appSettings.js";
import { applyBrokenToYaml, mergeRecipeDeckFromExisting } from "../recipeDeckMeta.js";
import {
  readRecipeFile,
  recipeSavePath,
  resolveRecipeDiskPath,
  safeRecipeStem,
} from "../recipeScanner.js";
import { modsExistenceResults } from "../modsPaths.js";
import { scheduleRestartAfterResponse } from "../restartSelf.js";
import { ensureDockerImageAliases } from "../dockerImageAliases.js";
import { RUNNER_API_SLOT, type RecipeRunOverrides, type SlotId } from "../../types/index.js";
import { registerAutoStartRoutes } from "./registerAutoStartRoutes.js";
import { registerDockerRoutes } from "./registerDockerRoutes.js";

/** Response body when a client sends legacy `slot: "b"` (or any id other than the single runner). */
const LEGACY_SLOT_REJECT = {
  error: "LEGACY_SLOT_B",
  message:
    'Recipe Deck has a single managed runner; omit `slot` or use `"a"`. Legacy `slot: "b"` is not supported.',
} as const;

/** Only {@link RUNNER_API_SLOT} is accepted; `b` is rejected for legacy clients. */
function parseSlot(body: unknown): SlotId | null {
  if (!body || typeof body !== "object") return RUNNER_API_SLOT;
  const s = (body as { slot?: string }).slot;
  if (s === undefined || s === "" || s === RUNNER_API_SLOT) return RUNNER_API_SLOT;
  return null;
}

/** Optional `run-recipe.py` overrides from the client. */
function parseRecipeOverrides(body: unknown): RecipeRunOverrides | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = (body as { recipeOverrides?: unknown }).recipeOverrides;
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: RecipeRunOverrides = {};

  if (typeof o.gpu_memory_utilization === "number" && Number.isFinite(o.gpu_memory_utilization)) {
    const g = o.gpu_memory_utilization;
    if (g >= 0.01 && g <= 1) {
      out.gpu_memory_utilization = g;
    }
  }
  if (typeof o.tensor_parallel === "number" && Number.isFinite(o.tensor_parallel)) {
    const tp = Math.round(o.tensor_parallel);
    if (tp >= 1 && tp <= 16) {
      out.tensor_parallel = tp;
    }
  }
  if (typeof o.max_model_len === "number" && Number.isFinite(o.max_model_len)) {
    const m = Math.round(o.max_model_len);
    if (m >= 1 && m <= 2_000_000) {
      out.max_model_len = m;
    }
  }
  if (typeof o.cuda_visible_devices === "string") {
    const c = o.cuda_visible_devices.trim();
    if (c.length > 0 && c.length <= 64 && /^[0-9,]+$/.test(c)) {
      out.cuda_visible_devices = c;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function registerRoutes(app: Express, deck: DeckService): void {
  app.get("/api/state", (_req: Request, res: Response) => {
    res.json(deck.getFullState());
  });

  app.get("/api/metrics", (_req: Request, res: Response) => {
    res.json(deck.getMetricsPayload());
  });

  app.get("/api/recipes", (_req: Request, res: Response) => {
    res.json({ recipes: deck.getRecipes() });
  });

  app.get("/api/recipe", async (req: Request, res: Response) => {
    const stem = safeRecipeStem(String(req.query.name ?? ""));
    if (!stem) {
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    const abs = resolveRecipeDiskPath(deck.paths.recipesDir, stem);
    if (!abs) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const content = await readRecipeFile(abs);
      res.json({ stem, content });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/recipe", async (req: Request, res: Response) => {
    const stem = safeRecipeStem(String(req.query.name ?? ""));
    if (!stem) {
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    const result = await deck.deleteRecipe(stem);
    if (!result.ok) {
      if (result.reason === "not_found") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (result.reason === "busy") {
        res.status(409).json({
          error: "RUNNING",
          message: "Stop the run before deleting this recipe.",
        });
        return;
      }
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/recipe/save", async (req: Request, res: Response) => {
    const stem = safeRecipeStem(String((req.body as { stem?: string }).stem ?? ""));
    const content = (req.body as { content?: string }).content;
    if (!stem || typeof content !== "string") {
      res.status(400).json({ error: "stem and content required" });
      return;
    }
    const resolved = resolveRecipeDiskPath(deck.paths.recipesDir, stem);
    const savePath = recipeSavePath(deck.paths.recipesDir, stem);
    if (!savePath) {
      res.status(400).json({ error: "Invalid stem" });
      return;
    }
    const writePath = resolved ?? savePath;
    let merged = content;
    if (resolved) {
      try {
        const old = await readRecipeFile(resolved);
        merged = mergeRecipeDeckFromExisting(content, old);
      } catch {
        merged = content;
      }
    }
    await fs.mkdir(path.dirname(writePath), { recursive: true });
    const tmp = `${writePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, merged, "utf8");
    await fs.rename(tmp, writePath);
    await deck.refreshRecipes();
    res.json({ ok: true });
  });

  /** Each line is checked against `$SPARK_VLLM_ROOT/mods/<segment>` (same as run-recipe.py). */
  app.post("/api/recipe/mods-status", async (req: Request, res: Response) => {
    const raw = (req.body as { mods?: unknown }).mods;
    if (!Array.isArray(raw)) {
      res.status(400).json({ error: "mods array required" });
      return;
    }
    const mods = raw.map((x) => String(x ?? ""));
    try {
      const exists = await modsExistenceResults(deck.paths.sparkRoot, mods);
      res.json({ ok: true, exists });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** Sets `recipe_deck.broken` in the YAML (Recipe Deck metadata; ignored by run-recipe). */
  app.post("/api/recipe/broken", async (req: Request, res: Response) => {
    const stem = safeRecipeStem(String((req.body as { stem?: string }).stem ?? ""));
    const broken = Boolean((req.body as { broken?: unknown }).broken);
    if (!stem) {
      res.status(400).json({ error: "stem required" });
      return;
    }
    const abs = resolveRecipeDiskPath(deck.paths.recipesDir, stem);
    if (!abs) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    try {
      const raw = await readRecipeFile(abs);
      const next = applyBrokenToYaml(raw, broken);
      const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, next, "utf8");
      await fs.rename(tmp, abs);
      await deck.refreshRecipes();
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.post("/api/run", async (req: Request, res: Response) => {
    const slot = parseSlot(req.body);
    const solo = Boolean((req.body as { solo?: boolean }).solo);
    const recipeStem = safeRecipeStem(
      String((req.body as { recipeStem?: string }).recipeStem ?? ""),
    );
    const useBuffer = Boolean((req.body as { useBuffer?: boolean }).useBuffer);
    const yamlBuffer =
      typeof (req.body as { yamlBuffer?: string }).yamlBuffer === "string"
        ? (req.body as { yamlBuffer: string }).yamlBuffer
        : undefined;
    // Auto-start is only meaningful for non-buffer runs (uses disk YAML)
    const autoStart =
      !useBuffer &&
      Boolean((req.body as { autoStart?: boolean }).autoStart);

    if (slot === null) {
      res.status(400).json(LEGACY_SLOT_REJECT);
      return;
    }

    if (!recipeStem) {
      res.status(400).json({ error: "recipeStem required" });
      return;
    }

    const ctrl = deck.runner;
    const recipeOverrides = parseRecipeOverrides(req.body);
    try {
      if (deck.cfg.dockerImageAliases.length > 0) {
        await ensureDockerImageAliases(deck.cfg.dockerImageAliases);
      }
      const existing = resolveRecipeDiskPath(deck.paths.recipesDir, recipeStem);
      const savePath = recipeSavePath(deck.paths.recipesDir, recipeStem);
      if (!savePath) {
        res.status(400).json({ error: "Invalid recipe path" });
        return;
      }
      if ((!useBuffer || yamlBuffer === undefined) && !existing) {
        res.status(400).json({ error: "Recipe file not found" });
        return;
      }
      const diskPath = existing ?? savePath;
      if (useBuffer && yamlBuffer !== undefined) {
        await ctrl.run({
          recipeStem,
          recipeAbsPath: diskPath,
          solo,
          bufferYaml: yamlBuffer,
          recipeOverrides,
        });
      } else {
        await ctrl.run({
          recipeStem,
          recipeAbsPath: diskPath,
          solo,
          recipeOverrides,
        });
      }
      await deck.recordRecipeRun(recipeStem);
      // Persist current recipe state (for auto-start on boot)
      await deck.saveCurrentRecipeState(recipeStem, autoStart);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/stop", async (req: Request, res: Response) => {
    const slot = parseSlot(req.body);
    if (slot === null) {
      res.status(400).json(LEGACY_SLOT_REJECT);
      return;
    }
    await deck.runner.stopGraceful();
    await deck.clearCurrentRecipeState();
    res.json({ ok: true });
  });

  app.post("/api/force-kill", async (req: Request, res: Response) => {
    const slot = parseSlot(req.body);
    if (slot === null) {
      res.status(400).json(LEGACY_SLOT_REJECT);
      return;
    }
    await deck.runner.stopForce();
    await deck.clearCurrentRecipeState();
    res.json({ ok: true });
  });

  registerDockerRoutes(app, deck);

  app.get("/api/settings/hf-token", async (_req: Request, res: Response) => {
    const token = await readHfTokenFromFile(deck.paths.envFile);
    const stored = token !== null;
    res.json({ stored, token: stored ? token : null });
  });

  app.get("/api/settings/app", async (_req: Request, res: Response) => {
    const savedAll = await loadEnvKeyValue(deck.paths.envFile);
    res.json({
      effective: appSettingsEffectiveWithSaved(deck.cfg, savedAll),
      saved: pickAppSettingsFromFile(savedAll),
      restartRequired: appSettingsRestartRequired(deck.cfg, savedAll),
    });
  });

  app.post("/api/settings/app", async (req: Request, res: Response) => {
    const parsed = parseAppSettingsPost(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    await mergeEnvKeysIntoEnvFile(deck.paths.envFile, parsed.updates);
    const savedAll = await loadEnvKeyValue(deck.paths.envFile);
    res.json({
      ok: true,
      effective: appSettingsEffectiveWithSaved(deck.cfg, savedAll),
      saved: pickAppSettingsFromFile(savedAll),
      restartRequired: appSettingsRestartRequired(deck.cfg, savedAll),
    });
  });

  /** Triggers `systemctl --user restart` (see RECIPE_DECK_SYSTEMD_UNIT). */
  app.post("/api/service/restart", (_req: Request, res: Response) => {
    scheduleRestartAfterResponse(res);
    res.json({ ok: true });
  });

  app.post("/api/settings/hf-token", async (req: Request, res: Response) => {
    const raw = (req.body as { token?: unknown }).token;
    const token = typeof raw === "string" ? raw : "";
    if (token.trim() === "") {
      await removeHfTokenFromEnvFile(deck.paths.envFile);
      res.json({ ok: true });
      return;
    }
    await mergeHfTokenIntoEnvFile(deck.paths.envFile, token.trim());
    res.json({ ok: true });
  });

  registerAutoStartRoutes(app);

  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });
}
