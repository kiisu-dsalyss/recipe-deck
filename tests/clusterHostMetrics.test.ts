import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseClusterYaml,
  isLocalHost,
  hostLabel,
} from "../server/metrics/clusterHosts.js";
import { parseRemoteAccelStdout } from "../server/metrics/remoteHostMetrics.js";

// ---------------------------------------------------------------------------
// parseClusterYaml
// ---------------------------------------------------------------------------
describe("parseClusterYaml", () => {
  it("parses hosts and user from a valid cluster YAML", () => {
    const raw = `
user: spark
hosts:
  - 192.168.68.60
  - 192.168.68.61
`;
    const info = parseClusterYaml(raw, "gx10-dual");
    assert.ok(info, "should return ClusterInfo");
    assert.equal(info.name, "gx10-dual");
    assert.equal(info.user, "spark");
    assert.deepEqual(info.hosts, ["192.168.68.60", "192.168.68.61"]);
  });

  it("returns null when hosts list is absent", () => {
    const raw = `user: spark\n`;
    const info = parseClusterYaml(raw, "empty");
    assert.equal(info, null);
  });

  it("returns null when hosts list is empty", () => {
    const raw = `hosts: []\n`;
    assert.equal(parseClusterYaml(raw, "empty"), null);
  });

  it("omits user when not present in YAML", () => {
    const raw = `hosts:\n  - 10.0.0.1\n`;
    const info = parseClusterYaml(raw, "solo");
    assert.ok(info);
    assert.equal(info.user, undefined);
    assert.deepEqual(info.hosts, ["10.0.0.1"]);
  });

  it("returns null on invalid YAML", () => {
    assert.equal(parseClusterYaml(": :: bad yaml {{", "bad"), null);
  });
});

// ---------------------------------------------------------------------------
// isLocalHost
// ---------------------------------------------------------------------------
describe("isLocalHost", () => {
  it("treats 127.0.0.1 as local", () => {
    assert.ok(isLocalHost("127.0.0.1", new Set()));
  });

  it("treats localhost as local", () => {
    assert.ok(isLocalHost("localhost", new Set()));
  });

  it("matches IP in local addresses set", () => {
    assert.ok(isLocalHost("192.168.1.10", new Set(["192.168.1.10"])));
  });

  it("returns false for unknown IP", () => {
    assert.ok(!isLocalHost("192.168.1.99", new Set(["192.168.1.10"])));
  });
});

// ---------------------------------------------------------------------------
// hostLabel
// ---------------------------------------------------------------------------
describe("hostLabel", () => {
  it("returns last octet with dot for IPv4", () => {
    assert.equal(hostLabel("192.168.68.100"), ".100");
    assert.equal(hostLabel("10.0.0.1"), ".1");
  });

  it("returns first hostname segment for FQDNs", () => {
    assert.equal(hostLabel("node1.local"), "node1");
    assert.equal(hostLabel("worker2.cluster.example"), "worker2");
  });

  it("returns full string for plain hostname without dots", () => {
    assert.equal(hostLabel("myhost"), "myhost");
  });
});

// ---------------------------------------------------------------------------
// parseRemoteAccelStdout
// ---------------------------------------------------------------------------
describe("parseRemoteAccelStdout", () => {
  const CPU_LINE =
    "CPU cpu 12345 678 90 1234 567 0 890 0 0 0";

  it("returns utilizationPct null on first call (no previous sample)", () => {
    const { cpu, newCpuSample } = parseRemoteAccelStdout(CPU_LINE, null);
    assert.ok(cpu);
    assert.equal(cpu.utilizationPct, null);
    assert.ok(newCpuSample, "should capture new cpu sample");
  });

  it("computes CPU utilization delta on second call", () => {
    const prev = { idle: 1000, total: 5000 };
    // total=1600 < prev.total=5000 → delta not positive → utilizationPct null
    const line = "CPU cpu 100 50 50 1200 0 0 200 0 0 0";
    const { cpu } = parseRemoteAccelStdout(line, prev);
    assert.ok(cpu);
    assert.equal(cpu.utilizationPct, null);
  });

  it("computes positive utilization when total increases", () => {
    const prev = { idle: 1000, total: 2000 };
    // idle=3100+0=3100, total=4000
    // delta idle = 3100-1000=2100, delta total=4000-2000=2000
    const line2 = "CPU cpu 900 0 0 3100 0 0 0 0 0 0";
    // idle=3100+0=3100, total=4000
    // delta idle = 3100-1000=2100, delta total=4000-2000=2000
    // busy = 1 - 2100/2000 = negative → clamp to 0
    const r = parseRemoteAccelStdout(line2, prev);
    assert.ok(r.cpu);
    assert.equal(r.cpu.utilizationPct, 0);
  });

  it("parses standard nvidia-smi CSV GPU rows", () => {
    const stdout = [
      "CPU cpu 100 0 50 800 50 0 0 0 0 0",
      "70, 95, 15000, 24000, 220.5",
    ].join("\n");
    const { gpu } = parseRemoteAccelStdout(stdout, null);
    assert.ok(gpu);
    assert.equal(gpu.temperatureC, 70);
    assert.equal(gpu.utilizationPct, 95);
    assert.equal(gpu.memUsedMiB, 15000);
    assert.equal(gpu.memTotalMiB, 24000);
    assert.equal(gpu.powerW, 220.5);
    assert.equal(gpu.gpuCount, 1);
  });

  it("handles [N/A] unified-memory fields (GB10): still returns temp/util/power", () => {
    const stdout = [
      "CPU cpu 100 0 50 800 50 0 0 0 0 0",
      "65, 80, [N/A], [N/A], 150.0",
    ].join("\n");
    const { gpu } = parseRemoteAccelStdout(stdout, null);
    assert.ok(gpu);
    assert.equal(gpu.temperatureC, 65);
    assert.equal(gpu.utilizationPct, 80);
    assert.equal(gpu.memUsedMiB, null);
    assert.equal(gpu.memTotalMiB, null);
    assert.equal(gpu.powerW, 150);
  });

  it("returns null gpu when no GPU lines present", () => {
    const stdout = "CPU cpu 100 0 50 800 50 0 0 0 0 0\n";
    const { gpu } = parseRemoteAccelStdout(stdout, null);
    assert.equal(gpu, null);
  });

  it("handles multi-GPU output", () => {
    const stdout = [
      "CPU cpu 100 0 50 800 50 0 0 0 0 0",
      "72, 90, 20000, 80000, 300.0",
      "68, 85, 18000, 80000, 280.0",
    ].join("\n");
    const { gpu } = parseRemoteAccelStdout(stdout, null);
    assert.ok(gpu);
    assert.equal(gpu.gpuCount, 2);
    assert.equal(gpu.memUsedMiB, 20000);
    assert.deepEqual(gpu.perGpuMem, [
      { usedMiB: 20000, totalMiB: 80000 },
      { usedMiB: 18000, totalMiB: 80000 },
    ]);
  });
});
