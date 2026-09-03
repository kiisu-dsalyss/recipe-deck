import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import styles from "./AutoRestartCountdown.module.css";

export interface AutoRestartCountdownProps {
  /** Epoch ms when restart fires (server-provided from `SlotSnapshot.autoRestartAtMs`). */
  autoRestartAtMs: number;
  /** Cooldown length in ms (for progress 0→1). */
  cooldownMs: number;
}

/**
 * Circular countdown ring: fills over the cooldown; center shows remaining seconds.
 * Server initiates the restart when the circle completes; the client only visualizes.
 */
export function AutoRestartCountdown(
  props: AutoRestartCountdownProps,
): ReactElement {
  const { autoRestartAtMs, cooldownMs } = props;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [autoRestartAtMs]);

  const remainingMs = Math.max(0, autoRestartAtMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const elapsed = Math.min(
    1,
    Math.max(0, 1 - remainingMs / Math.max(1, cooldownMs)),
  );

  const size = 40;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - elapsed);

  return (
    <div
      className={styles.wrap}
      role="status"
      aria-live="polite"
      aria-label={`Auto-restart in ${remainingSec} seconds`}
    >
      <svg
        className={styles.svg}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          className={styles.track}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className={styles.progress}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.seconds}>{remainingSec}</span>
    </div>
  );
}
