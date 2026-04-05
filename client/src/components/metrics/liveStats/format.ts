/** Shared formatters for live vLLM stat cards. */

export function fmtPctFrac(frac: number | null): string {
  if (frac === null || !Number.isFinite(frac)) {
    return "—";
  }
  const pct = frac <= 1 && frac >= 0 ? frac * 100 : frac;
  return `${pct.toFixed(1)}%`;
}

export function fmtInt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) {
    return "—";
  }
  return String(Math.round(n));
}

export function fmtSecondsMs(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) {
    return "—";
  }
  const ms = sec * 1000;
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(0)} ms`;
}

export function fmtPeakTokPerSec(p: number): string {
  if (!Number.isFinite(p) || p <= 0) {
    return "—";
  }
  return `${p.toFixed(1)} tok/s`;
}

export function fmtPeakPercentFrac(p: number): string {
  if (!Number.isFinite(p) || p <= 0) {
    return "—";
  }
  const pct = p <= 1 ? p * 100 : p;
  return `${pct.toFixed(1)}%`;
}

export function fmtPeakSeconds(p: number): string {
  if (!Number.isFinite(p) || p <= 0) {
    return "—";
  }
  return `${(p * 1000).toFixed(0)} ms`;
}

export function clamp01(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) {
    return null;
  }
  return Math.max(0, Math.min(1, n));
}
