import type {
  AppSettingsPayload,
  AppSettingsSaveBody,
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
  /** Current auto-start state from server. */
  autoStartState: { recipeStem: string | null; autoStart: boolean } | null;
  onAutoStartChange: (stem: string, enabled: boolean) => Promise<void>;
}
