import type { ReactElement } from "react";
import type { DbLevelMeterProps } from "./DbLevelMeter.types";
import styles from "./DbLevelMeter.module.css";

const SEGMENTS = 14;

function segmentStates(frac: number): { lit: boolean; peakTip: boolean }[] {
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  const lit: boolean[] = [];
  for (let k = 0; k < SEGMENTS; k += 1) {
    lit.push(f >= (k + 1) / SEGMENTS);
  }
  let topLit = -1;
  for (let k = SEGMENTS - 1; k >= 0; k -= 1) {
    if (lit[k]) {
      topLit = k;
      break;
    }
  }
  return lit.map((on, i) => ({
    lit: on,
    peakTip: on && i === topLit,
  }));
}

export function DbLevelMeter(props: DbLevelMeterProps): ReactElement {
  const { fraction, stereoFractions } = props;

  if (stereoFractions) {
    const [a, b] = stereoFractions;
    const statesA = segmentStates(a);
    const statesB = segmentStates(b);
    return (
      <div className={`${styles.root} ${styles.rootStereo}`} aria-hidden>
        <div className={styles.stereo}>
          <div className={styles.column}>
            {statesA.map((s, i) => (
              <div
                key={`a-${i}`}
                className={`${styles.segment} ${s.lit ? styles.segmentLit : ""} ${
                  s.peakTip ? styles.segmentPeakTip : ""
                } ${s.lit && !s.peakTip && i >= SEGMENTS - 3 ? styles.segmentHot : ""}`}
              />
            ))}
          </div>
          <div className={styles.column}>
            {statesB.map((s, i) => (
              <div
                key={`b-${i}`}
                className={`${styles.segment} ${s.lit ? styles.segmentLit : ""} ${
                  s.peakTip ? styles.segmentPeakTip : ""
                } ${s.lit && !s.peakTip && i >= SEGMENTS - 3 ? styles.segmentHot : ""}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const states = segmentStates(fraction ?? 0);
  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.column}>
        {states.map((s, i) => (
          <div
            key={i}
            className={`${styles.segment} ${s.lit ? styles.segmentLit : ""} ${
              s.peakTip ? styles.segmentPeakTip : ""
            } ${s.lit && !s.peakTip && i >= SEGMENTS - 3 ? styles.segmentHot : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
