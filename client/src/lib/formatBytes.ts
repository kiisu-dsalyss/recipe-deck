/** Human-readable byte size (base-10, same as Header metrics). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

/** Compact byte size for tight header chips (`3.9TB`, no space). */
export function formatBytesCompact(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}KB`;
  return `${Math.round(n)}B`;
}

/** Disk used percent 0–100 from free/total bytes, or null if unusable. */
export function diskUsedPct(freeBytes: number, totalBytes: number): number | null {
  if (!Number.isFinite(freeBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return null;
  }
  if (freeBytes < 0) {
    return null;
  }
  const pct = ((totalBytes - freeBytes) / totalBytes) * 100;
  if (!Number.isFinite(pct)) {
    return null;
  }
  return Math.min(100, Math.max(0, pct));
}
