export type BloomSample = { h: number; s: number; l: number; w: number };

export type Dot = {
  nx: number;
  ny: number;
  ox: number;
  oy: number;
  /** Per-dot angular rates (rad/s scale) for primary wobble — uncorrelated X/Y. */
  freqX: number;
  freqY: number;
  /** Slower secondary wobble (more random drift). */
  freqX2: number;
  freqY2: number;
  phaseX2: number;
  phaseY2: number;
  ampX: number;
  ampY: number;
  ampX2: number;
  ampY2: number;
  hue: number;
  sat: number;
  light: number;
  /**
   * Pseudo-depth: 0 ≈ far (small, dim, thin connector lines), 1 ≈ near
   * (large, brighter, thicker lines). Drives a subtle 3D read without real Z.
   */
  depth: number;
};
