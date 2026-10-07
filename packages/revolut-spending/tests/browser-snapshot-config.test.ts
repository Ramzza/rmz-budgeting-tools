import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("PRD-007: the homepage snapshot is available through an optional manual CI workflow", () => {
  const root = process.cwd();
  const repositoryRoot = join(root, "../..");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const buildWorkflowPath = join(repositoryRoot, ".github/workflows/build-test.yml");
  assert.ok(existsSync(buildWorkflowPath), "root build-and-test workflow must exist");
  const buildWorkflow = readFileSync(buildWorkflowPath, "utf8");
  const snapshotWorkflowPath = join(repositoryRoot, ".github/workflows/browser-snapshot.yml");
  assert.ok(existsSync(snapshotWorkflowPath), "optional browser snapshot workflow must exist");
  const snapshotWorkflow = readFileSync(snapshotWorkflowPath, "utf8");

  assert.ok(existsSync(join(root, "tests/resources/01-revolut-homepage.png")));
  assert.equal(
    packageJson.scripts?.["test:browser-snapshot"],
    "node node_modules/@playwright/test/cli.js test tests/browser-snapshot.spec.ts",
  );
  assert.doesNotMatch(buildWorkflow, /playwright install/);
  assert.doesNotMatch(buildWorkflow, /test:browser-snapshot/);
  assert.match(snapshotWorkflow, /^on:\r?\n  workflow_dispatch:\r?$/m);
  assert.doesNotMatch(snapshotWorkflow, /^  (?:push|pull_request):/m);
  assert.match(snapshotWorkflow, /node packages\/revolut-spending\/node_modules\/playwright\/cli\.js install --with-deps chromium/);
  assert.match(snapshotWorkflow, /npm run test:browser-snapshot/);
});
