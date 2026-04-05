import type { ReactElement } from "react";
import { useSessionPeak } from "../../../../hooks/useSessionPeak";
import { StatCard } from "../StatCard";
import { fmtPeakSeconds, fmtSecondsMs } from "../format";
import type { LiveStatProps } from "../liveStatProps";

export function TtftP95Stat(props: LiveStatProps): ReactElement {
  const { snap } = props;
  const ls = snap.liveStats;
  const meterActive = snap.phase === "HEALTHY" && ls != null;
  const sec = ls?.timeToFirstTokenP95Seconds ?? null;

  const peak = useSessionPeak(sec, meterActive);

  return (
    <StatCard
      label="TTFT P95"
      value={fmtSecondsMs(sec)}
      peakTitle="Worst P95 this session (HEALTHY)"
      peak={peak != null && peak > 0 ? <>Peak {fmtPeakSeconds(peak)}</> : undefined}
    />
  );
}
