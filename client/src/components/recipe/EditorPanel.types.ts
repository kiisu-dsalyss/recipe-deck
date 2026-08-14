import type { RecipeDeckPathsPayload, RecipeListItem } from "../../../../types/index.js";

export type EditorSaveStatus = "idle" | "saving" | "saved" | "error";

export interface EditorPanelProps {
  recipes: RecipeListItem[];
  stem: string;
  onStemChange: (stem: string) => void;
  content: string;
  dirty: boolean;
  saveStatus: EditorSaveStatus;
  onContentChange: (value: string) => void;
  onSave: () => void;
  onRunBuffer: () => void;
  onRevert: () => void;
  /** Persist `recipe_deck.broken` for an existing recipe on disk. */
  onBrokenChange?: (broken: boolean) => void;
  /** Shown when the stem matches a file on disk. */
  onRequestDelete?: () => void;
  /** True while this recipe is actively running (BOOTING/HEALTHY). */
  deleteBlocked?: boolean;
  /** Server-resolved paths (optional until first state load). */
  recipePaths?: RecipeDeckPathsPayload | null;
}
