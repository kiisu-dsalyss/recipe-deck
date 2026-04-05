import type { ReactElement, ReactNode } from "react";
import { DbLevelMeter } from "../DbLevelMeter";
import styles from "../LiveStatsPanel.module.css";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  peak?: ReactNode;
  peakTitle?: string;
  /** Single-channel meter (0–1). */
  meterFraction?: number | null;
  /** Two-channel meter. */
  stereoFractions?: [number, number];
  valueTitle?: string;
}

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
