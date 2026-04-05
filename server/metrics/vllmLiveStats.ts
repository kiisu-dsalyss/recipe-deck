/**
 * Parse additional vLLM Prometheus /metrics gauges (best-effort; names vary by vLLM version).
 *
 * Legacy (e.g. 0.6.x): `vllm:gpu_cache_usage_perc`, `vllm:cpu_cache_usage_perc`,
 * `vllm:gpu_prefix_cache_hit_rate` gauges.
 *
 * V1 engine (current main): `vllm:kv_cache_usage_perc` (replaces GPU gauge name),
 * prefix cache as counters `vllm:prefix_cache_hits` / `vllm:prefix_cache_queries` (rate = hits/queries).
 */
import type { VllmLiveStats } from "../../types/index.js";
import { parseTimeToFirstTokenP95Seconds } from "./vllmHistogram.js";

function lineScalarValue(line: string): number | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) {
    return null;
  }
  const parts = t.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last === undefined) {
    return null;
  }
  const n = Number.parseFloat(last);
  return Number.isFinite(n) ? n : null;
}

/**
 * First gauge/counter line for `needle` (metric name fragment), skipping histogram
 * `_bucket` / `_sum` lines so we do not read a cumulative bucket as the gauge value.
 */
function pickMetric(text: string, needle: string): number | null {
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(needle)) {
      continue;
    }
    if (/^#/.test(line)) {
      continue;
    }
    if (/\b_bucket\b/.test(line) || /\b_sum\b/.test(line) || /\b_count\b/.test(line)) {
      continue;
    }
    const v = lineScalarValue(line);
    if (v !== null) {
      return v;
    }
  }
  return null;
}

/** Try several name fragments (first match wins). */
function pickMetricAny(text: string, needles: string[]): number | null {
  for (const n of needles) {
    const v = pickMetric(text, n);
    if (v !== null) {
      return v;
    }
  }
  return null;
}

/** Sum numeric samples for all non-histogram lines containing `fragment` (multi-engine / labels). */
function sumMetricSamples(text: string, fragment: string): number | null {
  let sum = 0;
  let found = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#")) {
      continue;
    }
    if (!line.includes(fragment)) {
      continue;
    }
    if (/\b_bucket\b/.test(line) || /\b_sum\b/.test(line) || /\b_count\b/.test(line)) {
      continue;
    }
    const v = lineScalarValue(line);
    if (v !== null) {
      sum += v;
      found = true;
    }
  }
  return found ? sum : null;
}

/**
 * V1 exposes prefix hit rate via counters, not a gauge. Use hits/queries across all engines.
 * Fragment must not match `external_prefix_cache_*` (e.g. `:prefix_cache_hits{` is unique).
 */
function prefixHitRateFromV1Counters(text: string): number | null {
  const hits = sumMetricSamples(text, ":prefix_cache_hits{");
  const queries = sumMetricSamples(text, ":prefix_cache_queries{");
  if (hits === null || queries === null || queries <= 0) {
    return null;
  }
  return hits / queries;
}

export function parseVllmLiveStatsFromPrometheus(text: string): VllmLiveStats {
  const gpuKv = pickMetricAny(text, [
    "kv_cache_usage_perc",
    "gpu_cache_usage_perc",
  ]);
  const cpuKv = pickMetric(text, "cpu_cache_usage_perc");
  const run = pickMetric(text, "num_requests_running");
  const wait = pickMetric(text, "num_requests_waiting");
  const promptTot = pickMetric(text, "prompt_tokens_total");
  const genTot = pickMetric(text, "generation_tokens_total");

  const prefixHit =
    prefixHitRateFromV1Counters(text) ??
    pickMetricAny(text, [
      "gpu_prefix_cache_hit_rate",
      "cpu_prefix_cache_hit_rate",
      "prefix_cache_hit_rate",
      "vllm_gpu_prefix_cache_hit_rate",
    ]);
  const cpuPrefixGauge = pickMetricAny(text, ["cpu_prefix_cache_hit_rate"]);
  const swapped = pickMetric(text, "num_requests_swapped");
  const ttftP95 = parseTimeToFirstTokenP95Seconds(text);

  return {
    gpuCacheUsageFrac: gpuKv,
    cpuCacheUsageFrac: cpuKv,
    gpuPrefixCacheHitRateFrac: prefixHit,
    cpuPrefixCacheHitRateFrac: cpuPrefixGauge,
    timeToFirstTokenP95Seconds: ttftP95,
    numRequestsRunning: run,
    numRequestsWaiting: wait,
    numRequestsSwapped: swapped,
    promptTokensTotal: promptTot,
    generationTokensTotal: genTot,
  };
}
