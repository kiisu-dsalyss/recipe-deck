import type { ReactElement } from "react";
import { useSmoothedNumber } from "../../../../hooks/useSmoothedNumber";
import { useSessionPeak } from "../../../../hooks/useSessionPeak";
import { StatCard } from "../StatCard";
import { fmtPeakTokPerSec } from "../format";
import type { LiveStatProps } from "../liveStatProps";

export function GenerationThroughputStat(props: LiveStatProps): ReactElement {
  const { snap } = props;
  const ls = snap.liveStats;
  const meterActive = snap.phase === "HEALTHY" && ls != null;

  const tokRaw = snap.tokPerSec;
  const tokSm = useSmoothedNumber(tokRaw, 0.22);
  const tokCur = tokSm ?? tokRaw ?? null;
  const tokPeak = useSessionPeak(tokCur, meterActive);
  const tokFrac =
    tokCur != null && Number.isFinite(tokCur) && tokPeak > 0
      ? Math.max(0, tokCur) / tokPeak
      : 0;

  return (
    <StatCard
      label="Generation throughput"
      meterFraction={tokFrac}
      value={
        tokSm != null ? `${tokSm.toFixed(1)} tok/s` : "—"
      }
      valueTitle={tokRaw != null ? `Raw: ${tokRaw} tok/s` : undefined}
      peakTitle="Highest tok/s this session (HEALTHY)"
      peak={<>Peak {fmtPeakTokPerSec(tokPeak)}</>}
    />
  );
}
