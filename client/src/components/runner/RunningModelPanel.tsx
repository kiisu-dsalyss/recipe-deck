import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { DockerListRow, ModelCacheProgress } from "../../../../types/index.js";
import { formatBytes } from "../../lib/formatBytes";
import { IconForceKill, IconPlay, IconPower, IconStopSign } from "../ui/glyphs.js";
import { ToolbarIconButton } from "../ui/ToolbarIconButton.js";
import { ModelCacheBar } from "./ModelCacheBar.js";
import { RunnerLogPane } from "./RunnerLogPane.js";
import { RecipeStemSelect } from "./RecipeStemSelect.js";
import { RunningModelDockerSection } from "./RunningModelDockerSection.js";
import { RunningNowSection } from "./RunningNowSection.js";
import type { RunningModelPanelProps } from "./RunningModelPanel.types.js";
import { phaseClass } from "./runningModelPanelUtils.js";
import styles from "./RunningModelPanel.module.css";

const CACHE_DONE_FLASH_MS = 2800;

export function RunningModelPanel(props: RunningModelPanelProps): ReactElement {
  const {
    snap,
    recipes,
    logText,
    selectedStem,
    onStemChange,
    onRun,
    onStop,
    onForce,
    onToggleAutoStart,
    autoStartEnabled,
    onDockerList,
    onDockerStop,
    modelCacheProgress,
  } = props;
  const [dockerRows, setDockerRows] = useState<DockerListRow[] | null>(null);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [dockerErr, setDockerErr] = useState<string | null>(null);
  const [stoppingDockerId, setStoppingDockerId] = useState<string | null>(null);
  const [dockerListExpanded, setDockerListExpanded] = useState(false);
  /** "Running now" details — collapsed by default; header toggles. */
  const [runningExpanded, setRunningExpanded] = useState(false);
  /** After BOOTING→HEALTHY, show solid 100% briefly when the bar was indeterminate (unknown total). */
  const [doneCacheFlash, setDoneCacheFlash] = useState<ModelCacheProgress | null>(null);
  const lastBootingCacheRef = useRef<ModelCacheProgress | null>(null);
  const prevPhaseRef = useRef<string | undefined>(undefined);

  const refreshDocker = useCallback(async () => {
    setDockerLoading(true);
    setDockerErr(null);
    try {
      const rows = await onDockerList();
      setDockerRows(rows);
    } catch (e) {
      setDockerErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDockerLoading(false);
    }
  }, [onDockerList]);
  const phase = snap?.phase ?? "IDLE";

  useEffect(() => {
    if (phase === "BOOTING" && modelCacheProgress) {
      lastBootingCacheRef.current = modelCacheProgress;
    }
  }, [phase, modelCacheProgress]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (phase === "BOOTING") {
      setDoneCacheFlash(null);
    }

    if (phase === "HEALTHY" && prev === "BOOTING") {
      const last = lastBootingCacheRef.current;
      if (last && last.percent == null && last.bytesOnDisk > 0) {
        setDoneCacheFlash({
          ...last,
          percent: 100,
          bytesExpected: last.bytesExpected ?? last.bytesOnDisk,
        });
        lastBootingCacheRef.current = null;
        const t = window.setTimeout(() => {
          setDoneCacheFlash(null);
        }, CACHE_DONE_FLASH_MS);
        return () => window.clearTimeout(t);
      }
    }

    if (phase !== "HEALTHY" && phase !== "BOOTING") {
      setDoneCacheFlash(null);
    }
    return undefined;
  }, [phase]);

  const hasModels = Boolean(snap?.servedModels && snap.servedModels.length > 0);
  const hasDocker = Boolean(snap?.docker);
  const hasLiveOnPort = hasModels || hasDocker;
  const showRunning =
    phase !== "IDLE" || Boolean(snap?.recipeStem) || hasLiveOnPort;
  const externalOnly =
    phase === "IDLE" && hasLiveOnPort && !snap?.recipeStem;
  /** Collapse the Running now block while booting (hub download counts too; avoids missing BOOTING if phase lags). */
  const runningBootCompact =
    showRunning &&
    !externalOnly &&
    (snap?.phase === "BOOTING" ||
      Boolean(modelCacheProgress) ||
      Boolean(doneCacheFlash));

  const port = snap?.port;

  const modelLine = (() => {
    if (phase === "BOOTING") {
      return "Starting…";
    }
    const m = snap?.servedModels;
    if (m && m.length > 0) {
      return m.join(", ");
    }
    if (m === null) {
      return "—";
    }
    return "—";
  })();

  const dockerLine = (() => {
    const d = snap?.docker;
    if (d) {
      return `${d.image} · ${d.containerName}`;
    }
    return "—";
  })();

  const runningTitle = externalOnly ? "Live on port" : "Running now";

  const runningSummaryCollapsed = (() => {
    if (!showRunning) {
      return "";
    }
    if (runningBootCompact) {
      const stem = snap?.recipeStem?.trim() || selectedStem.trim();
      return stem || "Starting…";
    }
    if (externalOnly) {
      return port != null ? `port ${port}` : "Not from Recipe Deck";
    }
    const stem = snap?.recipeStem?.trim();
    if (stem) {
      return stem;
    }
    if (phase === "BOOTING") {
      return "Starting…";
    }
    if (modelLine !== "—") {
      return modelLine;
    }
    return phase;
  })();

  const modelsHint =
    port != null
      ? `Same data as: curl -s http://127.0.0.1:${port}/v1/models (or http://<inference-host>:${port}/v1/models from your LAN)`
      : undefined;

  const dockerHint =
    port != null
      ? `Container published on host port ${port} (equivalent to finding it in docker ps port mapping for :${port}->)`
      : undefined;

  useEffect(() => {
    void refreshDocker();
  }, [refreshDocker]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshDocker();
    }, 12_000);
    return () => window.clearInterval(id);
  }, [refreshDocker]);

  useEffect(() => {
    if (snap?.phase === "BOOTING") {
      setDockerListExpanded(false);
    }
  }, [snap?.phase]);

  const cache = modelCacheProgress ?? doneCacheFlash ?? null;
  const cacheDisk = cache ? formatBytes(cache.bytesOnDisk) : "";
  const cachePct = cache?.percent;
  const pctClamped =
    cachePct != null ? Math.min(100, Math.max(0, cachePct)) : null;
  /** Unknown total + still booting: sliding segment. After healthy, flash uses 100% (no motion). */
  const cacheIndeterminate =
    phase === "BOOTING" &&
    cache != null &&
    pctClamped == null &&
    cache.bytesOnDisk > 0;
  const cacheComplete = pctClamped != null && pctClamped >= 99.5;
  const cacheNearlyEmpty =
    pctClamped != null && pctClamped < 1 && !cacheIndeterminate;

  return (
    <section
      className={styles.panel}
      aria-label="Running model"
      data-testid="demo-section-runner"
    >
      <div className={styles.head}>
        <div className={styles.headTop}>
          <h2 className={styles.h2}>Running Model</h2>
          {cache ? (
            <ModelCacheBar
              cache={cache}
              cacheDisk={cacheDisk}
              pctClamped={pctClamped}
              cacheIndeterminate={cacheIndeterminate}
              cacheComplete={cacheComplete}
              cacheNearlyEmpty={cacheNearlyEmpty}
              doneCacheFlash={doneCacheFlash}
            />
          ) : (
            <div className={styles.modelCacheSpacer} aria-hidden />
          )}
          <div className={styles.headTools}>
            <ToolbarIconButton
              variant="accent"
              label="auto start at boot"
              pressed={autoStartEnabled ?? true}
              onClick={() => {
                onToggleAutoStart?.();
              }}
            >
              <IconPower />
            </ToolbarIconButton>
            <ToolbarIconButton
              variant="accent"
              label="Run the selected recipe from its file on disk"
              onClick={onRun}
            >
              <IconPlay />
            </ToolbarIconButton>
            <ToolbarIconButton
              variant="muted"
              label="Request graceful stop (SIGTERM, then grace period)"
              onClick={onStop}
            >
              <IconStopSign />
            </ToolbarIconButton>
            <ToolbarIconButton
              variant="danger"
              label="Force kill the managed process (SIGKILL)"
              onClick={onForce}
            >
              <IconForceKill />
            </ToolbarIconButton>
          </div>
        </div>
        <div className={styles.headMeta}>
          <span
            className={`${styles.badge} ${phaseClass(phase)}`}
            data-testid="runner-phase-badge"
          >
            {phase}
          </span>
          <span className={styles.sub}>
            Port {snap?.port ?? "—"}
            {snap?.tokPerSec != null ? ` · ~${snap.tokPerSec} tok/s` : ""}
          </span>
        </div>
      </div>
      {snap?.containerReuseWarning ? (
        <p className={styles.reuseWarn} role="alert">
          {snap.containerReuseWarning}
        </p>
      ) : null}
      {selectedStem &&
      selectedStem !== snap?.recipeStem &&
      (phase === "HEALTHY" || phase === "BOOTING" || phase === "ERROR") ? (
        <p className={styles.pendingHint} role="status">
          Recipe <strong>{selectedStem}</strong> is selected in the dropdown but not started yet —{" "}
          <strong>Models</strong> / <strong>Docker</strong> still show the live server from the last run until you press
          Run.
        </p>
      ) : null}
      {snap?.lastError && phase === "ERROR" ? (
        <p className={styles.errLine} title={snap.lastError}>
          {snap.lastError}
        </p>
      ) : null}
      <RunningNowSection
        showRunning={showRunning}
        runningExpanded={runningExpanded}
        setRunningExpanded={setRunningExpanded}
        runningTitle={runningTitle}
        runningSummaryCollapsed={runningSummaryCollapsed}
        runningBootCompact={runningBootCompact}
        externalOnly={externalOnly}
        snap={snap}
        selectedStem={selectedStem}
        modelLine={modelLine}
        dockerLine={dockerLine}
        modelsHint={modelsHint}
        dockerHint={dockerHint}
        phase={phase}
      />
      <RunningModelDockerSection
        dockerRows={dockerRows}
        snapDocker={snap?.docker ?? null}
        dockerListExpanded={dockerListExpanded}
        setDockerListExpanded={setDockerListExpanded}
        dockerLoading={dockerLoading}
        dockerErr={dockerErr}
        stoppingDockerId={stoppingDockerId}
        setStoppingDockerId={setStoppingDockerId}
        refreshDocker={refreshDocker}
        onDockerStop={onDockerStop}
      />
      <div className={styles.row}>
        <label className={styles.lbl} htmlFor="recipe-running-select">
          Recipe
        </label>
        <RecipeStemSelect
          id="recipe-running-select"
          recipes={recipes}
          value={selectedStem}
          onChange={onStemChange}
        />
      </div>
      <RunnerLogPane logText={logText} />
    </section>
  );
}
