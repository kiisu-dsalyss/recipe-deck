import type { ReactElement } from "react";
import type { SlotSnapshot } from "../../../../types/index.js";
import styles from "./RunningModelPanel.module.css";

export function RunningNowSection(props: {
  showRunning: boolean;
  runningExpanded: boolean;
  setRunningExpanded: (fn: (v: boolean) => boolean) => void;
  runningTitle: string;
  runningSummaryCollapsed: string;
  runningBootCompact: boolean;
  externalOnly: boolean;
  snap: SlotSnapshot | undefined;
  selectedStem: string;
  modelLine: string;
  dockerLine: string;
  modelsHint: string | undefined;
  dockerHint: string | undefined;
  phase: string;
}): ReactElement {
  const {
    showRunning,
    runningExpanded,
    setRunningExpanded,
    runningTitle,
    runningSummaryCollapsed,
    runningBootCompact,
    externalOnly,
    snap,
    selectedStem,
    modelLine,
    dockerLine,
    modelsHint,
    dockerHint,
    phase,
  } = props;

  if (!showRunning) {
    return (
      <p className={styles.idleHint}>
        No API/Docker discovery on this port yet (or nothing listening).
      </p>
    );
  }

  return (
    <div className={styles.runningSection}>
      <button
        type="button"
        className={styles.runningToggle}
        id="running-now-toggle"
        aria-expanded={runningExpanded}
        aria-controls="running-now-panel"
        onClick={() => {
          setRunningExpanded((v) => !v);
        }}
      >
        <span className={styles.runningChevron} aria-hidden>
          {runningExpanded ? "▼" : "▶"}
        </span>
        <span className={styles.runningToggleTitle}>{runningTitle}</span>
        {!runningExpanded ? (
          <span className={styles.runningSummary}>{runningSummaryCollapsed}</span>
        ) : null}
      </button>
      {runningExpanded ? (
        <div
          id="running-now-panel"
          role="region"
          aria-labelledby="running-now-toggle"
          className={styles.runningBody}
        >
          {runningBootCompact ? (
            <p className={styles.runningBootLine}>
              <span className={styles.runningTitleInline}>{runningTitle}:</span>{" "}
              <span className={styles.runningBootRecipe}>
                {(snap?.recipeStem?.trim() || selectedStem.trim()) || "—"}
              </span>
            </p>
          ) : (
            <>
              {externalOnly ? (
                <p className={styles.externalNote}>
                  Something answers on this port (not started from this Recipe Deck
                  session). Stop/kill here only affects Recipe Deck–managed processes.
                </p>
              ) : null}
              <dl className={styles.dl}>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Recipe</dt>
                  <dd className={styles.dd}>{snap?.recipeStem ?? "—"}</dd>
                </div>
                {snap?.recipePath ? (
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>Path</dt>
                    <dd className={styles.ddMono} title={snap.recipePath}>
                      {snap.recipePath}
                    </dd>
                  </div>
                ) : null}
                {snap?.recipeLaunchHint ? (
                  <div className={styles.dlRow}>
                    <dt className={styles.dt}>Launch</dt>
                    <dd className={styles.ddMono} title={snap.recipeLaunchHint}>
                      {snap.recipeLaunchHint}
                    </dd>
                  </div>
                ) : null}
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Models</dt>
                  <dd
                    className={styles.dd}
                    title={
                      modelsHint ??
                      (phase === "HEALTHY" && snap?.servedModels === null
                        ? "Could not read GET /v1/models (OpenAI-compatible)"
                        : undefined)
                    }
                  >
                    {modelLine}
                  </dd>
                </div>
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Docker</dt>
                  <dd
                    className={styles.dd}
                    title={
                      dockerHint ??
                      (phase !== "IDLE" && snap?.docker === null
                        ? "docker ps did not list a container publishing this port (needs Docker CLI access, or no container yet)"
                        : undefined)
                    }
                  >
                    {dockerLine}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
