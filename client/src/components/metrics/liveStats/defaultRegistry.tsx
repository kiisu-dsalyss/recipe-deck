import type { ComponentType, ReactElement } from "react";
import type { LiveStatProps } from "./liveStatProps";
import { GenerationThroughputStat } from "./stats/generationThroughputStat";
import { KvCacheUsageStat } from "./stats/kvCacheUsageStat";
import { PrefixCacheHitStat } from "./stats/prefixCacheHitStat";
import { QueueDepthStat } from "./stats/queueDepthStat";
import { SwappedRequestsStat } from "./stats/swappedRequestsStat";
import { TtftP95Stat } from "./stats/ttftP95Stat";

/** Default vLLM live-stat tiles (swap this list to experiment with layouts). */
export const DEFAULT_LIVE_STAT_TILES: ReadonlyArray<
  ComponentType<LiveStatProps>
> = [
  KvCacheUsageStat,
  TtftP95Stat,
  GenerationThroughputStat,
  QueueDepthStat,
  SwappedRequestsStat,
  PrefixCacheHitStat,
];

export function renderLiveStatTiles(
  tiles: ReadonlyArray<ComponentType<LiveStatProps>>,
  props: LiveStatProps,
): ReactElement[] {
  return tiles.map((Tile, i) => <Tile key={`live-stat-${i}`} {...props} />);
}
