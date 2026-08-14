import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import * as api from "./api/client";
import { EditorPanel, type EditorSaveStatus } from "./components/recipe/EditorPanel";
import { LiveStatsPanel } from "./components/metrics/LiveStatsPanel";
import { ConfirmModal } from "./components/modals/ConfirmModal";
import { HelpModal } from "./components/modals/HelpModal";
import { Header } from "./components/shell/Header";
import { RunningModelPanel } from "./components/runner/RunningModelPanel";
import { useRecipeDeck } from "./hooks/useRecipeDeck";
import { useTheme } from "./hooks/useTheme";
import appLayout from "./styles/app/appLayout.module.css";
import appHeaderAurora from "./styles/app/appHeaderAurora.module.css";
import appHealthyCarousel from "./styles/app/appHealthyCarousel.module.css";

const styles = { ...appLayout, ...appHeaderAurora, ...appHealthyCarousel };
import { FloatingDotsBackground } from "./components/shell/FloatingDotsBackground";
import { ServerSettingsModal } from "./components/settings/ServerSettingsModal";
import { basenamePath } from "./lib/pathBasename";
import { applyBrokenToYaml } from "./lib/recipeDeckBroken";
import { runnerSnapshot } from "./lib/runnerState";
import { RUNNER_API_SLOT } from "../../types/index.js";

export function App(): ReactElement {
  const deck = useRecipeDeck();
  const p = deck.payload;
  const { theme, toggleTheme } = useTheme();
  const topFixedRef = useRef<HTMLDivElement>(null);

  /** Keep main content below the fixed header; height changes when the error banner or header wraps. */
  useLayoutEffect(() => {
    const el = topFixedRef.current;
    if (!el) return;
    const setOffset = () => {
      document.documentElement.style.setProperty(
        "--app-header-offset",
        `${el.offsetHeight}px`,
      );
    };
    setOffset();
    const ro = new ResizeObserver(setOffset);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--app-header-offset");
    };
  }, [deck.error]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "dark" ? "#0f172a" : "#f8fafc");
    }
  }, [theme]);

  const [stem, setStem] = useState("");
  const [yaml, setYaml] = useState("");
  const [baselineYaml, setBaselineYaml] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorSaveStatus, setEditorSaveStatus] = useState<EditorSaveStatus>("idle");

  const onEditorStemChange = useCallback((s: string) => {
    setStem(s);
  }, []);

  /** Recipe `<select>` only (not editor keystrokes): clear log so old boot output does not look tied to the new recipe. */
  const onRunningStemChange = useCallback(
    (s: string) => {
      setStem(s);
      deck.clearRunLog();
    },
    [deck],
  );

  useEffect(() => {
    setEditorSaveStatus("idle");
  }, [stem]);

  useEffect(() => {
    if (editorSaveStatus !== "saved") {
      return;
    }
    const id = window.setTimeout(() => setEditorSaveStatus("idle"), 4500);
    return () => window.clearTimeout(id);
  }, [editorSaveStatus]);

  useEffect(() => {
    if (dirty) {
      setEditorSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
    }
  }, [dirty]);

  /** Stable when the set of recipe stems is unchanged; avoids refetching on periodic payload refresh. */
  const recipeStemsKey = (p?.recipes ?? [])
    .map((r) => r.stem)
    .slice()
    .sort()
    .join("|");

  useEffect(() => {
    const stemTrim = stem.trim();
    const recipes = p?.recipes ?? [];
    if (!stemTrim) {
      setYaml("");
      setBaselineYaml("");
      setDirty(false);
      return;
    }
    const exists = recipes.some((r) => r.stem === stemTrim);
    if (!exists) {
      setBaselineYaml("");
      setDirty(yaml !== "");
      return;
    }
    let cancelled = false;
    void api.fetchRecipe(stemTrim).then(
      (r) => {
        if (!cancelled) {
          setYaml(r.content);
          setBaselineYaml(r.content);
          setDirty(false);
        }
      },
      () => {
        if (!cancelled) {
          setYaml("");
          setBaselineYaml("");
          setDirty(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `yaml` is read only when stem / recipeStemsKey change (must not be a dep or every keystroke refetches).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stem, recipeStemsKey]);

  const onYamlChange = useCallback((value: string) => {
    setYaml(value);
    setDirty(value !== baselineYaml);
  }, [baselineYaml]);

  const [pendingForce, setPendingForce] = useState(false);
  const [deleteConfirmStem, setDeleteConfirmStem] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  /** Auto-start checkbox state in the editor (checked by default for disk runs). */
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);

  const handleRunDisk = useCallback(async () => {
    if (!stem) return;
    deck.clearRunLog();
    try {
      await deck.run({
        slot: RUNNER_API_SLOT,
        recipeStem: stem,
        solo: true,
        useBuffer: false,
        autoStart: autoStartEnabled,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      window.alert(err.message ?? String(e));
    }
  }, [deck, stem, autoStartEnabled]);

  const handleRunBuffer = useCallback(async () => {
    if (!stem.trim()) return;
    deck.clearRunLog();
    try {
      await deck.run({
        slot: RUNNER_API_SLOT,
        recipeStem: stem.trim(),
        solo: true,
        useBuffer: true,
        yamlBuffer: yaml,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      window.alert(err.message ?? String(e));
    }
  }, [stem, deck, yaml]);

  const handleSaveFile = useCallback(async () => {
    if (!stem.trim()) return;
    setEditorSaveStatus("saving");
    try {
      await deck.saveRecipe(stem.trim(), yaml);
      setBaselineYaml(yaml);
      setDirty(false);
      setEditorSaveStatus("saved");
    } catch (e) {
      setEditorSaveStatus("error");
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }, [stem, deck, yaml]);

  const handleRevert = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved edits?")) return;
    setYaml(baselineYaml);
    setDirty(false);
  }, [baselineYaml, dirty]);

  const handleRecipeBrokenChange = useCallback(
    async (broken: boolean) => {
      const s = stem.trim();
      if (!s) return;
      setEditorSaveStatus("saving");
      try {
        const merged = applyBrokenToYaml(yaml, broken);
        await deck.saveRecipe(s, merged);
        setYaml(merged);
        setBaselineYaml(merged);
        setDirty(false);
        setEditorSaveStatus("saved");
      } catch (e) {
        setEditorSaveStatus("error");
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    [stem, deck, yaml],
  );

  const handleConfirmDeleteRecipe = useCallback(async () => {
    const s = deleteConfirmStem;
    setDeleteConfirmStem(null);
    if (!s) return;
    try {
      await deck.deleteRecipe(s);
      if (stem.trim() === s) {
        setStem("");
        setYaml("");
        setBaselineYaml("");
        setDirty(false);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }, [deleteConfirmStem, deck, stem]);

  const [hfDraft, setHfDraft] = useState("");

  useEffect(() => {
    if (deck.hfToken !== undefined) {
      setHfDraft(deck.hfToken);
    }
  }, [deck.hfToken]);

  const submitHf = useCallback(async () => {
    await deck.saveHf(hfDraft.trim());
  }, [deck, hfDraft]);

  /**
   * Persist when leaving the field if the user typed a non-empty value that differs from the server.
   * Never auto-clear the token on blur (empty draft + blur used to call save with "" and wipe `.env`).
   * To remove the token, use "Save token" with an empty field intentionally.
   */
  const onHfBlur = useCallback(() => {
    const next = hfDraft.trim();
    if (next === "") {
      return;
    }
    const cur = (deck.hfToken ?? "").trim();
    if (next === cur) {
      return;
    }
    void deck.saveHf(next);
  }, [deck, hfDraft]);

  const handleRestartRecipeDeck = useCallback(async () => {
    await api.postRestartRecipeDeck();
    window.setTimeout(() => {
      window.location.reload();
    }, 500);
  }, []);

  const handleDockerList = useCallback(async () => {
    const r = await api.fetchDockerContainers();
    return r.containers;
  }, []);

  const handleDockerStop = useCallback(
    async (containerId: string) => {
      await api.postDockerStop(containerId);
      await deck.refresh();
    },
    [deck],
  );

  const stemTrimForRun = stem.trim();
  const runnerSnap = runnerSnapshot(p);
  const runningThisRecipe =
    Boolean(stemTrimForRun) &&
    (runnerSnap?.phase === "BOOTING" || runnerSnap?.phase === "HEALTHY") &&
    runnerSnap?.recipeStem === stemTrimForRun;

  const isHealthyRun = runnerSnap?.phase === "HEALTHY";

  const HEALTHY_PANEL_KEY = "recipe-deck-healthy-panel";
  const [healthyPanel, setHealthyPanel] = useState<"stats" | "yaml">(() => {
    try {
      return localStorage.getItem(HEALTHY_PANEL_KEY) === "yaml" ? "yaml" : "stats";
    } catch {
      return "stats";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HEALTHY_PANEL_KEY, healthyPanel);
    } catch {
      /* ignore */
    }
  }, [healthyPanel]);

  /** When the run becomes HEALTHY, show live stats (not persisted YAML). Any transition into HEALTHY counts — fast boots can skip BOOTING in UI, and persisted "yaml" would otherwise stick. */
  const runnerPhaseRef = useRef(runnerSnap?.phase);
  useEffect(() => {
    const phase = runnerSnap?.phase;
    const prev = runnerPhaseRef.current;
    runnerPhaseRef.current = phase;
    if (phase === "HEALTHY" && prev !== "HEALTHY") {
      setHealthyPanel("stats");
    }
  }, [runnerSnap?.phase]);

  const { simpleUi } = deck;

  return (
    <>
      {simpleUi ? null : (
        <FloatingDotsBackground activityTokPerSec={runnerSnap?.tokPerSec ?? null} />
      )}
      <div className={styles.root}>
      <div ref={topFixedRef} className={styles.topFixed}>
        <div className={styles.topFixedFrost} aria-hidden />
        {simpleUi ? null : (
          <div className={styles.topFixedAurora} aria-hidden>
            <span className={`${styles.auroraRibbon} ${styles.auroraRibbon1}`} />
            <span className={`${styles.auroraRibbon} ${styles.auroraRibbon2}`} />
            <span className={`${styles.auroraRibbon} ${styles.auroraRibbon3}`} />
            <span className={`${styles.auroraRibbon} ${styles.auroraRibbon4}`} />
            <span className={`${styles.auroraRibbon} ${styles.auroraRibbon5}`} />
            <span className={`${styles.auroraRibbon} ${styles.auroraRibbon6}`} />
          </div>
        )}
        {deck.error ? <div className={styles.banner}>{deck.error}</div> : null}
        <Header
          listenHost={p?.listenHost}
          listenPort={
            p?.listenPort ??
            (window.location.port ? Number(window.location.port) : 3000)
          }
          metrics={p?.metrics ?? null}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenServerSettings={() => setServerSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
      </div>
      <main className={styles.mainScroll}>
        <div className={styles.workArea}>
          <div className={styles.runColumn}>
            <RunningModelPanel
              snap={runnerSnap}
              recipes={p?.recipes ?? []}
              logText={deck.logs.a}
              selectedStem={stem}
              onStemChange={onRunningStemChange}
              onRun={() => {
                void handleRunDisk();
              }}
              onToggleAutoStart={() => {
                setAutoStartEnabled((v) => !v);
                void deck.toggleAutoStart(!autoStartEnabled);
              }}
              onStop={() => {
                void deck.stop();
              }}
              onForce={() => {
                setPendingForce(true);
              }}
              onDockerList={handleDockerList}
              onDockerStop={handleDockerStop}
              modelCacheProgress={p?.modelCacheProgress ?? null}
              autoStartEnabled={autoStartEnabled}
            />
          </div>
          <div className={styles.editorColumn}>
            <div className={styles.editorStack}>
              {isHealthyRun && runnerSnap ? (
                <div className={styles.healthyCarouselCol}>
                  <div
                    className={styles.healthyCarouselNav}
                    role="toolbar"
                    aria-label="Switch between recipe YAML and live stats"
                  >
                    <button
                      type="button"
                      className={`${styles.healthyChevron} ${
                        healthyPanel === "yaml" ? styles.healthyChevronActive : ""
                      }`}
                      aria-label="Recipe YAML"
                      aria-pressed={healthyPanel === "yaml"}
                      onClick={() => {
                        setHealthyPanel("yaml");
                      }}
                    >
                      {"<"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.healthyChevron} ${
                        healthyPanel === "stats" ? styles.healthyChevronActive : ""
                      }`}
                      aria-label="Live stats"
                      aria-pressed={healthyPanel === "stats"}
                      onClick={() => {
                        setHealthyPanel("stats");
                      }}
                    >
                      {">"}
                    </button>
                  </div>
                  <div className={styles.editorCarouselViewport}>
                    <div
                      className={`${styles.editorCarouselTrack} ${
                        healthyPanel === "stats" ? styles.editorCarouselTrackStats : ""
                      }`}
                    >
                      <div
                        className={styles.editorCarouselPane}
                        aria-hidden={healthyPanel !== "yaml"}
                      >
                        <EditorPanel
                          recipes={p?.recipes ?? []}
                          stem={stem}
                          onStemChange={onEditorStemChange}
                          content={yaml}
                          dirty={dirty}
                          saveStatus={editorSaveStatus}
                          onContentChange={onYamlChange}
                          onSave={() => {
                            void handleSaveFile();
                          }}
                          onRunBuffer={() => {
                            void handleRunBuffer();
                          }}
                          onRevert={() => {
                            handleRevert();
                          }}
                          onBrokenChange={handleRecipeBrokenChange}
                          onRequestDelete={() => {
                            setDeleteConfirmStem(stem.trim());
                          }}
                          deleteBlocked={runningThisRecipe}
                          recipePaths={p?.recipePaths ?? null}
                        />
                      </div>
                      <div
                        className={styles.editorCarouselPane}
                        aria-hidden={healthyPanel !== "stats"}
                      >
                        <LiveStatsPanel snap={runnerSnap} metrics={p?.metrics ?? null} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <EditorPanel
                  recipes={p?.recipes ?? []}
                  stem={stem}
                  onStemChange={onEditorStemChange}
                  content={yaml}
                  dirty={dirty}
                  saveStatus={editorSaveStatus}
                  onContentChange={onYamlChange}
                  onSave={() => {
                    void handleSaveFile();
                  }}
                  onRunBuffer={() => {
                    void handleRunBuffer();
                  }}
                  onRevert={() => {
                    handleRevert();
                  }}
                  onBrokenChange={handleRecipeBrokenChange}
                  onRequestDelete={() => {
                    setDeleteConfirmStem(stem.trim());
                  }}
                  deleteBlocked={runningThisRecipe}
                  recipePaths={p?.recipePaths ?? null}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}

      {serverSettingsOpen ? (
        <ServerSettingsModal
          payload={deck.appSettings}
          recipePaths={p?.recipePaths ?? null}
          onSave={deck.saveAppSettings}
          onRestartService={handleRestartRecipeDeck}
          onClose={() => setServerSettingsOpen(false)}
          hfDraft={hfDraft}
          onHfDraftChange={setHfDraft}
          onHfBlur={onHfBlur}
          onSaveHf={() => void submitHf()}
          hfTokenLoading={deck.hfToken === undefined}
          onRefreshRecipes={() => void deck.refresh()}
          autoStartState={deck.autoStart}
          onAutoStartChange={deck.saveAutoStart}
        />
      ) : null}

      {pendingForce ? (
        <ConfirmModal
          title="Force kill the run?"
          confirmLabel="Force kill"
          danger
          onCancel={() => {
            setPendingForce(false);
          }}
          onConfirm={() => {
            setPendingForce(false);
            void deck.forceKill();
          }}
        >
          Immediately sends SIGKILL to the managed vLLM process.
        </ConfirmModal>
      ) : null}

      {deleteConfirmStem ? (
        <ConfirmModal
          title="Delete recipe?"
          confirmLabel="Delete"
          danger
          onCancel={() => {
            setDeleteConfirmStem(null);
          }}
          onConfirm={() => {
            void handleConfirmDeleteRecipe();
          }}
        >
          <p>
            This permanently deletes{" "}
            <strong>
              {(p?.recipes ?? []).find((r) => r.stem === deleteConfirmStem)?.relativePath ??
                `${basenamePath(p?.recipePaths?.recipesDir)}/${deleteConfirmStem}.yaml`}
            </strong>{" "}
            on the server. This cannot be undone.
          </p>
          {dirty && stem.trim() === deleteConfirmStem ? (
            <p>You have unsaved edits in the editor; they will be discarded.</p>
          ) : null}
        </ConfirmModal>
      ) : null}

      </div>
    </>
  );
}
