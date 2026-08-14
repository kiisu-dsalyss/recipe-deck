import type { MetricsPayload, ModelCacheProgress } from "../../../../types/index.js";
import type { Theme } from "../../theme";

export interface HeaderProps {
  listenHost?: string;
  listenPort: number;
  metrics: MetricsPayload | null;
  modelCacheProgress: ModelCacheProgress | null;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenServerSettings: () => void;
  onOpenHelp: () => void;
}
