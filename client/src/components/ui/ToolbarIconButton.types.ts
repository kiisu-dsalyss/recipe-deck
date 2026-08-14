import type { ReactNode } from "react";

export type ToolbarIconVariant = "muted" | "accent" | "danger";

export interface ToolbarIconButtonProps {
  /** Shown in glass tooltip and as aria-label. */
  label: string;
  variant?: ToolbarIconVariant;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  children: ReactNode;
}
