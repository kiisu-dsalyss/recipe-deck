import type { RecipeListItem } from "../../../../types/index.js";

export interface RecipeStemSelectProps {
  id: string;
  recipes: RecipeListItem[];
  value: string;
  onChange: (stem: string) => void;
  editable?: boolean;
  placeholder?: string;
  includeEmpty?: boolean;
  title?: string;
}
