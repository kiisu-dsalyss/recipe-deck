import type { RecipeRunOverrides, SlotId } from "../types/index.js";

export type LogBroadcast = (slot: SlotId, line: string) => void;
export type StateBroadcast = () => void;

export interface SlotRunOpts {
  recipeStem: string;
  recipeAbsPath: string;
  solo: boolean;
  bufferYaml?: string;
  recipeOverrides?: RecipeRunOverrides;
  /**
   * When true (default), unexpected exits schedule a cooldown relaunch.
   * Ignored for `stopGraceful()` / `stopForce()` (those cancel any pending restart).
   */
  autoRestart?: boolean;
}
