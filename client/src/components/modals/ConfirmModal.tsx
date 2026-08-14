import type { ReactElement } from "react";
import type { ConfirmModalProps } from "./ConfirmModal.types";
import styles from "./ConfirmModal.module.css";

export type { ConfirmModalProps } from "./ConfirmModal.types";

export function ConfirmModal(props: ConfirmModalProps): ReactElement {
  const {
    title,
    children,
    confirmLabel,
    cancelLabel = "Cancel",
    danger,
    onConfirm,
    onCancel,
  } = props;
  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.card} role="dialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        <div className={styles.body}>{children}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? styles.btnDanger : styles.btnPrimary}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
