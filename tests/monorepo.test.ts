import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

type PackageManifest = {
  name?: string;
  scripts?: Record<string, string>;
};

test("MONOREPO-001: root commands install, build, and test each package", () => {
  const root = process.cwd();
  const rootManifestPath = join(root, "package.json");
  assert.ok(existsSync(rootManifestPath), "root package.json must exist");

  const rootManifest: PackageManifest = JSON.parse(readFileSync(rootManifestPath, "utf8"));
  const expectedPackages = [
    ["packages/google-sheets", "rmz-google-sheets"],
    ["packages/market-data", "rmz-market-data"],
    ["packages/revolut-spending", "rmz-revolut-spending"],
  ] as const;

  const installScript = rootManifest.scripts?.["install:packages"] ?? "";
  const buildScript = rootManifest.scripts?.build ?? "";
  const testScript = rootManifest.scripts?.["test:packages"] ?? "";
  assert.ok(installScript, "root npm scripts must install each package");
  assert.ok(buildScript, "root npm scripts must build each package");
  assert.ok(rootManifest.scripts?.test, "root npm scripts must test each package");
  assert.ok(testScript, "root npm scripts must run every package test command");

  const workflowPath = join(root, ".github/workflows/build-test.yml");
  assert.ok(existsSync(workflowPath), "root build-and-test workflow must exist");
  const workflow = readFileSync(workflowPath, "utf8");
  assert.match(workflow, /pull_request:/, "pull requests must run the root workflow");
  assert.match(workflow, /npm run install:packages/, "the root workflow must install all package dependencies");
  assert.match(workflow, /npm run build/, "the root workflow must build all packages");
  assert.match(workflow, /npm test/, "the root workflow must run all tests");

  for (const [relativePath, packageName] of expectedPackages) {
    const manifestPath = join(root, relativePath, "package.json");
    assert.ok(existsSync(manifestPath), `${packageName} manifest must exist`);
    assert.ok(existsSync(join(root, relativePath, "package-lock.json")), `${packageName} lockfile must exist`);
    const manifest: PackageManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.name, packageName);
    assert.ok(manifest.scripts?.build, `${packageName} must define a build command`);
    assert.ok(manifest.scripts?.test, `${packageName} must define a test command`);
    assert.ok(
      installScript.includes(`npm ci --prefix ${relativePath}`),
      `${packageName} must install from its package path`,
    );
    assert.ok(
      buildScript.includes(`npm run build --prefix ${relativePath}`),
      `${packageName} must build from its package path`,
    );
    assert.ok(
      testScript.includes(`npm test --prefix ${relativePath}`),
      `${packageName} tests must run from its package path`,
    );
  }
});
