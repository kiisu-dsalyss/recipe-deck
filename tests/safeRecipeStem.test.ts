import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRecipeStem } from "../server/recipeScanner.js";

describe("safeRecipeStem", () => {
  it("accepts nested stems", () => {
    assert.equal(safeRecipeStem("cluster/qwen3.5-122b-fp8"), "cluster/qwen3.5-122b-fp8");
  });

  it("strips a leading slash", () => {
    assert.equal(safeRecipeStem("/my-recipe"), "my-recipe");
  });

  it("rejects parent-directory traversal", () => {
    assert.equal(safeRecipeStem("../secret"), null);
    assert.equal(safeRecipeStem("foo/../bar"), null);
  });

  it("rejects illegal characters", () => {
    assert.equal(safeRecipeStem("foo bar"), null);
    assert.equal(safeRecipeStem("foo;rm"), null);
  });

  it("rejects empty input", () => {
    assert.equal(safeRecipeStem(""), null);
    assert.equal(safeRecipeStem("   "), null);
  });
});
