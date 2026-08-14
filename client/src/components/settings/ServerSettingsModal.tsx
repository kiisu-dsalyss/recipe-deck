import { useEffect } from "react";
import type { ReactElement } from "react";
import { AppSettingsPanel } from "./AppSettingsPanel";
import type { ServerSettingsModalProps } from "./ServerSettingsModal.types";
import styles from "./ServerSettingsModal.module.css";

export type { ServerSettingsModalProps } from "./ServerSettingsModal.types";

export function ServerSettingsModal(props: ServerSettingsModalProps): ReactElement {
  const {
    payload,
    recipePaths,
    onSave,
    onRestartService,
    onClose,
    hfDraft,
    onHfDraftChange,
    onHfBlur,
    onSaveHf,
    hfTokenLoading,
    onRefreshRecipes,
    autoStartState,
    onAutoStartChange,
  } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={styles.card}
        data-testid="demo-section-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 id="settings-modal-title" className={styles.title}>
            Settings
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <AppSettingsPanel
            variant="modal"
            payload={payload}
            recipePaths={recipePaths}
            onSave={onSave}
            onRestartService={onRestartService}
            hfDraft={hfDraft}
            onHfDraftChange={onHfDraftChange}
            onHfBlur={onHfBlur}
            onSaveHf={onSaveHf}
            hfTokenLoading={hfTokenLoading}
            onRefreshRecipes={onRefreshRecipes}
            autoStartState={autoStartState}
            onAutoStartChange={onAutoStartChange}
          />
        </div>
      </div>
    </div>
  );
}
