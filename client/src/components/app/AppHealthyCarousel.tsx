import type { ReactElement } from "react";
import { LiveStatsPanel } from "../metrics/LiveStatsPanel";
import { AppEditorPane } from "./AppEditorPane";
import type { AppHealthyCarouselProps } from "./AppHealthyCarousel.types";
import styles from "../../styles/app/appHealthyCarousel.module.css";

export function AppHealthyCarousel(props: AppHealthyCarouselProps): ReactElement {
  const editor = (
    <AppEditorPane
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

  return (
    <div className={styles.healthyCarouselCol}>
      <div
        className={styles.healthyCarouselNav}
        role="toolbar"
        aria-label="Switch between recipe YAML and live stats"
      >
        <button
          type="button"
          className={`${styles.healthyChevron} ${
            props.healthyPanel === "yaml" ? styles.healthyChevronActive : ""
          }`}
          aria-label="Recipe YAML"
          aria-pressed={props.healthyPanel === "yaml"}
          onClick={() => {
            props.setHealthyPanel("yaml");
          }}
        >
          {"<"}
        </button>
        <button
          type="button"
          className={`${styles.healthyChevron} ${
            props.healthyPanel === "stats" ? styles.healthyChevronActive : ""
          }`}
          aria-label="Live stats"
          aria-pressed={props.healthyPanel === "stats"}
          onClick={() => {
            props.setHealthyPanel("stats");
          }}
        >
          {">"}
        </button>
      </div>
      <div className={styles.editorCarouselViewport}>
        <div
          className={`${styles.editorCarouselTrack} ${
            props.healthyPanel === "stats" ? styles.editorCarouselTrackStats : ""
          }`}
        >
          <div
            className={styles.editorCarouselPane}
            aria-hidden={props.healthyPanel !== "yaml"}
          >
            {editor}
          </div>
          <div
            className={styles.editorCarouselPane}
            aria-hidden={props.healthyPanel !== "stats"}
          >
            <LiveStatsPanel snap={props.snap} metrics={props.metrics} />
          </div>
        </div>
      </div>
    </div>
  );
}
