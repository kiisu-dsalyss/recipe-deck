import type { SlotId } from "../types/index.js";

export type LogBroadcastFn = (slot: SlotId, line: string) => void;
