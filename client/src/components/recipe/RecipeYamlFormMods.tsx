import type { ReactElement } from "react";
import { linesToMods } from "../../lib/sparkRecipeYaml.js";
import type { RecipeYamlFormModsProps } from "./RecipeYamlForm.types.js";
import styles from "./RecipeYamlDualEditor.form.module.css";

export function RecipeYamlFormMods(props: RecipeYamlFormModsProps): ReactElement {
  const { disabled, formDoc, modLines, modsExists, patchDoc, setModLines } = props;

  return (
    <div className={styles.span2}>
      <label className={styles.fieldLabel} htmlFor="rf-mods-0">
        mods (one path per line, under{" "}
        <code className={styles.codeInline}>$SPARK_VLLM_ROOT/mods/</code>)
      </label>
      <div className={styles.modsStack}>
        {modLines.map((line, i) => {
          const missing =
            modsExists !== null &&
            modsExists.length === modLines.length &&
            line.trim() !== "" &&
            modsExists[i] === false;
          return (
            <div key={i} className={styles.modsRow}>
              {missing ? (
                <span
                  className={styles.modsWarn}
                  title="Path not found on server under mods/"
                  aria-hidden
                >
                  !
                </span>
              ) : (
                <span className={styles.modsWarnPad} aria-hidden />
              )}
              <input
                id={i === 0 ? "rf-mods-0" : undefined}
                type="text"
                className={missing ? `${styles.modsInput} ${styles.modsInputMissing}` : styles.modsInput}
                aria-invalid={missing}
                spellCheck={false}
                autoComplete="off"
                disabled={disabled}
                value={line}
                onChange={(e) => {
                  const next = [...modLines];
                  next[i] = e.target.value;
                  if (i === next.length - 1 && e.target.value.trim() !== "") {
                    next.push("");
                  }
                  setModLines(next);
                  const merged = linesToMods(next.join("\n"));
                  const patch = { ...formDoc };
                  if (merged.length === 0) {
                    delete patch.mods;
                  } else {
                    patch.mods = merged;
                  }
                  patchDoc(patch);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
