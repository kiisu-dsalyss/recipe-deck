import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  decideEnsureSource,
  isHotRepo,
  isModelCached,
  parseHotList,
  repoIdToHubFolderName,
  resolveActiveArchiveDir,
} from "../server/llmArchive.js";

const repo = "orcarouter/Qwen3.8-Flash-Next-Uncensored-NVFP4";

function writeWeight(hfHome: string, model: string): void {
  const snap = path.join(
    hfHome,
    "hub",
    repoIdToHubFolderName(model),
    "snapshots",
    "abc123",
  );
  fs.mkdirSync(snap, { recursive: true });
  fs.writeFileSync(path.join(snap, "model-00001-of-00017.safetensors"), "x");
}

describe("llm-archive helpers", () => {
  let tmp = "";

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llm-archive-"));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("maps repo id to hub folder name", () => {
    assert.equal(
      repoIdToHubFolderName(repo),
      "models--orcarouter--Qwen3.8-Flash-Next-Uncensored-NVFP4",
    );
  });

  it("parses hot-list and skips those repos", () => {
    const hot = parseHotList(
      "# keep\nRadixArk/Qwen3.8-Flash-Next-NVFP4\n\nneko-legends/GLM-5.3-Flash-Uncensored-EXL3\n",
    );
    assert.deepEqual(hot, [
      "RadixArk/Qwen3.8-Flash-Next-NVFP4",
      "neko-legends/GLM-5.3-Flash-Uncensored-EXL3",
    ]);
    assert.equal(isHotRepo("RadixArk/Qwen3.8-Flash-Next-NVFP4", hot), true);
    assert.equal(isHotRepo(repo, hot), false);
  });

  it("treats config-only snapshot as incomplete", () => {
    const live = path.join(tmp, "live-empty");
    const snap = path.join(
      live,
      "hub",
      repoIdToHubFolderName(repo),
      "snapshots",
      "deadbeef",
    );
    fs.mkdirSync(snap, { recursive: true });
    fs.writeFileSync(path.join(snap, "config.json"), "{}");
    assert.equal(isModelCached(live, repo), false);
  });

  it("decides nvme then archive then huggingface", () => {
    const live = path.join(tmp, "live");
    const archive = path.join(tmp, "archive");
    assert.equal(
      decideEnsureSource({ repoId: repo, liveHome: live, archiveHome: archive }),
      "huggingface",
    );
    writeWeight(archive, repo);
    assert.equal(
      decideEnsureSource({ repoId: repo, liveHome: live, archiveHome: archive }),
      "archive",
    );
    writeWeight(live, repo);
    assert.equal(
      decideEnsureSource({ repoId: repo, liveHome: live, archiveHome: archive }),
      "nvme",
    );
  });

  it("skips archive when no archive home is configured", () => {
    const live = path.join(tmp, "live-no-archive");
    const archive = path.join(tmp, "archive-ignored");
    writeWeight(archive, repo);
    assert.equal(
      decideEnsureSource({ repoId: repo, liveHome: live }),
      "huggingface",
    );
    assert.equal(
      decideEnsureSource({ repoId: repo, liveHome: live, archiveHome: "" }),
      "huggingface",
    );
  });

  it("does not infer a Lolipop mount when archive env is unset", () => {
    assert.equal(resolveActiveArchiveDir(undefined, undefined), undefined);
    assert.equal(resolveActiveArchiveDir("", ""), undefined);
    assert.equal(resolveActiveArchiveDir("false", "/mnt/Lolipop/hf-archive"), undefined);
    assert.equal(
      resolveActiveArchiveDir("true", "/mnt/archive/hf-archive"),
      path.resolve("/mnt/archive/hf-archive"),
    );
    assert.equal(
      resolveActiveArchiveDir(undefined, "/data/hf-archive"),
      path.resolve("/data/hf-archive"),
    );
  });
});
