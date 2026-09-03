import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diskUsedPct,
  formatBytes,
  formatBytesCompact,
} from "../client/src/lib/formatBytes.ts";

describe("formatBytes", () => {
  it("uses a space before the unit", () => {
    assert.equal(formatBytes(3.9e12), "3.9 TB");
    assert.equal(formatBytes(-1), "—");
  });
});

describe("formatBytesCompact", () => {
  it("omits the space before the unit", () => {
    assert.equal(formatBytesCompact(3.9e12), "3.9TB");
    assert.equal(formatBytesCompact(512e9), "512.0GB");
    assert.equal(formatBytesCompact(1500), "1.5KB");
    assert.equal(formatBytesCompact(40), "40B");
  });

  it("returns an em dash for invalid sizes", () => {
    assert.equal(formatBytesCompact(-1), "—");
    assert.equal(formatBytesCompact(Number.NaN), "—");
  });
});

describe("diskUsedPct", () => {
  it("returns used percent from free/total", () => {
    assert.equal(diskUsedPct(1.5e12, 3.9e12), ((3.9e12 - 1.5e12) / 3.9e12) * 100);
    assert.equal(diskUsedPct(0, 100), 100);
    assert.equal(diskUsedPct(100, 100), 0);
  });

  it("returns null when totals are unusable", () => {
    assert.equal(diskUsedPct(10, 0), null);
    assert.equal(diskUsedPct(-1, 100), null);
    assert.equal(diskUsedPct(10, Number.NaN), null);
  });

  it("clamps to 0–100", () => {
    assert.equal(diskUsedPct(200, 100), 0);
  });
});
