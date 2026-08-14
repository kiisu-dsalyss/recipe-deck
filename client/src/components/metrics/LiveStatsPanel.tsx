import type { ReactElement } from "react";
import { formatBytes } from "../../lib/formatBytes";
import { DEFAULT_LIVE_STAT_TILES, renderLiveStatTiles } from "./liveStats/defaultRegistry";
import type { LiveStatsPanelProps } from "./LiveStatsPanel.types";
import styles from "./LiveStatsPanel.module.css";

export type { LiveStatsPanelProps } from "./LiveStatsPanel.types";

export function LiveStatsPanel(props: LiveStatsPanelProps): ReactElement {
  const { snap, metrics } = props;
  const gpu = metrics?.gpu ?? null;
  const disk = metrics?.disk ?? null;

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

      {gpu || disk ? (
        <div className={styles.footMeta}>
          {gpu ? (
            <span title="Host GPU (nvidia-smi)">
              GPU
              {gpu.temperatureC != null ? ` ${gpu.temperatureC}°C` : ""}
              {gpu.utilizationPct != null ? ` · ${gpu.utilizationPct}%` : ""}
              {gpu.memUsedMiB != null && gpu.memTotalMiB != null
                ? ` · ${Math.round(gpu.memUsedMiB)}/${Math.round(gpu.memTotalMiB)} MiB`
                : ""}
            </span>
          ) : null}
          {gpu && disk ? <span aria-hidden> · </span> : null}
          {disk ? (
            <span title={disk.path}>
              Disk {formatBytes(disk.freeBytes)} free / {formatBytes(disk.totalBytes)}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
