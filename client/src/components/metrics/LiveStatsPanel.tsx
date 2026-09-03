import type { ReactElement } from "react";
import { DEFAULT_LIVE_STAT_TILES, renderLiveStatTiles } from "./liveStats/defaultRegistry";
import type { LiveStatsPanelProps } from "./LiveStatsPanel.types";
import styles from "./LiveStatsPanel.module.css";

export type { LiveStatsPanelProps } from "./LiveStatsPanel.types";

export function LiveStatsPanel(props: LiveStatsPanelProps): ReactElement {
  const { snap, metrics } = props;

  return (
    <section
      className={styles.panel}
      aria-label="Live inference stats"
      data-testid="live-stats-panel"
    >
      <div className={styles.head}>
        <h2 className={styles.h2}>Live stats</h2>
        {snap.servedModels?.length ? (
          <p className={styles.sub}>{snap.servedModels.join(", ")}</p>
        ) : null}
      </div>

      <div className={styles.grid}>
        {renderLiveStatTiles(DEFAULT_LIVE_STAT_TILES, { snap, metrics })}
      </div>
    </section>
  );
}
