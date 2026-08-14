import type { RecipeDeckPathsPayload, RecipeListItem } from "../../../../types/index.js";
import type { EditorSaveStatus } from "../recipe/EditorPanel.types";

export interface AppEditorPaneProps {
  recipes: RecipeListItem[];
  stem: string;
  onStemChange: (s: string) => void;
  content: string;
  dirty: boolean;
  saveStatus: EditorSaveStatus;
  onContentChange: (value: string) => void;
  onSave: () => void;
  onRunBuffer: () => void;
  onRevert: () => void;
  onBrokenChange: (broken: boolean) => Promise<void>;
  onRequestDelete: () => void;
  deleteBlocked: boolean;
  recipePaths: RecipeDeckPathsPayload | null;
}
