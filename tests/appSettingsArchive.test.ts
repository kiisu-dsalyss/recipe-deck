import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyArchiveSetting, parseAppSettingsPost } from "../server/appSettings.js";
import type { AppConfig } from "../server/config.types.js";

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    switcherPort: 3000,
    vllmPortA: 8000,
    python: "python3",
    readyRegex: "Uvicorn running",
    healthProbeTimeoutMs: 600000,
    bootSigtermGraceMs: 15000,
    diskStatsIntervalMs: 45000,
    gpuStatsIntervalMs: 10000,
    vllmMetricsIntervalMs: 5000,
    simpleUi: false,
    hfArchiveEnabled: false,
    hfArchiveDir: "",
    ...over,
  };
}

describe("app settings archive", () => {
  it("accepts archive off with an empty path", () => {
    const parsed = parseAppSettingsPost(validBody());
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.updates.HF_ARCHIVE_ENABLED, "false");
    assert.equal(parsed.updates.HF_ARCHIVE_DIR, "");
  });

  it("keeps a remembered path when archive is off", () => {
    const parsed = parseAppSettingsPost(
      validBody({ hfArchiveEnabled: false, hfArchiveDir: "/mnt/archive/hf-archive" }),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.updates.HF_ARCHIVE_ENABLED, "false");
    assert.equal(parsed.updates.HF_ARCHIVE_DIR, "/mnt/archive/hf-archive");
  });

  it("requires an absolute path when archive is enabled", () => {
    const empty = parseAppSettingsPost(validBody({ hfArchiveEnabled: true, hfArchiveDir: "" }));
    assert.equal(empty.ok, false);
    const rel = parseAppSettingsPost(
      validBody({ hfArchiveEnabled: true, hfArchiveDir: "hf-archive" }),
    );
    assert.equal(rel.ok, false);
    const ok = parseAppSettingsPost(
      validBody({ hfArchiveEnabled: true, hfArchiveDir: "/mnt/archive/hf-archive" }),
    );
    assert.equal(ok.ok, true);
  });

  it("applies archive on and off to running config without restart", () => {
    const cfg = { hfArchiveDir: undefined } as AppConfig;
    applyArchiveSetting(cfg, {
      HF_ARCHIVE_ENABLED: "true",
      HF_ARCHIVE_DIR: "/mnt/archive/hf-archive",
    });
    assert.equal(cfg.hfArchiveDir, "/mnt/archive/hf-archive");
    applyArchiveSetting(cfg, {
      HF_ARCHIVE_ENABLED: "false",
      HF_ARCHIVE_DIR: "/mnt/archive/hf-archive",
    });
    assert.equal(cfg.hfArchiveDir, undefined);
  });
});
