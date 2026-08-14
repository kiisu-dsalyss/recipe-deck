import type { ReactElement } from "react";
import { EditorPanel } from "../recipe/EditorPanel";
import type { AppEditorPaneProps } from "./AppEditorPane.types";

export function AppEditorPane(props: AppEditorPaneProps): ReactElement {
  return (
    <EditorPanel
      recipes={props.recipes}
      stem={props.stem}
      onStemChange={props.onStemChange}
      content={props.content}
      dirty={props.dirty}
      saveStatus={props.saveStatus}
      onContentChange={props.onContentChange}
      onSave={props.onSave}
      onRunBuffer={props.onRunBuffer}
      onRevert={props.onRevert}
      onBrokenChange={props.onBrokenChange}
      onRequestDelete={props.onRequestDelete}
      deleteBlocked={props.deleteBlocked}
      recipePaths={props.recipePaths}
    />
  );
}
