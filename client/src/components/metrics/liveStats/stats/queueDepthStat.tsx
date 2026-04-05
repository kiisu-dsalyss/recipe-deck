import type { ReactElement } from "react";
import { useSessionPeak } from "../../../../hooks/useSessionPeak";
import { StatCard } from "../StatCard";
import { fmtInt } from "../format";
import type { LiveStatProps } from "../liveStatProps";

export function QueueDepthStat(props: LiveStatProps): ReactElement {
  const { snap } = props;
  const ls = snap.liveStats;
  const meterActive = snap.phase === "HEALTHY" && ls != null;
  const waitN = ls?.numRequestsWaiting ?? null;
  const waitPeak = useSessionPeak(waitN, meterActive);
  const waitFrac =
    waitN != null && Number.isFinite(waitN) && waitPeak > 0
      ? Math.max(0, waitN) / waitPeak
      : 0;

  return (
    <StatCard
      label="Queue depth"
      meterFraction={waitFrac}
      value={fmtInt(waitN)}
      peakTitle="Highest waiting request count this session (HEALTHY)"
      peak={
        waitPeak > 0 ? <>Peak {fmtInt(waitPeak)}</> : undefined
      }
    />
  );
}
