import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { injectHfTokenIntoRecipeYaml } from "../server/recipeHfTokenMerge.js";

const BASE = "name: demo\nvllm_args: []\n";

describe("injectHfTokenIntoRecipeYaml", () => {
  it("injects when env.HF_TOKEN is missing", () => {
    const out = injectHfTokenIntoRecipeYaml(BASE, "hf_test_token");
    assert.ok(out);
    assert.match(out, /HF_TOKEN: hf_test_token/);
  });

  it("injects when env uses a ${HF_TOKEN} placeholder", () => {
    const yaml = `${BASE}env:\n  HF_TOKEN: \${HF_TOKEN}\n`;
    const out = injectHfTokenIntoRecipeYaml(yaml, "hf_test_token");
    assert.ok(out);
    assert.match(out, /HF_TOKEN: hf_test_token/);
    assert.doesNotMatch(out, /\$\{HF_TOKEN\}/);
  });

  it("does not overwrite a literal token", () => {
    const yaml = `${BASE}env:\n  HF_TOKEN: already-set\n`;
    assert.equal(injectHfTokenIntoRecipeYaml(yaml, "hf_test_token"), null);
  });

  it("no-ops when token is null or empty", () => {
    assert.equal(injectHfTokenIntoRecipeYaml(BASE, null), null);
    assert.equal(injectHfTokenIntoRecipeYaml(BASE, "  "), null);
  });
});
