import type { ReactElement } from "react";
import {
  buildArgsToLines,
  DEFAULTS_STRUCTURED_KEYS,
  envToLines,
  getDefaultsObject,
  linesToBuildArgs,
  linesToEnv,
  parseDefaultsYaml,
} from "../../lib/sparkRecipeYaml.js";
import { getStr } from "./recipeYamlFormUtils.js";
import type { RecipeYamlFormDefaultsProps } from "./RecipeYamlForm.types.js";
import styles from "./RecipeYamlDualEditor.form.module.css";

export function RecipeYamlFormDefaults(props: RecipeYamlFormDefaultsProps): ReactElement {
  const {
    disabled,
    formDoc,
    defaultsError,
    setDefaultsError,
    patchDoc,
    setScalar,
    defaultsRestText,
    defaultsObj,
    maxModelLenCurrent,
    maxBatchedCurrent,
    maxModelLenOpts,
    maxBatchedOpts,
  } = props;

  return (
    <>
      <div className={styles.span2}>
        <div className={styles.defaultsBlock}>
          <span className={styles.fieldLabel}>defaults</span>
          <p className={styles.defaultsHint}>
            Length limits use fixed presets. <code className={styles.codeInline}>enforce_eager</code> is a
            vLLM engine toggle. Anything else goes under other defaults.
          </p>
          <div className={styles.defaultsGrid}>
            <label className={styles.selectWrap} htmlFor="rf-defaults-max-model-len">
              <span className={styles.selectLabel}>max_model_len</span>
              <select
                id="rf-defaults-max-model-len"
                className={styles.fieldSelect}
                disabled={disabled}
                value={maxModelLenCurrent === undefined ? "" : String(maxModelLenCurrent)}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = { ...formDoc };
                  const d = getDefaultsObject(formDoc.defaults);
                  if (v === "") {
                    delete d.max_model_len;
                  } else {
                    d.max_model_len = Number.parseInt(v, 10);
                  }
                  if (Object.keys(d).length === 0) {
                    delete next.defaults;
                  } else {
                    next.defaults = d;
                  }
                  patchDoc(next);
                }}
              >
                <option value="">—</option>
                {maxModelLenOpts.map((n) => (
                  <option key={n} value={String(n)}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.selectWrap} htmlFor="rf-defaults-max-batched">
              <span className={styles.selectLabel}>max_num_batched_tokens</span>
              <select
                id="rf-defaults-max-batched"
                className={styles.fieldSelect}
                disabled={disabled}
                value={maxBatchedCurrent === undefined ? "" : String(maxBatchedCurrent)}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = { ...formDoc };
                  const d = getDefaultsObject(formDoc.defaults);
                  if (v === "") {
                    delete d.max_num_batched_tokens;
                  } else {
                    d.max_num_batched_tokens = Number.parseInt(v, 10);
                  }
                  if (Object.keys(d).length === 0) {
                    delete next.defaults;
                  } else {
                    next.defaults = d;
                  }
                  patchDoc(next);
                }}
              >
                <option value="">—</option>
                {maxBatchedOpts.map((n) => (
                  <option key={n} value={String(n)}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={defaultsObj.enforce_eager === true}
              disabled={disabled}
              onChange={(e) => {
                const next = { ...formDoc };
                const d = getDefaultsObject(formDoc.defaults);
                if (e.target.checked) {
                  d.enforce_eager = true;
                } else {
                  delete d.enforce_eager;
                }
                if (Object.keys(d).length === 0) {
                  delete next.defaults;
                } else {
                  next.defaults = d;
                }
                patchDoc(next);
              }}
            />
            <span>enforce_eager</span>
          </label>
          <label className={styles.fieldLabel} htmlFor="rf-defaults-rest">
            other defaults (YAML)
          </label>
          <textarea
            id="rf-defaults-rest"
            className={styles.fieldTextarea}
            rows={6}
            value={defaultsRestText}
            disabled={disabled}
            onChange={(e) => {
              const t = e.target.value;
              if (!t.trim()) {
                setDefaultsError("");
                const prev = getDefaultsObject(formDoc.defaults);
                const keep: Record<string, unknown> = {};
                for (const k of DEFAULTS_STRUCTURED_KEYS) {
                  if (prev[k] !== undefined) {
                    keep[k] = prev[k];
                  }
                }
                const next = { ...formDoc };
                if (Object.keys(keep).length === 0) {
                  delete next.defaults;
                } else {
                  next.defaults = keep;
                }
                patchDoc(next);
                return;
              }
              const parsed = parseDefaultsYaml(t);
              if (parsed === null) {
                setDefaultsError("Invalid YAML for other defaults");
                return;
              }
              setDefaultsError("");
              const prev = getDefaultsObject(formDoc.defaults);
              const merged = { ...parsed };
              for (const k of DEFAULTS_STRUCTURED_KEYS) {
                if (prev[k] !== undefined) {
                  merged[k] = prev[k];
                }
              }
              const next = { ...formDoc };
              next.defaults = merged;
              patchDoc(next);
            }}
          />
          {defaultsError ? <p className={styles.fieldError}>{defaultsError}</p> : null}
        </div>
      </div>
      <div className={styles.span2}>
        <label className={styles.fieldLabel} htmlFor="rf-env">
          env (KEY=value per line)
        </label>
        <textarea
          id="rf-env"
          className={styles.fieldTextarea}
          rows={4}
          value={envToLines(formDoc.env)}
          disabled={disabled}
          onChange={(e) => {
            const next = { ...formDoc };
            const env = linesToEnv(e.target.value);
            if (Object.keys(env).length === 0) {
              delete next.env;
            } else {
              next.env = env;
            }
            patchDoc(next);
          }}
        />
      </div>
      <div className={styles.span2}>
        <label className={styles.fieldLabel} htmlFor="rf-build">
          build_args (one arg per line)
        </label>
        <textarea
          id="rf-build"
          className={styles.fieldTextarea}
          rows={3}
          value={buildArgsToLines(formDoc.build_args)}
          disabled={disabled}
          onChange={(e) => {
            const next = { ...formDoc };
            const a = linesToBuildArgs(e.target.value);
            if (a.length === 0) {
              delete next.build_args;
            } else {
              next.build_args = a;
            }
            patchDoc(next);
          }}
        />
      </div>
      <div className={styles.span2}>
        <label className={styles.fieldLabel} htmlFor="rf-cmd">
          command
        </label>
        <textarea
          id="rf-cmd"
          className={`${styles.fieldTextarea} ${styles.commandTa}`}
          rows={12}
          value={getStr(formDoc, "command")}
          disabled={disabled}
          onChange={(e) => {
            setScalar("command", e.target.value);
          }}
        />
      </div>
    </>
  );
}
