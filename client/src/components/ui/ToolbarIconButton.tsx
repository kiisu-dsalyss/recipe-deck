import type { ReactElement } from "react";
import { GlassTooltip } from "./GlassTooltip.js";
import type { ToolbarIconButtonProps } from "./ToolbarIconButton.types";
import styles from "./ToolbarIconButton.module.css";

export type { ToolbarIconButtonProps, ToolbarIconVariant } from "./ToolbarIconButton.types";

export function ToolbarIconButton(props: ToolbarIconButtonProps): ReactElement {
  const { label, variant = "muted", disabled, busy, onClick, children } = props;
  const cls =
    variant === "accent"
      ? styles.accent
      : variant === "danger"
        ? styles.danger
        : styles.muted;
  return (
    <GlassTooltip label={label}>
      <button
        type="button"
        className={`${cls}${busy ? ` ${styles.busy}` : ""}`}
        disabled={disabled}
        aria-label={label}
        aria-busy={busy || undefined}
        onClick={onClick}
      >
        {children}
      </button>
    </GlassTooltip>
  );
}
