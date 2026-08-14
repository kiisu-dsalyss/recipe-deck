import type { ReactElement } from "react";
import type { DockerListRow, SlotSnapshot } from "../../../../types/index.js";
import { IconRefresh, IconStopSign } from "../ui/glyphs.js";
import { ToolbarIconButton } from "../ui/ToolbarIconButton.js";
import { pickPrimaryDockerRow, primaryDockerLine } from "./runningModelPanelUtils.js";
import styles from "./RunningModelPanel.module.css";

export function RunningModelDockerSection(props: {
  dockerRows: DockerListRow[] | null;
  snapDocker: SlotSnapshot["docker"];
  dockerListExpanded: boolean;
  setDockerListExpanded: (fn: (v: boolean) => boolean) => void;
  dockerLoading: boolean;
  dockerErr: string | null;
  stoppingDockerId: string | null;
  setStoppingDockerId: (id: string | null) => void;
  refreshDocker: () => Promise<void>;
  onDockerStop: (containerId: string) => Promise<void>;
}): ReactElement {
  const {
    dockerRows,
    snapDocker,
    dockerListExpanded,
    setDockerListExpanded,
    dockerLoading,
    dockerErr,
    stoppingDockerId,
    setStoppingDockerId,
    refreshDocker,
    onDockerStop,
  } = props;

  const primaryRow = pickPrimaryDockerRow(dockerRows, snapDocker);
  const { label: primaryLabel, stopId: primaryStopId } = primaryDockerLine(
    snapDocker,
    primaryRow,
  );
  const stopBusy = primaryStopId != null && stoppingDockerId === primaryStopId;
  const handlePrimaryStop = () => {
    if (!primaryStopId) {
      return;
    }
    const short = primaryStopId.slice(0, 12);
    if (!window.confirm(`Stop ${short}…?`)) {
      return;
    }
    setStoppingDockerId(primaryStopId);
    void onDockerStop(primaryStopId)
      .then(() => refreshDocker())
      .catch((e) => {
        window.alert(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setStoppingDockerId(null);
      });
  };

  return (
    <div className={styles.runningSection}>
      <div className={styles.dockerToggleRow}>
        <button
          type="button"
          className={styles.runningToggle}
          id="docker-containers-toggle"
          aria-expanded={dockerListExpanded}
          aria-controls="docker-containers-panel"
          onClick={() => {
            setDockerListExpanded((v) => !v);
          }}
        >
          <span className={styles.runningChevron} aria-hidden>
            {dockerListExpanded ? "▼" : "▶"}
          </span>
          <span className={styles.runningToggleTitle}>Docker container</span>
          {!dockerListExpanded ? (
            <span className={styles.runningSummary} title={primaryLabel}>
              {primaryLabel}
            </span>
          ) : null}
        </button>
        {!dockerListExpanded ? (
          <div className={styles.dockerToolbarActions}>
            <ToolbarIconButton
              variant="muted"
              label={
                primaryStopId
                  ? "Stop this container"
                  : "Stop (list a container id after refresh)"
              }
              disabled={dockerLoading || primaryStopId == null || stopBusy}
              onClick={() => {
                handlePrimaryStop();
              }}
            >
              <IconStopSign />
            </ToolbarIconButton>
          </div>
        ) : null}
      </div>
      {dockerListExpanded ? (
        <div
          id="docker-containers-panel"
          role="region"
          aria-labelledby="docker-containers-toggle"
          className={`${styles.runningBody} ${styles.dockerExpandedPanel}`}
        >
          <div className={styles.dockerCtlHead}>
            <span className={styles.dockerCtlTitle}>All containers</span>
            <ToolbarIconButton
              variant="muted"
              label={dockerLoading ? "Loading container list" : "Refresh container list"}
              disabled={dockerLoading}
              busy={dockerLoading}
              onClick={() => {
                void refreshDocker();
              }}
            >
              <IconRefresh />
            </ToolbarIconButton>
          </div>
          {dockerErr ? <p className={styles.dockerErr}>{dockerErr}</p> : null}
          <div className={styles.dockerScroll}>
            {dockerRows === null ? null : dockerRows.length === 0 ? null : (
              dockerRows.map((row) => {
                const short = row.id.slice(0, 12);
                const busy = stoppingDockerId === row.id;
                return (
                  <div key={row.id} className={styles.dockerRow}>
                    <div className={styles.dockerRowMain}>
                      <div className={styles.dockerId} title={row.id}>
                        {short}…
                      </div>
                      <p className={styles.dockerMeta}>
                        {row.image}
                        {row.names ? ` · ${row.names}` : ""}
                      </p>
                      {row.ports ? (
                        <p className={styles.dockerMeta} title={row.ports}>
                          {row.ports}
                        </p>
                      ) : null}
                    </div>
                    <ToolbarIconButton
                      variant="danger"
                      label={busy ? "Stopping container" : `Stop container ${short}…`}
                      disabled={busy || dockerLoading}
                      busy={busy}
                      onClick={() => {
                        if (!window.confirm(`Stop ${short}…?`)) {
                          return;
                        }
                        setStoppingDockerId(row.id);
                        void onDockerStop(row.id)
                          .then(() => refreshDocker())
                          .catch((e) => {
                            window.alert(e instanceof Error ? e.message : String(e));
                          })
                          .finally(() => {
                            setStoppingDockerId(null);
                          });
                      }}
                    >
                      <IconStopSign />
                    </ToolbarIconButton>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
