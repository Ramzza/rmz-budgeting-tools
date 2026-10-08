import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SHEETS-001: manual connection command loads the package .env file", async () => {
  const packageManifest = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };

  assert.match(packageManifest.scripts["test:connection"], /--env-file=\.env/);
});
