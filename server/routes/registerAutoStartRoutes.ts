import type { Express, Request, Response } from "express";
import {
  readCurrentRecipeState,
  writeCurrentRecipeState,
  updateCurrentRecipeAutoStart,
} from "../currentRecipe.js";
import { safeRecipeStem } from "../recipeScanner.js";

export function registerAutoStartRoutes(app: Express): void {
  /** Read auto-start state from `.current-recipe`. */
  app.get("/api/settings/auto-start", async (_req: Request, res: Response) => {
    const state = await readCurrentRecipeState();
    res.json({
      recipeStem: state?.recipeStem ?? null,
      autoStart: state?.autoStart ?? false,
    });
  });

  /** Persist auto-start state (recipe stem + enabled flag). */
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
    try {
      await writeCurrentRecipeState(stem, autoStart);
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
}
