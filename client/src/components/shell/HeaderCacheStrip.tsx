import type { ReactElement } from "react";
import type { ModelCacheProgress } from "../../../../types/index.js";
import { formatBytes } from "../../lib/formatBytes";
import styles from "./Header.module.css";

export function HeaderCacheStrip(props: {
  cache: ModelCacheProgress | null;
}): ReactElement | null {
  const { cache } = props;
  if (!cache) return <div className={styles.cacheCenter} aria-hidden />;
  const title =
    `${cache.modelId} — ${formatBytes(cache.bytesOnDisk)} on disk` +
    (cache.bytesExpected != null ? ` / ${formatBytes(cache.bytesExpected)} expected` : "");
  const stats =
    cache.bytesExpected != null && cache.bytesExpected > 0
      ? `${cache.percent != null ? `${cache.percent.toFixed(1)}% · ` : ""}${formatBytes(cache.bytesOnDisk)} / ${formatBytes(cache.bytesExpected)}`
      : cache.bytesOnDisk > 0
        ? `${formatBytes(cache.bytesOnDisk)} · ${cache.expectedSizeError ?? "fetching size…"}`
        : (cache.expectedSizeError ?? "starting…");
  return (
    <div className={styles.cacheCenter}>
      <div className={styles.cacheRow} title={title}>
        <span className={styles.cacheLabel}>Model In Cache:</span>
        <div
          className={
            cache.percent == null
              ? `${styles.cacheBarOuter} ${styles.cacheBarOuterIndeterminate}`
              : styles.cacheBarOuter
          }
        >
          <div
            className={styles.cacheBarInner}
            style={
              cache.percent != null
                ? { width: `${Math.min(100, Math.max(0, cache.percent))}%` }
                : undefined
            }
          />
        </div>
        <span className={styles.cacheStats}>{stats}</span>
      </div>
    </div>
  );
}
