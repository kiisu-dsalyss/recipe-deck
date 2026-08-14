import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCurrentRecipeText } from "../server/currentRecipe.js";

describe("parseCurrentRecipeText", () => {
  it("parses stem and auto-start true", () => {
    const s = parseCurrentRecipeText(
      "CURRENT_RECIPE=qwen/Qwen3\nAUTOSTART_CURRENT_RECIPE=true\n",
    );
    assert.deepEqual(s, { recipeStem: "qwen/Qwen3", autoStart: true });
  });

  it("treats 1 and yes as auto-start", () => {
    assert.equal(
      parseCurrentRecipeText("CURRENT_RECIPE=a\nAUTOSTART_CURRENT_RECIPE=1\n")
        ?.autoStart,
      true,
    );
    assert.equal(
      parseCurrentRecipeText("CURRENT_RECIPE=a\nAUTOSTART_CURRENT_RECIPE=yes\n")
        ?.autoStart,
      true,
    );
  });

  it("returns null when stem is missing", () => {
    assert.equal(parseCurrentRecipeText("AUTOSTART_CURRENT_RECIPE=true\n"), null);
    assert.equal(parseCurrentRecipeText(""), null);
  });

  it("ignores comments and defaults auto-start to false", () => {
    const s = parseCurrentRecipeText("# hi\nCURRENT_RECIPE=demo\n");
    assert.deepEqual(s, { recipeStem: "demo", autoStart: false });
  });
});
