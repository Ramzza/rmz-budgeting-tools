import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("every root PRD requirement maps to a named behavioral test", () => {
  const root = process.cwd();
  const prdPath = join(root, "PRD.md");
  assert.ok(existsSync(prdPath), "root PRD.md must exist");
  const prd = readFileSync(prdPath, "utf8");
  const requirementBlocks = prd
    .split(/(?=^- \*\*[A-Z]+-\d{3} - )/m)
    .filter((block) => /^- \*\*[A-Z]+-\d{3} - /m.test(block));

  assert.ok(requirementBlocks.length > 0, "PRD must define stable requirement IDs");
  const requirementIds = requirementBlocks.map((block) => {
    const match = /^- \*\*([A-Z]+-\d{3}) - /m.exec(block);
    assert.ok(match?.[1], "each requirement must have a stable ID");
    return match[1];
  });
  assert.equal(new Set(requirementIds).size, requirementIds.length, "requirement IDs must be unique");

  for (const block of requirementBlocks) {
    const id = /^- \*\*([A-Z]+-\d{3}) - /m.exec(block)?.[1];
    assert.ok(id, "each requirement must have a stable ID");
    const mappings = [
      ...block.matchAll(/^\s{2}- `([^`]+\.test\.ts)` tests tagged `([A-Z]+-\d{3})`\./gm),
    ];
    assert.ok(mappings.length > 0, `${id} must map to at least one test`);

    for (const [, relativePath, testTag] of mappings) {
      assert.ok(relativePath && testTag, `${id} must include a test path and test tag`);
      const testPath = join(root, relativePath);
      assert.ok(existsSync(testPath), `${id} maps to missing test file ${relativePath}`);
      const testSource = readFileSync(testPath, "utf8");
      assert.ok(testSource.includes(`${testTag}:`), `${id} maps to no named test tagged ${testTag}`);
    }
  }
});
