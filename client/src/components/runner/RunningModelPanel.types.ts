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
  /** Toggled by clicking the checkbox in the running panel. */
  onToggleAutoStart?: () => void;
  /** Reflects current auto-start checkbox state. */
  autoStartEnabled?: boolean;
  /** `docker ps` rows for operator stop (zombie containers). */
  onDockerList: () => Promise<DockerListRow[]>;
  onDockerStop: (containerId: string) => Promise<void>;
  /** HF hub download progress while the runner is BOOTING. */
  modelCacheProgress: ModelCacheProgress | null;
}
