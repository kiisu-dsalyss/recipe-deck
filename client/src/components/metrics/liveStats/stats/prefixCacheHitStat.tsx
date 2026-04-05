import type { ReactElement } from "react";
import type { SlotSnapshot } from "../../../../../../types/index.js";
import { useSessionPeak } from "../../../../hooks/useSessionPeak";
import { StatCard } from "../StatCard";
import { clamp01, fmtPeakPercentFrac, fmtPctFrac } from "../format";
import type { LiveStatProps } from "../liveStatProps";

/** Prefer CPU prefix gauge; fall back to combined GPU/V1 hit rate. */
function prefixHitFrac(snap: SlotSnapshot): number | null {
  const ls = snap.liveStats;
  if (!ls) {
    return null;
  }
  const cpu = ls.cpuPrefixCacheHitRateFrac;
  if (cpu != null && Number.isFinite(cpu)) {
    return clamp01(cpu);
  }
  return clamp01(ls.gpuPrefixCacheHitRateFrac);
}

export function PrefixCacheHitStat(props: LiveStatProps): ReactElement {
  const { snap } = props;
  const ls = snap.liveStats;
  const meterActive = snap.phase === "HEALTHY" && ls != null;

  const cur = prefixHitFrac(snap);
  const peak = useSessionPeak(cur, meterActive);
  const frac = cur != null && peak > 0 ? cur / peak : 0;

  return (
    <StatCard
      label="Prefix cache hit"
      meterFraction={frac}
      value={fmtPctFrac(
        ls?.cpuPrefixCacheHitRateFrac ?? ls?.gpuPrefixCacheHitRateFrac ?? null,
      )}
      peakTitle="Highest prefix hit rate this session (HEALTHY)"
      peak={<>Peak {fmtPeakPercentFrac(peak)}</>}
    />
  );
}
