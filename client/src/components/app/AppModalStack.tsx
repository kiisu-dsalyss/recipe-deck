import type { ReactElement } from "react";
import { ConfirmModal } from "../modals/ConfirmModal";
import { HelpModal } from "../modals/HelpModal";
import { ServerSettingsModal } from "../settings/ServerSettingsModal";
import { basenamePath } from "../../lib/pathBasename";
import type { AppModalStackProps } from "./AppModalStack.types";

export function AppModalStack(props: AppModalStackProps): ReactElement {
  return (
    <>
      {props.helpOpen ? <HelpModal onClose={props.onCloseHelp} /> : null}

      {props.serverSettingsOpen ? (
        <ServerSettingsModal
          payload={props.appSettings}
          recipePaths={props.recipePaths}
          onSave={props.onSaveAppSettings}
          onRestartService={props.onRestartService}
          onClose={props.onCloseServerSettings}
          hfDraft={props.hfDraft}
          onHfDraftChange={props.onHfDraftChange}
          onHfBlur={props.onHfBlur}
          onSaveHf={props.onSaveHf}
          hfTokenLoading={props.hfTokenLoading}
          onRefreshRecipes={props.onRefreshRecipes}
          autoStartState={props.autoStartState}
          onAutoStartChange={props.onAutoStartChange}
        />
      ) : null}

      {props.pendingForce ? (
        <ConfirmModal
          title="Force kill the run?"
          confirmLabel="Force kill"
          danger
          onCancel={props.onCancelForce}
          onConfirm={props.onConfirmForce}
        >
          Immediately sends SIGKILL to the managed vLLM process.
        </ConfirmModal>
      ) : null}

      {props.deleteConfirmStem ? (
        <ConfirmModal
          title="Delete recipe?"
          confirmLabel="Delete"
          danger
          onCancel={props.onCancelDelete}
          onConfirm={props.onConfirmDelete}
        >
          <p>
            This permanently deletes{" "}
            <strong>
              {props.recipes.find((r) => r.stem === props.deleteConfirmStem)?.relativePath ??
                `${basenamePath(props.recipePaths?.recipesDir)}/${props.deleteConfirmStem}.yaml`}
            </strong>{" "}
            on the server. This cannot be undone.
          </p>
          {props.dirty && props.stem.trim() === props.deleteConfirmStem ? (
            <p>You have unsaved edits in the editor; they will be discarded.</p>
          ) : null}
        </ConfirmModal>
      ) : null}
    </>
  );
}
