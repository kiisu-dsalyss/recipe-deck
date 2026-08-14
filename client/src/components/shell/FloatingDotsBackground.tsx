import { useEffect, useRef, type ReactElement } from "react";
import styles from "./FloatingDotsBackground.module.css";
import {
  activitySpeedMultiplier,
  canvasLightness,
  connectorLineStyle,
  DOT_COUNT,
  dotScreenPos,
  drawPointerBloom,
  idleFocalTargetNorm,
  LINE_BRIGHTER,
  LINE_MAX_PX,
  makeDots,
  SPEED_MUL_MIN,
  SPEED_SMOOTH,
  type BloomSample,
  type Dot,
} from "./floatingDotsSim.js";

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
