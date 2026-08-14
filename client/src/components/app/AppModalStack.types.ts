import type { AppSettingsPayload, AppSettingsSaveBody } from "../../api/client";
import type { RecipeDeckPathsPayload, RecipeListItem } from "../../../../types/index.js";

export interface AppModalStackProps {
  helpOpen: boolean;
  onCloseHelp: () => void;
  serverSettingsOpen: boolean;
  onCloseServerSettings: () => void;
  appSettings: AppSettingsPayload | null;
  recipePaths: RecipeDeckPathsPayload | null;
  onSaveAppSettings: (body: AppSettingsSaveBody) => Promise<void>;
  onRestartService: () => Promise<void>;
  hfDraft: string;
  onHfDraftChange: (value: string) => void;
  onHfBlur: () => void;
  onSaveHf: () => void;
  hfTokenLoading: boolean;
  onRefreshRecipes: () => void;
  autoStartState: { recipeStem: string | null; autoStart: boolean } | null;
  onAutoStartChange: (stem: string, enabled: boolean) => Promise<void>;
  pendingForce: boolean;
  onCancelForce: () => void;
  onConfirmForce: () => void;
  deleteConfirmStem: string | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  recipes: RecipeListItem[];
  dirty: boolean;
  stem: string;
}
