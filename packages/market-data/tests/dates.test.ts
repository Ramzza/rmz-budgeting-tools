import assert from "node:assert/strict";
import test from "node:test";
import { parseDate } from "../src/dates.js";

test("PRD-003: parses only valid YYYY-MM-DD dates", () => {
  assert.equal(parseDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.throws(() => parseDate("2024-02-30"), /invalid date/);
  assert.throws(() => parseDate("2024-2-03"), /YYYY-MM-DD/);
});
