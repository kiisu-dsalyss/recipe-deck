import type { ReactElement } from "react";
import type { ModelCacheProgress } from "../../../../types/index.js";
import { formatBytes } from "../../lib/formatBytes";
import { IconBrain } from "../ui/glyphs.js";
import styles from "./RunningModelPanel.module.css";

export function ModelCacheBar(props: {
  cache: ModelCacheProgress;
  cacheDisk: string;
  pctClamped: number | null;
  cacheIndeterminate: boolean;
  cacheComplete: boolean;
  cacheNearlyEmpty: boolean;
  doneCacheFlash: ModelCacheProgress | null;
}): ReactElement {
  const {
    cache,
    cacheDisk,
    pctClamped,
    cacheIndeterminate,
    cacheComplete,
    cacheNearlyEmpty,
    doneCacheFlash,
  } = props;

  return (
    <div
      className={styles.modelCache}
      title={`${cache.modelId}\n${cache.bytesOnDisk.toLocaleString()} bytes on disk${
        cache.bytesExpected != null
          ? `\n${cache.bytesExpected.toLocaleString()} bytes expected`
          : ""
      }`}
      aria-label={`Hub model cache: ${cache.modelId}`}
    >
      <span className={`${styles.modelCacheIcon} ${styles.modelCacheIconPulse}`} aria-hidden>
        <IconBrain />
      </span>
      <div
        className={`${styles.cacheBarOuter} ${cacheComplete ? styles.cacheBarOuterDone : ""} ${cacheNearlyEmpty ? styles.cacheBarOuterLow : ""} ${cacheIndeterminate ? styles.cacheBarOuterIndeterminate : ""}`}
        role={
          pctClamped != null || cacheIndeterminate ? "progressbar" : undefined
        }
        aria-valuemin={pctClamped != null ? 0 : undefined}
        aria-valuemax={pctClamped != null ? 100 : undefined}
        aria-valuenow={pctClamped != null ? Math.round(pctClamped * 10) / 10 : undefined}
        aria-busy={cacheIndeterminate ? true : undefined}
        aria-label={
          cacheIndeterminate
            ? "Downloading model to hub cache; total size unknown"
            : pctClamped != null
              ? doneCacheFlash != null
                ? "Hub cache ready"
                : `Downloaded ${pctClamped.toFixed(1)} percent of expected hub size`
              : undefined
        }
      >
        <div
          className={`${styles.cacheBarInner} ${cacheComplete ? styles.cacheBarInnerDone : ""} ${cacheIndeterminate ? styles.cacheBarInnerIndeterminate : ""}`}
          style={{
            width: cacheIndeterminate
              ? "38%"
              : pctClamped != null
                ? `${pctClamped}%`
                : "0%",
            minWidth:
              pctClamped != null && pctClamped > 0 && pctClamped < 1 ? "2px" : undefined,
          }}
        />
      </div>
      <div className={styles.cacheReadout}>
        {cache.percent != null ? (
          <>
            <span
              className={`${styles.cachePctValue} ${cacheComplete ? styles.cachePctValueDone : ""}`}
            >
              {cache.percent.toFixed(1)}%
            </span>
            <span className={styles.cachePctSep} aria-hidden>
              ·
            </span>
            <span className={styles.cachePctDisk}>{cacheDisk}</span>
          </>
        ) : cache.bytesExpected != null ? (
          <>
            <span className={styles.cachePctValue}>{cacheDisk}</span>
            <span className={styles.cachePctSep} aria-hidden>
              /
            </span>
            <span className={styles.cachePctDisk}>
              {formatBytes(cache.bytesExpected)}
            </span>
          </>
        ) : (
          <span className={styles.cachePctValue}>{cacheDisk}</span>
        )}
      </div>
    </div>
  );
}
