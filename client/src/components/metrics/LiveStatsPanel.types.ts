import type { MetricsPayload, SlotSnapshot } from "../../../../types/index.js";

export interface LiveStatsPanelProps {
  snap: SlotSnapshot;
  metrics: MetricsPayload | null;
}
