import type { ReactElement } from "react";
import styles from "./RunningModelPanel.module.css";

export function AutoStartRow(props: {
  autoStartEnabled?: boolean;
  onToggleAutoStart?: () => void;
}): ReactElement {
  const { autoStartEnabled, onToggleAutoStart } = props;
  return (
    <div className={styles.autoStartRow}>
      <label className={styles.autoStartLabel}>
        <input
          type="checkbox"
          checked={autoStartEnabled ?? true}
          onChange={() => {
            onToggleAutoStart?.();
          }}
          title={
            autoStartEnabled
              ? "This recipe will auto-start the next time Recipe Deck boots"
              : "Auto-start is disabled; this recipe will not start on boot"
          }
        />
        <span className={styles.autoStartText}>Auto start at boot</span>
      </label>
    </div>
  );
}
