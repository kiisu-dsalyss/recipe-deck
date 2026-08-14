export interface DbLevelMeterProps {
  /** One channel: single column of segments (0 = empty, 1 = full). */
  fraction?: number;
  /** Two channels: left | right stereo columns (e.g. running / waiting). */
  stereoFractions?: [number, number];
}
