import YAML from "yaml";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { fetchDockerImageOptions, postRecipeModsStatus } from "../../api/client.js";
import {
  defaultsToYamlRest,
  getDefaultsObject,
  safeParseYaml,
  stringifyRecipe,
} from "../../lib/sparkRecipeYaml.js";
import { RecipeYamlForm } from "./RecipeYamlForm.js";
import type { RecipeYamlDualEditorProps } from "./RecipeYamlDualEditor.types.js";
import {
  getStr,
  initModLinesFromDoc,
  MAX_MODEL_LEN_OPTIONS,
  MAX_NUM_BATCHED_TOKENS_OPTIONS,
  getNumericDefault,
  optionsWithCurrent,
  stripRecipeVersionSuffix,
} from "./recipeYamlFormUtils.js";
import recipeYamlShell from "./RecipeYamlDualEditor.shell.module.css";

const styles = recipeYamlShell;

const RAW_MODE_TOOLTIP =
  "Apply validates YAML and updates the form. Switch to form requires valid YAML. Comments and formatting may change when round-tripping through the form.";

const FORM_MODE_TOOLTIP =
  "Top-level keys you do not edit here stay on the document (e.g. recipe_deck). Comments and key order may change when the file is saved (YAML round-trip). Use Raw YAML for full control or uncommon keys.";

/**
 * Form vs raw YAML editor (pattern from llama-cpp-recipe-deck: segmented toggle, raw apply/reset).
 * Form maps common spark-vllm `run-recipe.py` recipe fields; unknown keys stay in the document.
 */
export function RecipeYamlDualEditor(props: RecipeYamlDualEditorProps): ReactElement {
  const { content, onContentChange, disabled, modsValidationEnabled = true } = props;

  const [rawMode, setRawMode] = useState(true);
  const [formDoc, setFormDoc] = useState<Record<string, unknown>>(() => safeParseYaml(content));
  const [rawDraft, setRawDraft] = useState(content);
  const [rawError, setRawError] = useState("");
  const [defaultsError, setDefaultsError] = useState("");
  const [modLines, setModLines] = useState<string[]>(() => initModLinesFromDoc(safeParseYaml(content).mods));
  const [modsExists, setModsExists] = useState<boolean[] | null>(null);
  const [containerImageOptions, setContainerImageOptions] = useState<string[] | null>(null);
  const [containerImageOptionsLoading, setContainerImageOptionsLoading] = useState(false);
  const [containerImageOptionsErr, setContainerImageOptionsErr] = useState<string | null>(null);

  const loadContainerImageOptions = useCallback(async () => {
    setContainerImageOptionsLoading(true);
    setContainerImageOptionsErr(null);
    try {
      const { images } = await fetchDockerImageOptions();
      setContainerImageOptions(images);
    } catch (e) {
      setContainerImageOptionsErr(e instanceof Error ? e.message : String(e));
      setContainerImageOptions([]);
    } finally {
      setContainerImageOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!rawMode) {
      void loadContainerImageOptions();
    }
  }, [rawMode, loadContainerImageOptions]);

  useEffect(() => {
    setRawDraft(content);
    setRawError("");
    try {
      if (!content.trim()) {
        setFormDoc({});
        return;
      }
      const v = YAML.parse(content);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        setFormDoc(v as Record<string, unknown>);
      }
    } catch {
      /* Invalid YAML while editing raw — parent still holds the draft; keep form in sync only when parse succeeds. */
    }
  }, [content]);

  const modsSerialized = JSON.stringify(formDoc.mods ?? null);
  useEffect(() => {
    setModLines(initModLinesFromDoc(formDoc.mods));
    // `modsSerialized` is the dependency: stable proxy for `formDoc.mods` (avoids churn from object identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modsSerialized]);

  useEffect(() => {
    if (!modsValidationEnabled || rawMode) {
      setModsExists(null);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const { exists } = await postRecipeModsStatus(modLines);
          setModsExists(exists.length === modLines.length ? exists : null);
        } catch {
          setModsExists(null);
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [modLines, modsValidationEnabled, rawMode]);

  const patchDoc = useCallback(
    (next: Record<string, unknown>) => {
      setFormDoc(next);
      onContentChange(stringifyRecipe(next));
    },
    [onContentChange],
  );

  const syncRawFromForm = useCallback(() => {
    setRawDraft(stringifyRecipe(formDoc));
    setRawError("");
  }, [formDoc]);

  const applyRawYaml = useCallback(() => {
    try {
      const v = YAML.parse(rawDraft);
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        throw new Error("Root value must be a YAML mapping (object).");
      }
      const next = v as Record<string, unknown>;
      patchDoc(next);
      setRawError("");
    } catch (e) {
      setRawError(e instanceof Error ? e.message : "Invalid YAML");
    }
  }, [rawDraft, patchDoc]);

  const goToRaw = useCallback(() => {
    syncRawFromForm();
    setRawMode(true);
  }, [syncRawFromForm]);

  const goToForm = useCallback(() => {
    try {
      const v = YAML.parse(rawDraft);
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        throw new Error("Root value must be a YAML mapping (object).");
      }
      patchDoc(v as Record<string, unknown>);
      setRawMode(false);
      setRawError("");
    } catch (e) {
      setRawError(e instanceof Error ? e.message : "Invalid YAML");
    }
  }, [rawDraft, patchDoc]);

  const setScalar = (key: string, value: string | boolean | number) => {
    const next = { ...formDoc };
    if (value === "" && typeof value === "string") {
      delete next[key];
    } else {
      next[key] = value;
    }
    patchDoc(next);
  };

  const applyRecipeVersionChange = useCallback(
    (ver: string) => {
      const trimmed = ver.trim();
      const next: Record<string, unknown> = { ...formDoc };
      if (trimmed === "") {
        delete next.recipe_version;
      } else {
        next.recipe_version = trimmed;
      }
      const currentName = getStr(formDoc, "name");
      const base = stripRecipeVersionSuffix(currentName);
      if (trimmed === "") {
        if (base) {
          next.name = base;
        } else {
          delete next.name;
        }
      } else {
        next.name = base ? `${base} · v${trimmed}` : `v${trimmed}`;
      }
      patchDoc(next);
    },
    [formDoc, patchDoc],
  );

  const defaultsRestText = defaultsToYamlRest(formDoc.defaults);
  const defaultsObj = getDefaultsObject(formDoc.defaults);
  const maxModelLenCurrent = getNumericDefault(defaultsObj, "max_model_len");
  const maxBatchedCurrent = getNumericDefault(defaultsObj, "max_num_batched_tokens");
  const maxModelLenOpts = optionsWithCurrent(MAX_MODEL_LEN_OPTIONS, maxModelLenCurrent);
  const maxBatchedOpts = optionsWithCurrent(MAX_NUM_BATCHED_TOKENS_OPTIONS, maxBatchedCurrent);

  const containerVal = getStr(formDoc, "container");
  const containerSelectOptions = useMemo(() => {
    const base = containerImageOptions ?? [];
    const set = new Set<string>(base);
    const t = containerVal.trim();
    if (t) {
      set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [containerImageOptions, containerVal]);

  return (
    <div className={styles.root}>
      <div
        className={styles.modeRow}
        title={rawMode ? RAW_MODE_TOOLTIP : FORM_MODE_TOOLTIP}
      >
        <span className={styles.modeLabel}>Editor mode</span>
        <div className={styles.segment} role="group" aria-label="Editor mode">
          <button
            type="button"
            className={`${styles.segmentBtn} ${!rawMode ? styles.segmentBtnActive : ""}`}
            disabled={disabled}
            onClick={() => {
              if (rawMode) {
                goToForm();
              }
            }}
          >
            Form
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${rawMode ? styles.segmentBtnActive : ""}`}
            disabled={disabled}
            onClick={() => {
              goToRaw();
            }}
          >
            Raw YAML
          </button>
        </div>
      </div>

      {rawMode ? (
        <div className={styles.rawArea}>
          <textarea
            className={styles.rawTa}
            spellCheck={false}
            value={rawDraft}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setRawDraft(next);
              setRawError("");
              onContentChange(next);
            }}
            aria-label="Raw recipe YAML"
          />
          {rawError ? <div className={styles.rawError}>{rawError}</div> : null}
          <div className={styles.rawActions}>
            <button type="button" className={styles.btnGhost} disabled={disabled} onClick={applyRawYaml}>
              Apply raw YAML
            </button>
            <button type="button" className={styles.btnGhost} disabled={disabled} onClick={syncRawFromForm}>
              Reset to current form
            </button>
          </div>
        </div>
      ) : (
        <RecipeYamlForm
          disabled={disabled}
          formDoc={formDoc}
          defaultsError={defaultsError}
          setDefaultsError={setDefaultsError}
          modLines={modLines}
          setModLines={setModLines}
          modsExists={modsExists}
          containerVal={containerVal}
          containerSelectOptions={containerSelectOptions}
          containerImageOptionsLoading={containerImageOptionsLoading}
          containerImageOptionsErr={containerImageOptionsErr}
          loadContainerImageOptions={loadContainerImageOptions}
          patchDoc={patchDoc}
          setScalar={setScalar}
          applyRecipeVersionChange={applyRecipeVersionChange}
          defaultsRestText={defaultsRestText}
          defaultsObj={defaultsObj}
          maxModelLenCurrent={maxModelLenCurrent}
          maxBatchedCurrent={maxBatchedCurrent}
          maxModelLenOpts={maxModelLenOpts}
          maxBatchedOpts={maxBatchedOpts}
        />
      )}
    </div>
  );
}
