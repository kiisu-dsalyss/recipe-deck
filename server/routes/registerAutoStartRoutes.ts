import type { Express, Request, Response } from "express";
import {
  readCurrentRecipeState,
  updateCurrentRecipeAutoRestart,
  updateCurrentRecipeAutoStart,
  writeCurrentRecipeState,
} from "../currentRecipe.js";
import { safeRecipeStem } from "../recipeScanner.js";

export function registerAutoStartRoutes(app: Express): void {
  /** Read auto-start / auto-restart state from `.current-recipe`. */
  app.get("/api/settings/auto-start", async (_req: Request, res: Response) => {
    const state = await readCurrentRecipeState();
    res.json({
      recipeStem: state?.recipeStem ?? null,
      autoStart: state?.autoStart ?? false,
      autoRestart: state?.autoRestart ?? true,
    });
  });

  /** Persist recipe stem + auto-start + auto-restart flags. */
  app.post("/api/settings/auto-start", async (req: Request, res: Response) => {
    const stem = safeRecipeStem(
      String((req.body as { stem?: unknown }).stem ?? ""),
    );
    if (!stem) {
      res.status(400).json({ error: "stem required" });
      return;
    }
    const autoStart = Boolean(
      (req.body as { autoStart?: unknown }).autoStart,
    );
    const autoRestartRaw = (req.body as { autoRestart?: unknown }).autoRestart;
    const autoRestart =
      autoRestartRaw === undefined ? true : Boolean(autoRestartRaw);
    try {
      await writeCurrentRecipeState(stem, autoStart, autoRestart);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** Update only the auto-start flag for the current recipe. */
  app.post("/api/settings/auto-start/toggle", async (req: Request, res: Response) => {
    const autoStart = Boolean(
      (req.body as { autoStart?: unknown }).autoStart,
    );
    try {
      await updateCurrentRecipeAutoStart(autoStart);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** Update only the auto-restart flag for the current recipe. */
  app.post(
    "/api/settings/auto-restart/toggle",
    async (req: Request, res: Response) => {
      const autoRestart = Boolean(
        (req.body as { autoRestart?: unknown }).autoRestart,
      );
      try {
        await updateCurrentRecipeAutoRestart(autoRestart);
        res.json({ ok: true });
      } catch (e) {
        res.status(500).json({
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );
}
