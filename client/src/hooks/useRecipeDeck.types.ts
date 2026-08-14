import type { AppSettingsPayload, AppSettingsSaveBody, FullStatePayload } from "../api/client";
import type * as api from "../api/client";

export interface DeckUiState {
  payload: FullStatePayload | null;
  /** Log stream for the single managed runner. */
  logs: { a: string };
  error: string | null;
  /** `undefined` until first load; then current token from server (empty string if none). */
  hfToken: string | undefined;
  /** `null` if settings could not be loaded. */
  appSettings: AppSettingsPayload | null;
  /** True = hide dots + header aurora (from server + localStorage fallback). */
  simpleUi: boolean;
  /** Auto-start state: recipe stem and enabled flag. `null` until first fetch. */
  autoStart: { recipeStem: string | null; autoStart: boolean } | null;
}

export type RecipeDeckActions = {
  refresh: () => Promise<void>;
  run: (args: Parameters<typeof api.postRun>[0] & { autoStart?: boolean }) => Promise<void>;
  stop: () => Promise<void>;
  forceKill: () => Promise<void>;
  saveRecipe: (stem: string, content: string) => Promise<void>;
  setRecipeBroken: (stem: string, broken: boolean) => Promise<void>;
  deleteRecipe: (stem: string) => Promise<void>;
  saveHf: (token: string) => Promise<void>;
  saveAppSettings: (body: AppSettingsSaveBody) => Promise<void>;
  saveAutoStart: (stem: string, enabled: boolean) => Promise<void>;
  toggleAutoStart: (enabled: boolean) => Promise<void>;
  clearRunLog: () => void;
};

export type UseRecipeDeckResult = DeckUiState & RecipeDeckActions;
