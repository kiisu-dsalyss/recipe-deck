import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { AppSettingsEffective } from "../../api/client";
import { SPARK_VLLM_DOCKER_REPO_URL } from "../../constants/upstream";
import { HfTokenField } from "./HfTokenField";
import styles from "./AppSettingsPanel.module.css";
import type { RecipeDeckPathsPayload } from "../../../../types/index.js";

export function AppSettingsFormSections(props: {
  draft: AppSettingsEffective;
  setDraft: Dispatch<SetStateAction<AppSettingsEffective | null>>;
  recipePaths?: RecipeDeckPathsPayload | null;
  sparkVllmRoot: string;
  hfDraft: string;
  onHfDraftChange: (value: string) => void;
  onHfBlur: () => void;
  onSaveHf: () => void | Promise<void>;
  hfTokenLoading: boolean;
  onRefreshRecipes: () => void | Promise<void>;
  autoStartState: { recipeStem: string | null; autoStart: boolean } | null;
  onAutoStartChange: (stem: string, enabled: boolean) => Promise<void>;
}): ReactElement {
  const {
    draft,
    setDraft,
    recipePaths,
    sparkVllmRoot,
    hfDraft,
    onHfDraftChange,
    onHfBlur,
    onSaveHf,
    hfTokenLoading,
    onRefreshRecipes,
    autoStartState,
    onAutoStartChange,
  } = props;

  return (
    <>
      {recipePaths ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Paths</legend>
          <p className={styles.p}>
            Set <code className={styles.code}>RECIPE_DECK_RECIPES_DIR</code>,{" "}
            <code className={styles.code}>RECIPE_DECK_TEMP_DIR</code>,{" "}
            <code className={styles.code}>RUN_RECIPE_PY</code>, or{" "}
            <code className={styles.code}>RUN_RECIPE_SH</code> in the same file as{" "}
            <code className={styles.code}>HF_TOKEN</code> (typically{" "}
            <code className={`${styles.code} ${styles.codeBreak}`}>{recipePaths.envFile}</code>
            ). Restart Recipe Deck after changing paths.
          </p>
          <p className={styles.p}>
            <strong>Recipes dir</strong>{" "}
            <code className={`${styles.code} ${styles.codeBreak}`}>{recipePaths.recipesDir}</code>
          </p>
          <p className={styles.p}>
            <strong>Temp runs</strong>{" "}
            <code className={`${styles.code} ${styles.codeBreak}`}>{recipePaths.tempRunsDir}</code>
          </p>
          <p className={styles.p}>
            <strong>run-recipe.py</strong>{" "}
            <code className={`${styles.code} ${styles.codeBreak}`}>{recipePaths.runRecipePy}</code>
          </p>
          <p className={styles.p}>
            <strong>run-recipe.sh</strong>{" "}
            <code className={`${styles.code} ${styles.codeBreak}`}>{recipePaths.runRecipeSh}</code>
          </p>
        </fieldset>
      ) : null}

      <div className={styles.about}>
        <h3 className={styles.h}>About</h3>
        <p className={styles.p}>
          Same dependency as this dialog:{" "}
          <a className={styles.link} href={SPARK_VLLM_DOCKER_REPO_URL} rel="noopener noreferrer">
            spark-vllm-docker
          </a>{" "}
          (
          <code className={styles.code}>run-recipe.py</code>, <code className={styles.code}>recipes/</code>,{" "}
          <code className={styles.code}>.env</code>). Fields here map to env keys the server writes;
          see repository <code className={styles.code}>README.md</code> /{" "}
          <code className={styles.code}>docs/ARCHITECTURE.md</code> for API and layout.
        </p>
        <p className={styles.p}>
          <strong>SPARK_VLLM_ROOT</strong> (this process):{" "}
          <code className={`${styles.code} ${styles.codeBreak}`}>{sparkVllmRoot}</code>
        </p>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Ports</legend>
        <label className={styles.row}>
          <span className={styles.label}>Recipe Deck (HTTP)</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={65535}
            value={draft.switcherPort}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, switcherPort: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
        <label className={styles.row}>
          <span className={styles.label}>vLLM listen port</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={65535}
            value={draft.vllmPortA}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, vllmPortA: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Interpreter</legend>
        <label className={styles.row}>
          <span className={styles.label}>Python</span>
          <input
            className={styles.input}
            type="text"
            value={draft.python}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, python: e.target.value } : d));
            }}
            spellCheck={false}
          />
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Health</legend>
        <label className={styles.row}>
          <span className={styles.label}>READY_REGEX</span>
          <input
            className={styles.inputWide}
            type="text"
            value={draft.readyRegex}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, readyRegex: e.target.value } : d));
            }}
            spellCheck={false}
          />
        </label>
        <label className={styles.row}>
          <span className={styles.label}>Health probe timeout (ms)</span>
          <input
            className={styles.input}
            type="number"
            min={1000}
            step={1000}
            value={draft.healthProbeTimeoutMs}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, healthProbeTimeoutMs: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
        <label className={styles.row}>
          <span className={styles.label}>SIGTERM grace (ms)</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            step={1000}
            value={draft.bootSigtermGraceMs}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, bootSigtermGraceMs: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Polling</legend>
        <label className={styles.row}>
          <span className={styles.label}>Disk stats (ms)</span>
          <input
            className={styles.input}
            type="number"
            min={1000}
            step={1000}
            value={draft.diskStatsIntervalMs}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, diskStatsIntervalMs: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
        <label className={styles.row}>
          <span className={styles.label}>GPU stats (ms)</span>
          <input
            className={styles.input}
            type="number"
            min={1000}
            step={1000}
            value={draft.gpuStatsIntervalMs}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, gpuStatsIntervalMs: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
        <label className={styles.row}>
          <span className={styles.label}>vLLM metrics (ms)</span>
          <input
            className={styles.input}
            type="number"
            min={500}
            step={500}
            value={draft.vllmMetricsIntervalMs}
            onChange={(e) => {
              setDraft((d) =>
                d ? { ...d, vllmMetricsIntervalMs: Number(e.target.value) } : d,
              );
            }}
          />
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Hugging Face</legend>
        <p className={styles.p}>
          {hfTokenLoading
            ? "Checking server…"
            : "Token is stored in $SPARK_VLLM_ROOT/.env. Use the eye to show or hide. Clears when you save an empty field. Runs started from this UI pick it up automatically; a shell does not unless you source that file."}
        </p>
        {!hfTokenLoading ? (
          <>
            <HfTokenField
              id="settings-hf-token"
              placeholder="Paste token"
              value={hfDraft}
              onChange={onHfDraftChange}
              onBlur={onHfBlur}
            />
            <div className={styles.hfActions}>
              <button type="button" className={styles.btn} onClick={() => void onSaveHf()}>
                Save token
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => void onRefreshRecipes()}
              >
                Refresh recipe list
              </button>
            </div>
          </>
        ) : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Appearance</legend>
        <label className={styles.rowCheck}>
          <input
            type="checkbox"
            checked={draft.simpleUi ?? false}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, simpleUi: e.target.checked } : d));
            }}
          />
          <span className={styles.checkLabel}>Simple UI</span>
        </label>
        <p className={styles.p}>
          Disables animated background dots and the header aurora. Applies after you save (no restart).
        </p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Auto-start</legend>
        <p className={styles.p}>
          When enabled, this recipe will automatically start the next time Recipe Deck boots.
          State is stored in <code className={styles.code}>.current-recipe</code> at the app root.
        </p>
        {autoStartState?.recipeStem ? (
          <label className={styles.rowCheck}>
            <input
              type="checkbox"
              checked={autoStartState.autoStart}
              onChange={(e) => {
                if (autoStartState.recipeStem) {
                  void onAutoStartChange(autoStartState.recipeStem!, e.target.checked);
                }
              }}
            />
            <span className={styles.checkLabel}>
              Auto-start {autoStartState.recipeStem} at boot
            </span>
          </label>
        ) : (
          <p className={styles.p} style={{ fontStyle: "italic", color: "var(--color-muted)" }}>
            No recipe configured for auto-start. Run a recipe from the editor with "Auto start at boot" enabled to configure this.
          </p>
        )}
      </fieldset>
    </>
  );
}
