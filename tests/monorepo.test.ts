import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("MONOREPO-001: one root project owns all source, dependencies, and commands", () => {
  const root = process.cwd();
  const manifestPath = join(root, "package.json");
  assert.ok(existsSync(manifestPath), "root package.json must exist");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.ok(existsSync(join(root, "src/cli.ts")), "main CLI must be in root src/");
  assert.ok(existsSync(join(root, "src/google-sheets")), "Sheets module must live under root src/");
  assert.ok(existsSync(join(root, "src/market-data")), "market-data module must live under root src/");
  assert.ok(existsSync(join(root, "src/revolut-spending")), "Revolut module must live under root src/");
  assert.ok(existsSync(join(root, "tsconfig.json")), "one root TypeScript configuration must exist");
  for (const moduleName of ["google-sheets", "market-data", "revolut-spending"]) {
    const packagePath = join(root, "packages", moduleName);
    assert.equal(existsSync(join(packagePath, "package.json")), false, `${moduleName} must not have a separate manifest`);
    assert.equal(existsSync(join(packagePath, "package-lock.json")), false, `${moduleName} must not have a separate lockfile`);
    assert.equal(existsSync(join(packagePath, "README.md")), false, `${moduleName} must not have a separate setup guide`);
    assert.equal(existsSync(join(packagePath, "src")), false, `${moduleName} source must move under root src/`);
  }
  assert.equal(manifest.bin?.["rmz-budgeting-tools"], "dist/cli.js");
  assert.ok(manifest.scripts?.build, "root build command must exist");
  assert.ok(manifest.scripts?.test, "root test command must exist");
  assert.ok(manifest.scripts?.start, "root start command must exist");
  assert.ok(manifest.dependencies?.googleapis, "Google Sheets runtime dependency must be installed at root");
  assert.ok(manifest.dependencies?.["yahoo-finance2"], "market-data runtime dependency must be installed at root");
  assert.ok(manifest.dependencies?.playwright, "browser capture runtime dependency must be installed at root");
});
