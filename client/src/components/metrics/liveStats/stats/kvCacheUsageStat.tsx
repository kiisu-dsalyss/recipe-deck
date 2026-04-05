import type { ReactElement } from "react";
import { useSessionPeak } from "../../../../hooks/useSessionPeak";
import { StatCard } from "../StatCard";
import { clamp01, fmtPeakPercentFrac, fmtPctFrac } from "../format";
import type { LiveStatProps } from "../liveStatProps";

export function KvCacheUsageStat(props: LiveStatProps): ReactElement {
  const { snap } = props;
  const ls = snap.liveStats;
  const meterActive = snap.phase === "HEALTHY" && ls != null;

  const gpuCur = clamp01(ls?.gpuCacheUsageFrac);
  const gpuPeak = useSessionPeak(gpuCur, meterActive);
  const gpuFrac = gpuCur != null && gpuPeak > 0 ? gpuCur / gpuPeak : 0;

  return (
    <StatCard
      label="KV cache usage"
      meterFraction={gpuFrac}
      value={fmtPctFrac(ls?.gpuCacheUsageFrac ?? null)}
      peakTitle="Highest GPU/KV usage this session (HEALTHY)"
      peak={<>Peak {fmtPeakPercentFrac(gpuPeak)}</>}
    />
  );
}
