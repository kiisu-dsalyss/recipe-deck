import type {
  AppSettingsPayload,
  AppSettingsSaveBody,
  CurrentRecipeState,
} from "../../api/client";
import type { RecipeDeckPathsPayload } from "../../../../types/index.js";

export interface AppSettingsPanelProps {
  payload: AppSettingsPayload | null;
  /** Effective paths from the server (read-only; set via env). */
  recipePaths?: RecipeDeckPathsPayload | null;
  onSave: (body: AppSettingsSaveBody) => Promise<void>;
  onRestartService: () => Promise<void>;
  /** When `modal`, the surrounding dialog shows the title (no duplicate h3). */
  variant?: "panel" | "modal";
  hfDraft: string;
  onHfDraftChange: (value: string) => void;
  onHfBlur: () => void;
  onSaveHf: () => void | Promise<void>;
  hfTokenLoading: boolean;
  onRefreshRecipes: () => void | Promise<void>;
  /** Current auto-start / auto-restart state from server. */
  autoStartState: CurrentRecipeState | null;
  onAutoStartChange: (
    stem: string,
    autoStart: boolean,
    autoRestart: boolean,
  ) => Promise<void>;
}
