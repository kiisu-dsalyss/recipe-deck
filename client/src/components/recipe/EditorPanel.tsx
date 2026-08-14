import type { ReactElement } from "react";
import { basenamePath } from "../../lib/pathBasename.js";
import { IconPlay, IconRevert, IconSave, IconTrash } from "../ui/glyphs.js";
import { RecipeStemSelect } from "../runner/RecipeStemSelect.js";
import { RecipeYamlDualEditor } from "./RecipeYamlDualEditor.js";
import { ToolbarIconButton } from "../ui/ToolbarIconButton.js";
import type { EditorPanelProps } from "./EditorPanel.types";
import styles from "./EditorPanel.module.css";

export type { EditorPanelProps, EditorSaveStatus } from "./EditorPanel.types";

/** Align with server `safeRecipeStem` (path segments + `/`). */
function sanitizeStem(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9._/-]/g, "")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "");
}

export function EditorPanel(props: EditorPanelProps): ReactElement {
  const {
    recipes,
    stem,
    onStemChange,
    content,
    dirty,
    saveStatus,
    onContentChange,
    onSave,
    onRunBuffer,
    onRevert,
    onBrokenChange,
    onRequestDelete,
    deleteBlocked,
    recipePaths,
  } = props;

  const dirLabel = basenamePath(recipePaths?.recipesDir);
  const selectedMeta = recipes.find((r) => r.stem === stem);
  const pathLine = stem
    ? selectedMeta?.relativePath ?? `${dirLabel}/${stem}.yaml`
    : null;

  let statusClass = styles.statusIdle;
  let statusText = "";
  if (!stem) {
    statusText =
      "Enter a recipe path (e.g. cluster/my-model) or pick a suggestion below.";
  } else if (saveStatus === "saving") {
    statusClass = styles.statusBusy;
    statusText = "Saving to server…";
  } else if (saveStatus === "error") {
    statusClass = styles.statusErr;
    statusText = "Save failed — check the banner or try again.";
  } else if (dirty) {
    statusClass = styles.statusWarn;
    statusText = `Unsaved edits — not yet written to ${pathLine}.`;
  } else if (saveStatus === "saved") {
    statusClass = styles.statusOk;
    statusText = `Wrote ${pathLine} on the server.`;
  } else if (selectedMeta) {
    statusText = `In sync with disk · ${pathLine}`;
  } else {
    statusText = `New recipe — save to create ${pathLine}`;
  }

  const canSave = Boolean(stem) && dirty && saveStatus !== "saving";

  const saveTip =
    saveStatus === "saving"
      ? "Saving to disk…"
      : "Write the editor YAML to the recipe file on the server";

  return (
    <section
      className={styles.panel}
      aria-label="YAML editor"
      data-testid="demo-section-yaml-editor"
    >
      <div className={styles.head}>
        <div className={styles.headTop}>
          <h2 className={styles.h2}>Recipe YAML</h2>
          <div className={styles.headTools}>
            {selectedMeta && onRequestDelete ? (
              <ToolbarIconButton
                variant="danger"
                label={
                  deleteBlocked
                    ? "Stop the run before deleting this recipe"
                    : "Delete this recipe file from the server"
                }
                disabled={Boolean(deleteBlocked)}
                onClick={onRequestDelete}
              >
                <IconTrash />
              </ToolbarIconButton>
            ) : null}
            <ToolbarIconButton
              variant="muted"
              label="Revert editor to last loaded / saved content"
              disabled={!stem || !dirty}
              onClick={onRevert}
            >
              <IconRevert />
            </ToolbarIconButton>
            <ToolbarIconButton
              variant="muted"
              label={saveTip}
              disabled={!canSave}
              busy={saveStatus === "saving"}
              onClick={onSave}
            >
              <IconSave />
            </ToolbarIconButton>
            <ToolbarIconButton
              variant="accent"
              label="Run using the YAML in the editor (does not save the file first)"
              disabled={!stem}
              onClick={onRunBuffer}
            >
              <IconPlay />
            </ToolbarIconButton>
          </div>
        </div>
        <span className={`${styles.meta} ${statusClass}`}>{statusText}</span>
      </div>
      <div className={styles.fileRow}>
        <div className={styles.fileNameLine}>
          <label className={styles.fileLabel} htmlFor="editor-recipe-stem">
            Recipe name
          </label>
          <div className={styles.fileNameControls}>
            <div className={styles.stemPick}>
              <RecipeStemSelect
                id="editor-recipe-stem"
                recipes={recipes}
                value={stem}
                editable
                includeEmpty={false}
                placeholder="e.g. my-recipe"
                title={`Saved under ${recipePaths?.recipesDir ?? "RECIPE_DECK_RECIPES_DIR (see server .env)"} — stem segments: letters, digits, . _ - ; use / for folders`}
                onChange={(next) => {
                  onStemChange(sanitizeStem(next));
                }}
              />
            </div>
            {selectedMeta && onBrokenChange ? (
              <label className={styles.brokenToggle}>
                <span className={styles.brokenCheckboxWrap}>
                  <input
                    type="checkbox"
                    className={styles.brokenInput}
                    checked={Boolean(selectedMeta.broken)}
                    onChange={(e) => {
                      onBrokenChange(e.target.checked);
                    }}
                  />
                  <span className={styles.brokenFace} aria-hidden />
                </span>
                <span className={styles.brokenText}>Broken recipe</span>
              </label>
            ) : null}
          </div>
        </div>
        {pathLine ? (
          <span
            className={styles.pathHint}
            title={recipePaths?.recipesDir ?? "Relative name under the server recipe directory"}
          >
            {pathLine}
          </span>
        ) : null}
      </div>
      <div className={styles.editorBody}>
        <RecipeYamlDualEditor
          key={stem || "new-recipe"}
          content={content}
          onContentChange={onContentChange}
          modsValidationEnabled={Boolean(recipePaths?.sparkRoot)}
        />
      </div>
    </section>
  );
}
