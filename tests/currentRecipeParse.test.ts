import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCurrentRecipeText } from "../server/currentRecipe.js";

describe("parseCurrentRecipeText", () => {
  it("parses stem, auto-start true, defaults auto-restart to true", () => {
    const s = parseCurrentRecipeText(
      "CURRENT_RECIPE=qwen/Qwen3\nAUTOSTART_CURRENT_RECIPE=true\n",
    );
    assert.deepEqual(s, {
      recipeStem: "qwen/Qwen3",
      autoStart: true,
      autoRestart: true,
    });
  });

  it("parses explicit auto-restart flag", () => {
    const s = parseCurrentRecipeText(
      "CURRENT_RECIPE=demo\nAUTOSTART_CURRENT_RECIPE=false\nAUTORESTART_CURRENT_RECIPE=false\n",
    );
    assert.deepEqual(s, {
      recipeStem: "demo",
      autoStart: false,
      autoRestart: false,
    });
  });

  it("treats 1 and yes as truthy", () => {
    assert.equal(
      parseCurrentRecipeText("CURRENT_RECIPE=a\nAUTOSTART_CURRENT_RECIPE=1\n")
        ?.autoStart,
      true,
    );
    assert.equal(
      parseCurrentRecipeText(
        "CURRENT_RECIPE=a\nAUTORESTART_CURRENT_RECIPE=yes\n",
      )?.autoRestart,
      true,
    );
  });

  it("returns null when stem is missing", () => {
    assert.equal(parseCurrentRecipeText("AUTOSTART_CURRENT_RECIPE=true\n"), null);
    assert.equal(parseCurrentRecipeText(""), null);
  });

  it("ignores comments; defaults auto-start=false, auto-restart=true", () => {
    const s = parseCurrentRecipeText("# hi\nCURRENT_RECIPE=demo\n");
    assert.deepEqual(s, {
      recipeStem: "demo",
      autoStart: false,
      autoRestart: true,
    });
  });
});
