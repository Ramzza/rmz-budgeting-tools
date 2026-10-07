import assert from "node:assert/strict";
import test from "node:test";
import { parseValues } from "../src/cli.js";

test("PRD-002: accepts scalar cell values", () => {
  assert.deepEqual(parseValues([["name", 4, true, null]]), [["name", 4, true, null]]);
});

test("PRD-002: rejects invalid row data", () => {
  for (const value of [{ name: "Tea" }, [], [[]], ["Tea"], [["nested", ["value"]]], [[Infinity]]]) {
    assert.throws(() => parseValues(value));
  }
});
