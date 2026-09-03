import type {
  DockerListRow,
  ModelCacheProgress,
  RecipeListItem,
  SlotSnapshot,
} from "../../../../types/index.js";

export interface RunningModelPanelProps {
  snap: SlotSnapshot | undefined;
  recipes: RecipeListItem[];
  logText: string;
  selectedStem: string;
  onStemChange: (stem: string) => void;
  onRun: () => void;
  onStop: () => void;
  onForce: () => void;
  /** Toggled by clicking the auto-start icon in the running panel toolbar. */
  onToggleAutoStart?: () => void;
  /** Reflects current auto-start toggle state. */
  autoStartEnabled?: boolean;
  /** Toggled by clicking the auto-restart icon in the running panel toolbar. */
  onToggleAutoRestart?: () => void;
  /** Reflects current auto-restart toggle state (defaults to true). */
  autoRestartEnabled?: boolean;
  /** `docker ps` rows for operator stop (zombie containers). */
  onDockerList: () => Promise<DockerListRow[]>;
  onDockerStop: (containerId: string) => Promise<void>;
  /** HF hub download progress while the runner is BOOTING. */
  modelCacheProgress: ModelCacheProgress | null;
}
