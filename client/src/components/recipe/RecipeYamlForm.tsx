import type { ReactElement } from "react";
import { IconRefresh } from "../ui/glyphs.js";
import { GlassSelect } from "../ui/GlassSelect.js";
import { ToolbarIconButton } from "../ui/ToolbarIconButton.js";
import { RecipeYamlFormDefaults } from "./RecipeYamlFormDefaults.js";
import { RecipeYamlFormMods } from "./RecipeYamlFormMods.js";
import { getBool, getStr } from "./recipeYamlFormUtils.js";
import type { RecipeYamlFormProps } from "./RecipeYamlForm.types.js";
import styles from "./RecipeYamlDualEditor.form.module.css";

export function RecipeYamlForm(props: RecipeYamlFormProps): ReactElement {
  const {
    disabled,
    formDoc,
    defaultsError,
    setDefaultsError,
    modLines,
    setModLines,
    modsExists,
    containerVal,
    containerSelectOptions,
    containerImageOptionsLoading,
    containerImageOptionsErr,
    loadContainerImageOptions,
    patchDoc,
    setScalar,
    applyRecipeVersionChange,
    defaultsRestText,
    defaultsObj,
    maxModelLenCurrent,
    maxBatchedCurrent,
    maxModelLenOpts,
    maxBatchedOpts,
  } = props;

  return (
    <div className={styles.formWrap}>
      <div className={styles.formGrid}>
        <div className={styles.span2}>
          <label className={styles.fieldLabel} htmlFor="rf-version">
            recipe_version
          </label>
          <input
            id="rf-version"
            className={styles.fieldInput}
            value={getStr(formDoc, "recipe_version")}
            disabled={disabled}
            onChange={(e) => {
              applyRecipeVersionChange(e.target.value);
            }}
            autoComplete="off"
            title="Changing this updates the display name with a · v… suffix."
          />
          <p className={styles.fieldHint}>
            Updates the name field below to base title plus &quot; · v&quot; and the version. Any
            previous suffix in that form is replaced. Clearing version strips it from the name.
          </p>
        </div>
        <div className={styles.span2}>
          <label className={styles.fieldLabel} htmlFor="rf-name">
            name
          </label>
          <input
            id="rf-name"
            className={styles.fieldInput}
            value={getStr(formDoc, "name")}
            disabled={disabled}
            onChange={(e) => {
              setScalar("name", e.target.value);
            }}
            autoComplete="off"
          />
        </div>
        <div className={styles.span2}>
          <label className={styles.fieldLabel} htmlFor="rf-container">
            container
          </label>
          <div className={styles.fieldContainerWrap}>
            <GlassSelect
              id="rf-container"
              layout="grow"
              disabled={disabled}
              value={containerVal}
              onChange={(v) => {
                setScalar("container", v);
              }}
              groups={[
                {
                  items: containerSelectOptions.map((img) => ({
                    value: img,
                    label: img,
                  })),
                },
              ]}
            />
            <div className={styles.fieldContainerRefresh}>
              <ToolbarIconButton
                variant="muted"
                label={
                  containerImageOptionsLoading
                    ? "Scanning Docker images…"
                    : "Refresh image list from Docker"
                }
                disabled={disabled || containerImageOptionsLoading}
                busy={containerImageOptionsLoading}
                onClick={() => {
                  void loadContainerImageOptions();
                }}
              >
                <IconRefresh />
              </ToolbarIconButton>
            </div>
          </div>
          <p className={styles.fieldHint}>
            Refresh reloads images from Docker. The current tag stays in the list; anything else, edit Raw YAML.
          </p>
          {containerImageOptionsErr ? (
            <p className={styles.fieldHint} role="status">
              {containerImageOptionsErr}
            </p>
          ) : null}
        </div>
        <div className={styles.span2}>
          <label className={styles.fieldLabel} htmlFor="rf-desc">
            description
          </label>
          <input
            id="rf-desc"
            className={styles.fieldInput}
            value={getStr(formDoc, "description")}
            disabled={disabled}
            onChange={(e) => {
              setScalar("description", e.target.value);
            }}
            autoComplete="off"
          />
        </div>
        <div className={styles.span2}>
          <label className={styles.fieldLabel} htmlFor="rf-model">
            model (HF id)
          </label>
          <input
            id="rf-model"
            className={styles.fieldInput}
            value={getStr(formDoc, "model")}
            disabled={disabled}
            onChange={(e) => {
              setScalar("model", e.target.value);
            }}
            autoComplete="off"
          />
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              checked={getBool(formDoc, "cluster_only")}
              disabled={disabled}
              onChange={(e) => {
                const next = { ...formDoc };
                if (!e.target.checked) {
                  delete next.cluster_only;
                } else {
                  next.cluster_only = true;
                }
                patchDoc(next);
              }}
            />
            cluster_only
          </label>
          <label>
            <input
              type="checkbox"
              checked={getBool(formDoc, "solo_only")}
              disabled={disabled}
              onChange={(e) => {
                const next = { ...formDoc };
                if (!e.target.checked) {
                  delete next.solo_only;
                } else {
                  next.solo_only = true;
                }
                patchDoc(next);
              }}
            />
            solo_only
          </label>
        </div>
        <RecipeYamlFormMods
          disabled={disabled}
          formDoc={formDoc}
          modLines={modLines}
          modsExists={modsExists}
          patchDoc={patchDoc}
          setModLines={setModLines}
        />
        <RecipeYamlFormDefaults
          disabled={disabled}
          formDoc={formDoc}
          defaultsError={defaultsError}
          setDefaultsError={setDefaultsError}
          patchDoc={patchDoc}
          setScalar={setScalar}
          defaultsRestText={defaultsRestText}
          defaultsObj={defaultsObj}
          maxModelLenCurrent={maxModelLenCurrent}
          maxBatchedCurrent={maxBatchedCurrent}
          maxModelLenOpts={maxModelLenOpts}
          maxBatchedOpts={maxBatchedOpts}
        />
      </div>
    </div>
  );
}
