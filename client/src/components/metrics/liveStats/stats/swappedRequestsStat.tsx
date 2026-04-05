import type { ReactElement } from "react";
import { useSessionPeak } from "../../../../hooks/useSessionPeak";
import { StatCard } from "../StatCard";
import { fmtInt } from "../format";
import type { LiveStatProps } from "../liveStatProps";

export function SwappedRequestsStat(props: LiveStatProps): ReactElement {
  const { snap } = props;
  const ls = snap.liveStats;
  const meterActive = snap.phase === "HEALTHY" && ls != null;
  const n = ls?.numRequestsSwapped ?? null;
  const peak = useSessionPeak(n, meterActive);
  const frac =
    n != null && Number.isFinite(n) && peak > 0 ? Math.max(0, n) / peak : 0;

  return (
    <StatCard
      label="Swapped requests"
      meterFraction={frac}
      value={fmtInt(n)}
      peakTitle="Highest swapped count this session (HEALTHY)"
      peak={
        peak > 0 ? <>Peak {fmtInt(peak)}</> : undefined
      }
    />
  );
}
