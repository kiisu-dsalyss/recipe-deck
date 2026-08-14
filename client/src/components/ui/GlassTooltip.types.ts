import type { ReactNode } from "react";

export interface GlassTooltipProps {
  /** Hover / focus hint (glass-styled). */
  label: string;
  children: ReactNode;
}
