import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyRecipeLaunch,
  probeRecipeYaml,
} from "../server/recipeProbe.js";

describe("classifyRecipeLaunch", () => {
  it("classifies min_nodes>1 as sparkrun-cluster", () => {
    assert.equal(
      classifyRecipeLaunch({
        minNodes: 2,
        recipeVersion: null,
        runtime: null,
      }),
      "sparkrun-cluster",
    );
  });

  it("classifies recipe_version=2 + runtime as sparkrun-cluster", () => {
    assert.equal(
      classifyRecipeLaunch({
        minNodes: 1,
        recipeVersion: "2",
        runtime: "vllm",
      }),
      "sparkrun-cluster",
    );
  });

  it("treats recipe_version=2.0 + runtime the same as v2", () => {
    assert.equal(
      classifyRecipeLaunch({
        minNodes: 1,
        recipeVersion: "2.0",
        runtime: "vllm",
      }),
      "sparkrun-cluster",
    );
  });

  it("solo when v2 declared but runtime missing", () => {
    assert.equal(
      classifyRecipeLaunch({
        minNodes: 1,
        recipeVersion: "2",
        runtime: null,
      }),
      "solo",
    );
  });

  it("solo when nothing indicates a cluster", () => {
    assert.equal(
      classifyRecipeLaunch({
        minNodes: null,
        recipeVersion: null,
        runtime: null,
      }),
      "solo",
    );
  });
});

describe("probeRecipeYaml", () => {
  it("extracts model, container, gpu_memory_utilization for solo recipes", () => {
    const yaml = [
      "model: qwen/Qwen3-8B",
      "container: vllm/vllm-openai:latest",
      "defaults:",
      "  gpu_memory_utilization: 0.85  # keep headroom",
      "  port: 8100",
      "",
    ].join("\n");
    const r = probeRecipeYaml(yaml);
    assert.equal(r.model, "qwen/Qwen3-8B");
    assert.equal(r.container, "vllm/vllm-openai:latest");
    assert.equal(r.gpuMemDefault, "0.85");
    assert.equal(r.port, 8100);
    assert.equal(r.kind, "solo");
    assert.equal(r.minNodes, null);
    assert.equal(r.recipeVersion, null);
    assert.equal(r.runtime, null);
  });

  it("classifies a sparkrun v2 recipe with runtime as cluster", () => {
    const yaml = [
      "recipe_version: 2",
      "runtime: vllm",
      "min_nodes: 1",
      "port: 8200",
      "model: llama/Llama-3.1-70B",
      "",
    ].join("\n");
    const r = probeRecipeYaml(yaml);
    assert.equal(r.kind, "sparkrun-cluster");
    assert.equal(r.minNodes, 1);
    assert.equal(r.recipeVersion, "2");
    assert.equal(r.runtime, "vllm");
    assert.equal(r.port, 8200);
    assert.equal(r.model, "llama/Llama-3.1-70B");
  });

  it("classifies min_nodes>1 as cluster even without recipe_version", () => {
    const yaml = ["min_nodes: 4", "model: m", ""].join("\n");
    const r = probeRecipeYaml(yaml);
    assert.equal(r.kind, "sparkrun-cluster");
    assert.equal(r.minNodes, 4);
  });

  it("strips quotes and trailing comments from string fields", () => {
    const yaml = [
      'model: "qwen/Qwen3" # v3',
      "runtime: 'vllm'  # cluster",
      "recipe_version: '2'",
      "min_nodes: 3",
      "",
    ].join("\n");
    const r = probeRecipeYaml(yaml);
    assert.equal(r.model, "qwen/Qwen3");
    assert.equal(r.runtime, "vllm");
    assert.equal(r.recipeVersion, "2");
    assert.equal(r.kind, "sparkrun-cluster");
  });
});
