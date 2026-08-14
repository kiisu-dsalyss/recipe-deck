import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type {
  DockerListRow,
  ModelCacheProgress,
  RecipeListItem,
  SlotSnapshot,
} from "../../../../types/index.js";
import { formatBytes } from "../../lib/formatBytes";
import { IconBrain, IconForceKill, IconPlay, IconRefresh, IconStopSign } from "../ui/glyphs.js";
import { ToolbarIconButton } from "../ui/ToolbarIconButton.js";
import styles from "./RunningModelPanel.module.css";

const CACHE_DONE_FLASH_MS = 2800;

export interface RunningModelPanelProps {
  snap: SlotSnapshot | undefined;
  recipes: RecipeListItem[];
  logText: string;
  selectedStem: string;
  onStemChange: (stem: string) => void;
  onRun: () => void;
  onStop: () => void;
  onForce: () => void;
  /** Toggled by clicking the checkbox in the running panel. */
  onToggleAutoStart?: () => void;
  /** Reflects current auto-start checkbox state. */
  autoStartEnabled?: boolean;
  /** `docker ps` rows for operator stop (zombie containers). */
  onDockerList: () => Promise<DockerListRow[]>;
  onDockerStop: (containerId: string) => Promise<void>;
  /** HF hub download progress while the runner is BOOTING. */
  modelCacheProgress: ModelCacheProgress | null;
}

/** Group by first path segment under `recipes/` (root files → "(root)"). */
function recipeBookGroups(recipes: RecipeListItem[]): { label: string; items: RecipeListItem[] }[] {
  const map = new Map<string, RecipeListItem[]>();
  for (const r of recipes) {
    const label = r.group?.trim() ? r.group : "(root)";
    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label)!.push(r);
  }
  const labels = Array.from(map.keys()).sort((a, b) => {
    if (a === "(root)") {
      return -1;
    }
    if (b === "(root)") {
      return 1;
    }
    return a.localeCompare(b);
  });
  return labels.map((label) => ({ label, items: map.get(label)! }));
}

function pickPrimaryDockerRow(
  rows: DockerListRow[] | null,
  snapDocker: SlotSnapshot["docker"],
): DockerListRow | null {
  if (!rows?.length) {
    return null;
  }
  if (snapDocker) {
    const { containerName, image } = snapDocker;
    const byName = rows.find(
      (r) =>
        r.names.includes(containerName) ||
        r.image === image ||
        r.image.endsWith(`/${image}`),
    );
    if (byName) {
      return byName;
    }
  }
  return rows[0];
}

function primaryDockerLine(
  snapDocker: SlotSnapshot["docker"],
  row: DockerListRow | null,
): { label: string; stopId: string | null } {
  if (row) {
    const name = row.names.split(",")[0]?.trim() || row.image;
    return { label: name, stopId: row.id };
  }
  if (snapDocker) {
    return {
      label: snapDocker.containerName || snapDocker.image,
      stopId: null,
    };
  }
  return { label: "—", stopId: null };
}

function phaseClass(phase: string | undefined): string {
  switch (phase) {
    case "IDLE":
      return styles.badgeIdle;
    case "BOOTING":
      return styles.badgeBoot;
    case "HEALTHY":
      return styles.badgeOk;
    case "ERROR":
      return styles.badgeErr;
    default:
      return styles.badgeIdle;
  }
}

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
  const logRef = useRef<HTMLPreElement>(null);
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
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logText]);

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
            <div
              className={styles.modelCache}
              title={`${cache.modelId}\n${cache.bytesOnDisk.toLocaleString()} bytes on disk${
                cache.bytesExpected != null
                  ? `\n${cache.bytesExpected.toLocaleString()} bytes expected`
                  : ""
              }`}
              aria-label={`Hub model cache: ${cache.modelId}`}
            >
              <span className={`${styles.modelCacheIcon} ${styles.modelCacheIconPulse}`} aria-hidden>
                <IconBrain />
              </span>
              <div
                className={`${styles.cacheBarOuter} ${cacheComplete ? styles.cacheBarOuterDone : ""} ${cacheNearlyEmpty ? styles.cacheBarOuterLow : ""} ${cacheIndeterminate ? styles.cacheBarOuterIndeterminate : ""}`}
                role={
                  pctClamped != null || cacheIndeterminate ? "progressbar" : undefined
                }
                aria-valuemin={pctClamped != null ? 0 : undefined}
                aria-valuemax={pctClamped != null ? 100 : undefined}
                aria-valuenow={pctClamped != null ? Math.round(pctClamped * 10) / 10 : undefined}
                aria-busy={cacheIndeterminate ? true : undefined}
                aria-label={
                  cacheIndeterminate
                    ? "Downloading model to hub cache; total size unknown"
                    : pctClamped != null
                      ? doneCacheFlash != null
                        ? "Hub cache ready"
                        : `Downloaded ${pctClamped.toFixed(1)} percent of expected hub size`
                      : undefined
                }
              >
                <div
                  className={`${styles.cacheBarInner} ${cacheComplete ? styles.cacheBarInnerDone : ""} ${cacheIndeterminate ? styles.cacheBarInnerIndeterminate : ""}`}
                  style={{
                    width: cacheIndeterminate
                      ? "38%"
                      : pctClamped != null
                        ? `${pctClamped}%`
                        : "0%",
                    minWidth:
                      pctClamped != null && pctClamped > 0 && pctClamped < 1 ? "2px" : undefined,
                  }}
                />
              </div>
              <div className={styles.cacheReadout}>
                {cache.percent != null ? (
                  <>
                    <span
                      className={`${styles.cachePctValue} ${cacheComplete ? styles.cachePctValueDone : ""}`}
                    >
                      {cache.percent.toFixed(1)}%
                    </span>
                    <span className={styles.cachePctSep} aria-hidden>
                      ·
                    </span>
                    <span className={styles.cachePctDisk}>{cacheDisk}</span>
                  </>
                ) : cache.bytesExpected != null ? (
                  <>
                    <span className={styles.cachePctValue}>{cacheDisk}</span>
                    <span className={styles.cachePctSep} aria-hidden>
                      /
                    </span>
                    <span className={styles.cachePctDisk}>
                      {formatBytes(cache.bytesExpected)}
                    </span>
                  </>
                ) : (
                  <span className={styles.cachePctValue}>{cacheDisk}</span>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.modelCacheSpacer} aria-hidden />
          )}
          <div className={styles.headTools}>
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
          {/* Auto-start checkbox */}
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
      {showRunning ? (
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
      ) : (
        <p className={styles.idleHint}>
          No API/Docker discovery on this port yet (or nothing listening).
        </p>
      )}
      {(() => {
        const primaryRow = pickPrimaryDockerRow(dockerRows, snap?.docker ?? null);
        const { label: primaryLabel, stopId: primaryStopId } = primaryDockerLine(
          snap?.docker ?? null,
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
      })()}
      <div className={styles.row}>
        <label className={styles.lbl} htmlFor="recipe-running-select">
          Recipe
        </label>
        <select
          id="recipe-running-select"
          className={styles.select}
          value={selectedStem}
          onChange={(e) => {
            onStemChange(e.target.value);
          }}
        >
          <option value="">—</option>
          {recipeBookGroups(recipes).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((r) => (
                <option key={r.stem} value={r.stem}>
                  {r.broken ? "⚠ " : ""}
                  {r.stem}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <pre ref={logRef} className={styles.log}>
        {logText || "—"}
      </pre>
    </section>
  );
}
