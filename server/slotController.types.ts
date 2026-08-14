import type { SlotId } from "../types/index.js";

export type LogBroadcast = (slot: SlotId, line: string) => void;
export type StateBroadcast = () => void;
