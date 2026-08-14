import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeRecipeDeckFromExisting,
  parseRecipeBroken,
} from "../server/recipeDeckMeta.js";

describe("parseRecipeBroken", () => {
  it("reads recipe_deck.broken", () => {
    assert.equal(parseRecipeBroken("name: a\nrecipe_deck:\n  broken: true\n"), true);
    assert.equal(parseRecipeBroken("name: a\n"), false);
  });

  it("returns false on invalid YAML", () => {
    assert.equal(parseRecipeBroken(": not yaml"), false);
  });
});

describe("mergeRecipeDeckFromExisting", () => {
  it("keeps disk recipe_deck when the save omits it", () => {
    const incoming = "name: a\nvllm_args: []\n";
    const existing = "name: a\nrecipe_deck:\n  broken: true\n";
    const merged = mergeRecipeDeckFromExisting(incoming, existing);
    assert.equal(parseRecipeBroken(merged), true);
  });

  it("does not override an explicit incoming recipe_deck", () => {
    const incoming = "name: a\nrecipe_deck: {}\n";
    const existing = "name: a\nrecipe_deck:\n  broken: true\n";
    const merged = mergeRecipeDeckFromExisting(incoming, existing);
    assert.equal(parseRecipeBroken(merged), false);
  });
});
