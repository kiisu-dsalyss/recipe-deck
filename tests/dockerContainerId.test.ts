import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDockerContainerId } from "../server/metrics/dockerPs.js";

describe("normalizeDockerContainerId", () => {
  it("accepts 12–64 hex chars and strips sha256:", () => {
    assert.equal(normalizeDockerContainerId("abcdef012345"), "abcdef012345");
    assert.equal(
      normalizeDockerContainerId("sha256:abcdef012345"),
      "abcdef012345",
    );
  });

  it("rejects short or non-hex ids", () => {
    assert.equal(normalizeDockerContainerId("abc"), null);
    assert.equal(normalizeDockerContainerId("not-a-container"), null);
  });
});
