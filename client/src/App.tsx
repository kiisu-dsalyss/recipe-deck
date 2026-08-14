import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import * as api from "./api/client";
import { AppEditorPane } from "./components/app/AppEditorPane";
import { AppHealthyCarousel } from "./components/app/AppHealthyCarousel";
import { AppModalStack } from "./components/app/AppModalStack";
import { Header } from "./components/shell/Header";
import { RunningModelPanel } from "./components/runner/RunningModelPanel";
import { FloatingDotsBackground } from "./components/shell/FloatingDotsBackground";
import { useAppRecipeEditor } from "./hooks/useAppRecipeEditor";
import { useRecipeDeck } from "./hooks/useRecipeDeck";
import { useTheme } from "./hooks/useTheme";
import { runnerSnapshot } from "./lib/runnerState";
import appLayout from "./styles/app/appLayout.module.css";
import appHeaderAurora from "./styles/app/appHeaderAurora.module.css";

const styles = { ...appLayout, ...appHeaderAurora };

export function App(): ReactElement {
  const deck = useRecipeDeck();
  const p = deck.payload;
  const { theme, toggleTheme } = useTheme();
  const topFixedRef = useRef<HTMLDivElement>(null);
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const editor = useAppRecipeEditor(deck, autoStartEnabled);

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

  const [pendingForce, setPendingForce] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
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

  const stemTrimForRun = editor.stem.trim();
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

  const editorShared = {
    recipes: p?.recipes ?? [],
    stem: editor.stem,
    onStemChange: editor.onEditorStemChange,
    content: editor.yaml,
    dirty: editor.dirty,
    saveStatus: editor.editorSaveStatus,
    onContentChange: editor.onYamlChange,
    onSave: () => {
      void editor.handleSaveFile();
    },
    onRunBuffer: () => {
      void editor.handleRunBuffer();
    },
    onRevert: () => {
      editor.handleRevert();
    },
    onBrokenChange: editor.handleRecipeBrokenChange,
    onRequestDelete: () => {
      editor.setDeleteConfirmStem(editor.stem.trim());
    },
    deleteBlocked: runningThisRecipe,
    recipePaths: p?.recipePaths ?? null,
  };

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
          modelCacheProgress={p?.modelCacheProgress ?? null}
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
              selectedStem={editor.stem}
              onStemChange={editor.onRunningStemChange}
              onRun={() => {
                void editor.handleRunDisk();
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
                <AppHealthyCarousel
                  healthyPanel={healthyPanel}
                  setHealthyPanel={setHealthyPanel}
                  snap={runnerSnap}
                  metrics={p?.metrics ?? null}
                  {...editorShared}
                />
              ) : (
                <AppEditorPane {...editorShared} />
              )}
            </div>
          </div>
        </div>
      </main>

      <AppModalStack
        helpOpen={helpOpen}
        onCloseHelp={() => setHelpOpen(false)}
        serverSettingsOpen={serverSettingsOpen}
        onCloseServerSettings={() => setServerSettingsOpen(false)}
        appSettings={deck.appSettings}
        recipePaths={p?.recipePaths ?? null}
        onSaveAppSettings={deck.saveAppSettings}
        onRestartService={handleRestartRecipeDeck}
        hfDraft={hfDraft}
        onHfDraftChange={setHfDraft}
        onHfBlur={onHfBlur}
        onSaveHf={() => void submitHf()}
        hfTokenLoading={deck.hfToken === undefined}
        onRefreshRecipes={() => void deck.refresh()}
        autoStartState={deck.autoStart}
        onAutoStartChange={deck.saveAutoStart}
        pendingForce={pendingForce}
        onCancelForce={() => {
          setPendingForce(false);
        }}
        onConfirmForce={() => {
          setPendingForce(false);
          void deck.forceKill();
        }}
        deleteConfirmStem={editor.deleteConfirmStem}
        onCancelDelete={() => {
          editor.setDeleteConfirmStem(null);
        }}
        onConfirmDelete={() => {
          void editor.handleConfirmDeleteRecipe();
        }}
        recipes={p?.recipes ?? []}
        dirty={editor.dirty}
        stem={editor.stem}
      />

      </div>
    </>
  );
}
