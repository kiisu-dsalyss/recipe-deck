import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  peak?: ReactNode;
  peakTitle?: string;
  /** Single-channel meter (0–1). */
  meterFraction?: number | null;
  /** Two-channel meter. */
  stereoFractions?: [number, number];
  valueTitle?: string;
}
