import type { ReactElement } from "react";
import { DbLevelMeter } from "../DbLevelMeter";
import type { StatCardProps } from "./StatCard.types";
import styles from "../LiveStatsPanel.module.css";

export type { StatCardProps } from "./StatCard.types";

/**
 * Glass card shell shared by modular live-stat tiles (meter optional).
 */
export function StatCard(props: StatCardProps): ReactElement {
  const {
    label,
    value,
    peak,
    peakTitle,
    meterFraction,
    stereoFractions,
    valueTitle,
  } = props;
  const withMeter = meterFraction != null || stereoFractions != null;

  return (
    <div
      className={`${styles.card} ${withMeter ? styles.cardWithMeter : ""}`}
    >
      {withMeter ? (
        stereoFractions ? (
          <DbLevelMeter stereoFractions={stereoFractions} />
        ) : (
          <DbLevelMeter fraction={meterFraction ?? 0} />
        )
      ) : null}
      <div className={styles.cardForeground}>
        <span className={styles.cardLabel}>{label}</span>
        <span className={styles.cardValue} title={valueTitle}>
          {value}
        </span>
        {peak != null ? (
          <span className={styles.cardPeak} title={peakTitle}>
            {peak}
          </span>
        ) : null}
      </div>
    </div>
  );
}
