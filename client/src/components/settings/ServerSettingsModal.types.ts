import type { AppSettingsPayload, AppSettingsSaveBody } from "../../api/client";
import type { RecipeDeckPathsPayload } from "../../../../types/index.js";

export interface ServerSettingsModalProps {
  payload: AppSettingsPayload | null;
  recipePaths?: RecipeDeckPathsPayload | null;
  onSave: (body: AppSettingsSaveBody) => Promise<void>;
  onRestartService: () => Promise<void>;
  onClose: () => void;
  hfDraft: string;
  onHfDraftChange: (value: string) => void;
  onHfBlur: () => void;
  onSaveHf: () => void | Promise<void>;
  hfTokenLoading: boolean;
  onRefreshRecipes: () => void | Promise<void>;
  autoStartState: { recipeStem: string | null; autoStart: boolean } | null;
  onAutoStartChange: (stem: string, enabled: boolean) => Promise<void>;
}
