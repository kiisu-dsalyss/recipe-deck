import type {
  ModelCacheProgress,
  RecipeDeckPathsPayload,
  RecipeListItem,
  MetricsPayload,
  SlotSnapshot,
} from "../types/index.js";

/** Single object for GET /api/state and WebSocket `state` messages (keep in sync). */
export interface DeckFullStatePayload {
  listenHost: string;
  listenPort: number;
  slots: { a: SlotSnapshot };
  metrics: MetricsPayload;
  recipes: RecipeListItem[];
  /** Hub download vs expected size while booting (null otherwise). */
  modelCacheProgress: ModelCacheProgress | null;
  /** Matches `MODEL_CACHE_POLL_MS` (for client polling while booting). */
  modelCachePollIntervalMs: number;
  recipePaths: RecipeDeckPathsPayload;
}
