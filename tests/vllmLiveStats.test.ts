import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVllmLiveStatsFromPrometheus } from "../server/metrics/vllmLiveStats.js";

describe("parseVllmLiveStatsFromPrometheus", () => {
  it("computes prefix hit rate from V1 *_total counters", () => {
    const text = `
# HELP vllm:prefix_cache_queries_total Prefix cache queries
# TYPE vllm:prefix_cache_queries_total counter
vllm:prefix_cache_queries_total{engine="0",model_name="m"} 100.0
# HELP vllm:prefix_cache_hits_total Prefix cache hits
# TYPE vllm:prefix_cache_hits_total counter
vllm:prefix_cache_hits_total{engine="0",model_name="m"} 40.0
vllm:external_prefix_cache_hits_total{engine="0",model_name="m"} 999.0
vllm:external_prefix_cache_queries_total{engine="0",model_name="m"} 999.0
vllm:kv_cache_usage_perc{engine="0",model_name="m"} 0.25
`;
    const s = parseVllmLiveStatsFromPrometheus(text);
    assert.equal(s.gpuCacheUsageFrac, 0.25);
    assert.equal(s.gpuPrefixCacheHitRateFrac, 0.4);
    assert.equal(s.numRequestsSwapped, null);
  });

  it("still accepts legacy counters without _total", () => {
    const text = `
vllm:prefix_cache_queries{engine="0"} 50.0
vllm:prefix_cache_hits{engine="0"} 10.0
`;
    const s = parseVllmLiveStatsFromPrometheus(text);
    assert.equal(s.gpuPrefixCacheHitRateFrac, 0.2);
  });
});
