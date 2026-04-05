import { useEffect, useRef, type ReactElement } from "react";
import styles from "./FloatingDotsBackground.module.css";

const DOT_COUNT = 80;
const LINE_MAX_PX = 260;
/** Base scale for angular drift; multiplied by activity and per-dot frequencies. */
const DRIFT_SPEED = 0.00012;
/** Low throughput / idle — slower than historical default. */
const SPEED_MUL_MIN = 0.32;
/** ~tok/s at which multiplier approaches cap (soft ceiling). */
const TOK_REF = 140;
const SPEED_MUL_MAX = 3.6;
/** Smooth tok→speed so polling jumps do not twitch the field. */
const SPEED_SMOOTH = 0.14;
/**
 * Tok/s above which the log-curve “excess” is damped so high throughput does not over-accelerate dots.
 * Below this, behavior matches the historical curve (idle speed unchanged).
 */
const TOK_COMPRESS_ABOVE = 22;
/** Multiply only the portion of u above u(TOK_COMPRESS_ABOVE) by this (lower = calmer at high tok/s). */
const HIGH_ACTIVITY_U_DAMP = 0.5;

/** Map tok/s to drift speed multiplier (higher load → faster motion). */
function activitySpeedMultiplier(tok: number | null | undefined): number {
  if (tok == null || !Number.isFinite(tok) || tok <= 0) {
    return SPEED_MUL_MIN;
  }
  const t = Math.min(tok, 400);
  const uRaw = Math.min(1, Math.log1p(t) / Math.log1p(TOK_REF));
  let u = uRaw;
  if (t > TOK_COMPRESS_ABOVE) {
    const uFloor = Math.min(
      1,
      Math.log1p(TOK_COMPRESS_ABOVE) / Math.log1p(TOK_REF),
    );
    if (uRaw > uFloor) {
      u = uFloor + (uRaw - uFloor) * HIGH_ACTIVITY_U_DAMP;
    }
  }
  return SPEED_MUL_MIN + u * (SPEED_MUL_MAX - SPEED_MUL_MIN);
}
/** Bump connector line perceived brightness vs dots (stroke alpha + HSL L). */
const LINE_BRIGHTER = 1.14;

/**
 * Dark page: pastels (high L). Light page: invert to darker, more saturated ink so dots/lines read on pale bg.
 */
function canvasLightness(l: number, lightMode: boolean): number {
  if (!lightMode) {
    return l;
  }
  return Math.max(14, Math.min(48, 18 + (100 - l) * 0.5));
}

/** H 0–360, S/L 0–100 → RGB 0–255 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs((hp / 60) % 2 - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp < 60) {
    rp = c;
    gp = x;
  } else if (hp < 120) {
    rp = x;
    gp = c;
  } else if (hp < 180) {
    gp = c;
    bp = x;
  } else if (hp < 240) {
    gp = x;
    bp = c;
  } else if (hp < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255),
  ];
}

type BloomSample = { h: number; s: number; l: number; w: number };

function drawPointerBloom(
  c2d: CanvasRenderingContext2D,
  px: number,
  py: number,
  samples: BloomSample[],
  elapsed: number,
  reducedMotion: boolean,
): void {
  if (samples.length === 0) {
    return;
  }
  let tw = 0;
  let tr = 0;
  let tg = 0;
  let tb = 0;
  for (const s of samples) {
    const [r, g, b] = hslToRgb(s.h, s.s, s.l);
    tr += r * s.w;
    tg += g * s.w;
    tb += b * s.w;
    tw += s.w;
  }
  if (tw < 1e-6) {
    return;
  }
  const r = tr / tw;
  const g = tg / tw;
  const b = tb / tw;

  const pulseR = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(elapsed * Math.PI * 2 * 0.5);
  const pulseA = reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(elapsed * Math.PI * 2 * 0.35 + 0.9);

  const innerR = 4 * pulseR;
  const outerR = 48 * pulseR;
  const grd = c2d.createRadialGradient(px, py, innerR, px, py, outerR);
  const a0 = 0.2 * pulseA;
  const a1 = 0.07 * pulseA;
  grd.addColorStop(0, `rgba(${r},${g},${b},${a0})`);
  grd.addColorStop(0.42, `rgba(${r},${g},${b},${a1})`);
  grd.addColorStop(0.78, `rgba(${r},${g},${b},${0.02 * pulseA})`);
  grd.addColorStop(1, "rgba(0,0,0,0)");

  c2d.save();
  c2d.globalCompositeOperation = "lighter";
  c2d.fillStyle = grd;
  c2d.beginPath();
  c2d.arc(px, py, outerR, 0, Math.PI * 2);
  c2d.fill();
  c2d.restore();
}

type Dot = {
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

/**
 * Smooth wandering focal point in 0–1 space when no pointer is tracked (touch idle, mouse outside window).
 * Layered incommensurate frequencies so paths feel random, not periodic loops.
 */
function idleFocalTargetNorm(
  elapsed: number,
  seedA: number,
  seedB: number,
): { nx: number; ny: number } {
  const t = elapsed;
  const nx =
    0.5 +
    0.4 *
      (Math.sin(t * 0.31 + seedA) * 0.55 +
        Math.sin(t * 0.07 + seedB * 1.3) * 0.35 +
        Math.cos(t * 0.19 + seedA * 0.7) * 0.1);
  const ny =
    0.46 +
    0.38 *
      (Math.cos(t * 0.29 + seedB) * 0.52 +
        Math.cos(t * 0.08 + seedA * 1.1) * 0.33 +
        Math.sin(t * 0.21 + seedB * 0.9) * 0.15);
  return {
    nx: Math.min(0.94, Math.max(0.06, nx)),
    ny: Math.min(0.92, Math.max(0.08, ny)),
  };
}

/** Line stroke HSL + alpha weighting — shared by connector strokes and pointer bloom mix. */
function connectorLineStyle(d: Dot): {
  lineSat: number;
  lineLight: number;
  lineDepthAlpha: number;
} {
  const depth = d.depth;
  return {
    lineSat: Math.min(88, d.sat + 6 + depth * 6),
    lineLight: Math.min(
      94,
      (Math.min(80, d.light + 4 + depth * 18)) * LINE_BRIGHTER,
    ),
    lineDepthAlpha: 0.42 + depth * 0.58,
  };
}

function dotScreenPos(
  d: Dot,
  drift: number,
  speedMul: number,
  reducedMotion: boolean,
  width: number,
  height: number,
): { x: number; y: number } {
  if (reducedMotion) {
    return { x: d.nx * width, y: d.ny * height };
  }
  const s = DRIFT_SPEED * speedMul;
  const t1 = drift * s;
  const wobbleX =
    Math.sin(t1 * d.freqX * 1000 + d.ox) * d.ampX +
    Math.sin(t1 * d.freqX2 * 520 + d.phaseX2) * d.ampX2;
  const wobbleY =
    Math.cos(t1 * d.freqY * 900 + d.oy) * d.ampY +
    Math.cos(t1 * d.freqY2 * 480 + d.phaseY2) * d.ampY2;
  return {
    x: (d.nx + wobbleX) * width,
    y: (d.ny + wobbleY) * height,
  };
}

function makeDots(): Dot[] {
  const dots = Array.from({ length: DOT_COUNT }, () => {
    const depth = 0.12 + Math.random() * Math.random() * 0.88;
    return {
      nx: Math.random(),
      ny: Math.random(),
      ox: Math.random() * Math.PI * 2,
      oy: Math.random() * Math.PI * 2,
      freqX: 0.52 + Math.random() * 0.96,
      freqY: 0.52 + Math.random() * 0.96,
      freqX2: 0.18 + Math.random() * 0.82,
      freqY2: 0.18 + Math.random() * 0.82,
      phaseX2: Math.random() * Math.PI * 2,
      phaseY2: Math.random() * Math.PI * 2,
      ampX: 0.012 + Math.random() * 0.042,
      ampY: 0.012 + Math.random() * 0.042,
      ampX2: 0.004 + Math.random() * 0.018,
      ampY2: 0.004 + Math.random() * 0.018,
      hue: 160 + Math.random() * 200,
      sat: 62 + Math.random() * 32,
      light: 58 + Math.random() * 18,
      depth,
    };
  });
  /* Back (low depth) first, front (high depth) last — so larger dots paint on top. */
  dots.sort((a, b) => a.depth - b.depth);
  return dots;
}

/**
 * Colored dots, lines to a focal point, slow per-dot drift.
 * Focal point follows the pointer while it is over the document; when it is not (mouse outside the
 * window, touch lifted, etc.), the focal point wanders smoothly. `prefers-reduced-motion` uses a
 * static center instead. Drift speeds up with `activityTokPerSec` (inference load).
 * Fixed behind UI (`pointer-events: none`).
 */
export function FloatingDotsBackground(props: {
  /** vLLM tok/s from `/api/state` (runner); null/0 → slow idle drift. */
  activityTokPerSec?: number | null;
}): ReactElement {
  const { activityTokPerSec = null } = props;
  const activityRef = useRef<number | null>(null);
  activityRef.current = activityTokPerSec;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[] | null>(null);
  if (dotsRef.current === null) {
    dotsRef.current = makeDots();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const cnv = canvas;
    const c2d = ctx;
    const dotList = dotsRef.current!;
    const sxCache = new Float32Array(DOT_COUNT);
    const syCache = new Float32Array(DOT_COUNT);

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let pointerX = 0;
    let pointerY = 0;
    let hasPointer = false;
    let reducedMotion = false;
    let animStart = 0;
    let smoothedSpeedMul = SPEED_MUL_MIN;
    const driftSeedA = Math.random() * Math.PI * 2;
    const driftSeedB = Math.random() * Math.PI * 2;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    const mqHandler = (): void => {
      reducedMotion = mq.matches;
    };
    mq.addEventListener("change", mqHandler);

    function resize(): void {
      dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      cnv.width = Math.floor(width * dpr);
      cnv.height = Math.floor(height * dpr);
      cnv.style.width = `${width}px`;
      cnv.style.height = `${height}px`;
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onPointerMove(e: PointerEvent): void {
      hasPointer = true;
      pointerX = e.clientX;
      pointerY = e.clientY;
    }

    function onPointerLeave(): void {
      hasPointer = false;
    }

    /** Touch/pen release: return to idle drift on mobile; mouse keeps hover tracking via pointermove. */
    function onPointerUp(e: PointerEvent): void {
      if (e.pointerType === "touch" || e.pointerType === "pen") {
        hasPointer = false;
      }
    }

    function drawFrame(now: number): void {
      if (width <= 0) {
        raf = requestAnimationFrame(drawFrame);
        return;
      }
      if (!animStart) {
        animStart = now;
      }
      const elapsed = (now - animStart) / 1000;

      c2d.clearRect(0, 0, width, height);

      const lightMode = document.documentElement.getAttribute("data-theme") === "light";

      const drift = reducedMotion ? 0 : elapsed;
      const targetMul = activitySpeedMultiplier(activityRef.current);
      smoothedSpeedMul += (targetMul - smoothedSpeedMul) * SPEED_SMOOTH;
      const speedMul = reducedMotion ? 0 : smoothedSpeedMul;
      let px: number;
      let py: number;
      if (hasPointer) {
        px = pointerX;
        py = pointerY;
      } else if (!reducedMotion) {
        const { nx, ny } = idleFocalTargetNorm(elapsed, driftSeedA, driftSeedB);
        px = nx * width;
        py = ny * height;
      } else {
        px = width * 0.5;
        py = height * 0.42;
      }

      const n = dotList.length;
      for (let i = 0; i < n; i++) {
        const d = dotList[i]!;
        const p = dotScreenPos(d, drift, speedMul, reducedMotion, width, height);
        sxCache[i] = p.x;
        syCache[i] = p.y;
      }

      const bloomSamples: BloomSample[] = [];
      for (let i = 0; i < n; i++) {
        const d = dotList[i]!;
        const x = sxCache[i];
        const y = syCache[i];
        const dx = px - x;
        const dy = py - y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0 || dist >= LINE_MAX_PX) {
          continue;
        }
        const depth = d.depth;
        const { lineSat, lineLight, lineDepthAlpha } = connectorLineStyle(d);
        const lineL = canvasLightness(lineLight, lightMode);
        const lineS = lightMode ? Math.min(96, lineSat * 1.06) : lineSat;
        const falloff = 1 - dist / LINE_MAX_PX;
        const w = falloff * lineDepthAlpha * (0.35 + depth * 0.65);
        bloomSamples.push({ h: d.hue, s: lineS, l: lineL, w });

        const lineW = 0.32 + depth * 1.52;
        const lineABase = Math.min(1, falloff * 0.78 * lineDepthAlpha * LINE_BRIGHTER);
        const lineA = lightMode ? Math.min(1, lineABase * 1.14) : lineABase;
        c2d.beginPath();
        c2d.strokeStyle = `hsla(${d.hue}, ${lineS}%, ${lineL}%, ${lineA})`;
        c2d.lineWidth = lineW;
        c2d.lineCap = "round";
        c2d.moveTo(x, y);
        c2d.lineTo(px, py);
        c2d.stroke();
      }

      drawPointerBloom(c2d, px, py, bloomSamples, elapsed, reducedMotion);

      for (let i = 0; i < n; i++) {
        const d = dotList[i]!;
        const x = sxCache[i];
        const y = syCache[i];
        const depth = d.depth;

        const rMain = (reducedMotion ? 0.88 : 1) * (1.2 + depth * 2.95);
        const fillLightRaw = Math.min(84, d.light + depth * 14);
        const fillLight = canvasLightness(fillLightRaw, lightMode);
        const fillSat = lightMode ? Math.min(96, d.sat * 1.05) : d.sat;
        const fillAlphaRaw = (reducedMotion ? 0.42 : 0.72) + depth * (reducedMotion ? 0.18 : 0.22);
        const fillAlpha = lightMode ? Math.min(1, fillAlphaRaw * 1.1) : fillAlphaRaw;

        c2d.beginPath();
        c2d.fillStyle = `hsla(${d.hue}, ${fillSat}%, ${fillLight}%, ${fillAlpha})`;
        c2d.arc(x, y, rMain, 0, Math.PI * 2);
        c2d.fill();

        const rHi = Math.max(0.45, rMain * 0.38);
        const hiLightRaw = Math.min(96, 88 + depth * 8);
        const hiLight = lightMode
          ? Math.min(56, canvasLightness(hiLightRaw, lightMode) + 10)
          : hiLightRaw;
        const hiAlpha = 0.18 + depth * 0.32;
        c2d.beginPath();
        c2d.fillStyle = `hsla(${d.hue}, 92%, ${hiLight}%, ${hiAlpha})`;
        c2d.arc(x - rMain * 0.12, y - rMain * 0.12, rHi, 0, Math.PI * 2);
        c2d.fill();
      }

      raf = requestAnimationFrame(drawFrame);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.body.addEventListener("pointerleave", onPointerLeave);
    raf = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", mqHandler);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      aria-hidden="true"
    />
  );
}
