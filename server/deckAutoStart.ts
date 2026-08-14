import { resolveRecipeDiskPath } from "./recipeScanner.js";
import { readCurrentRecipeState } from "./currentRecipe.js";
import type { SlotController } from "./slotController.js";

/**
 * Try to auto-start the last configured recipe on server startup.
 * Only runs if auto-start is enabled and the recipe file still exists.
 */
export async function tryAutoStart(opts: {
  recipesDir: string;
  runner: SlotController;
}): Promise<void> {
  const state = await readCurrentRecipeState();
  if (!state || !state.autoStart || !state.recipeStem) {
    return;
  }

  const recipeAbs = resolveRecipeDiskPath(opts.recipesDir, state.recipeStem);
  if (!recipeAbs) {
    console.error(
      `[recipe-deck] auto-start recipe not found on disk: ${state.recipeStem}`,
    );
    return;
  }

  console.info(`[recipe-deck] auto-starting recipe: ${state.recipeStem}`);
  try {
    await opts.runner.run({
      recipeStem: state.recipeStem,
      recipeAbsPath: recipeAbs,
      solo: true,
      recipeOverrides: undefined,
    });
    console.info(`[recipe-deck] auto-start completed for: ${state.recipeStem}`);
  } catch (e) {
    console.error(
      `[recipe-deck] auto-start failed for ${state.recipeStem}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
