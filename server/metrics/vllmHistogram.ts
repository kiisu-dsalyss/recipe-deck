/**
 * Best-effort P95 time-to-first-token (seconds) from vLLM Prometheus /metrics text.
 * Tries summary lines with quantile="0.95" first, then cumulative histogram buckets.
 */

function lineScalarValue(line: string): number | null {
  const parts = line.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (last === undefined) {
    return null;
  }
  const n = Number.parseFloat(last);
  return Number.isFinite(n) ? n : null;
}

/** Labels excluding le=, sorted, for grouping histogram series. */
function histogramGroupKey(line: string): string | null {
  const m = /\{([^}]*)\}/.exec(line);
  if (!m?.[1]) {
    return null;
  }
  const parts = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^le\s*=/.test(s));
  return parts.sort().join(",");
}

function parseLeLabel(line: string): number | "inf" | null {
  const m = /\ble\s*=\s*"([^"]+)"/.exec(line);
  if (!m?.[1]) {
    return null;
  }
  if (m[1] === "+Inf") {
    return "inf";
  }
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prometheus histogram_quantile linear interpolation (piecewise cumulative).
 * @see https://prometheus.io/docs/practices/histograms/#quantiles
 */
function quantileFromCumulativeBuckets(
  buckets: Array<{ le: number; c: number }>,
  q: number,
): number | null {
  if (buckets.length === 0) {
    return null;
  }
  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const total = sorted[sorted.length - 1]?.c;
  if (total === undefined || total <= 0 || !Number.isFinite(total)) {
    return null;
  }
  const target = q * total;
  let prevLe = 0;
  let prevC = 0;
  for (const b of sorted) {
    const le = b.le;
    const c = b.c;
    if (c < target) {
      prevLe = Number.isFinite(le) ? le : prevLe;
      prevC = c;
      continue;
    }
    const rank = target - prevC;
    const width = c - prevC;
    if (width <= 0) {
      return Number.isFinite(le) ? le : prevLe;
    }
    if (!Number.isFinite(le)) {
      return prevLe > 0 ? prevLe : null;
    }
    const frac = rank / width;
    return prevLe + frac * (le - prevLe);
  }
  return null;
}

function mergeBucketsByLe(
  rows: Array<{ le: number; c: number }>,
): Array<{ le: number; c: number }> {
  const m = new Map<number, number>();
  for (const { le, c } of rows) {
    m.set(le, Math.max(m.get(le) ?? 0, c));
  }
  return [...m.entries()]
    .map(([le, c]) => ({ le, c }))
    .sort((a, b) => a.le - b.le);
}

function parseTimeToFirstTokenHistogram(
  text: string,
): Map<string, Array<{ le: number; c: number }>> {
  const groups = new Map<string, Array<{ le: number; c: number }>>();
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#")) {
      continue;
    }
    if (!line.includes("time_to_first_token") || !line.includes("_bucket")) {
      continue;
    }
    const key = histogramGroupKey(line);
    if (key === null) {
      continue;
    }
    const le = parseLeLabel(line);
    const v = lineScalarValue(line);
    if (le === null || v === null) {
      continue;
    }
    const leNum = le === "inf" ? Number.POSITIVE_INFINITY : le;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push({ le: leNum, c: v });
  }
  const merged = new Map<string, Array<{ le: number; c: number }>>();
  for (const [k, arr] of groups) {
    merged.set(k, mergeBucketsByLe(arr));
  }
  return merged;
}

/** Summary / native quantile line: quantile="0.95". */
function pickSummaryTtftP95Seconds(text: string): number | null {
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#")) {
      continue;
    }
    if (!line.includes("time_to_first_token")) {
      continue;
    }
    if (!/quantile\s*=\s*"0\.95"/.test(line)) {
      continue;
    }
    if (line.includes("_bucket") || line.includes("_count") || line.includes("_sum")) {
      continue;
    }
    const v = lineScalarValue(line);
    if (v !== null && v >= 0 && Number.isFinite(v)) {
      return v;
    }
  }
  return null;
}

/**
 * Worst-case P95 (seconds) across histogram label groups — conservative when multiple engines.
 */
export function parseTimeToFirstTokenP95Seconds(text: string): number | null {
  const summary = pickSummaryTtftP95Seconds(text);
  if (summary !== null) {
    return summary;
  }
  const groups = parseTimeToFirstTokenHistogram(text);
  let best: number | null = null;
  for (const arr of groups.values()) {
    const p = quantileFromCumulativeBuckets(arr, 0.95);
    if (p !== null && Number.isFinite(p) && p >= 0) {
      if (best === null || p > best) {
        best = p;
      }
    }
  }
  return best;
}
