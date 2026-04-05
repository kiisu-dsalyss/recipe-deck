import type { MetricsPayload, SlotSnapshot } from "../../../../../types/index.js";

export interface LiveStatProps {
  snap: SlotSnapshot;
  metrics: MetricsPayload | null;
}
