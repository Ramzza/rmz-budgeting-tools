import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { main } from "../src/cli.js";

const ratePage = `
<table>
  <tr><td>EUR</td><td>Euro</td><td>4.9765</td><td>0</td></tr>
  <tr><td>USD</td><td>US Dollar</td><td>4.25</td><td>0</td></tr>
</table>
`;

test("PRD-003: exchange-rate CLI preserves the source precision and retains JSON/CSV formats", async (t) => {
  let output = "";
  t.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  t.mock.method(globalThis, "fetch", async () => new Response(ratePage, { status: 200 }));

  const args = [
    "node",
    "rmz-market-data",
    "exchange-rates",
    "--start",
    "2024-01-02",
    "--end",
    "2024-01-02",
    "--currencies",
    "EUR",
  ];
  await main(args);
  assert.equal(output, "4.9765\n");

  output = "";
  await main([...args, "--format", "json"]);
  assert.deepEqual(JSON.parse(output), [
    { date: "2024-01-02", currency: "EUR", ron_per_unit: 4.9765 },
  ]);

  output = "";
  await main([...args, "--format", "csv"]);
  assert.equal(output, "date,currency,ron_per_unit\n2024-01-02,EUR,4.9765\n");
});

test("PRD-003: exchange-rate CLI requires one date and one currency", async (t) => {
  let output = "";
  let errorOutput = "";
  let fetchCalls = 0;
  const originalExitCode = process.exitCode;
  t.after(() => {
    process.exitCode = originalExitCode;
  });
  t.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  t.mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
    errorOutput += String(chunk);
    return true;
  });
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return new Response(ratePage, { status: 200 });
  });

  await main([
    "node",
    "rmz-market-data",
    "exchange-rates",
    "--start",
    "2024-01-02",
    "--end",
    "2024-01-03",
    "--currencies",
    "EUR",
  ]);
  assert.equal(process.exitCode, 2);
  assert.equal(
    errorOutput,
    "rmz-market-data: error: exchange-rate requests require identical --start and --end dates\n",
  );
  assert.equal(fetchCalls, 0);

  process.exitCode = originalExitCode;
  output = "";
  errorOutput = "";
  await main([
    "node",
    "rmz-market-data",
    "exchange-rates",
    "--start",
    "2024-01-02",
    "--end",
    "2024-01-02",
    "--currencies",
    "EUR",
    "USD",
  ]);
  assert.equal(process.exitCode, 2);
  assert.equal(
    errorOutput,
    "rmz-market-data: error: exactly one currency code must be requested\n",
  );
  assert.equal(fetchCalls, 0);
  assert.equal(output, "");
});

test("PRD-003: price CLI formats default closes by currency and retains JSON/CSV formats", () => {
  const cliModuleUrl = new URL("../src/cli.ts", import.meta.url).href;
  const script = [
    'import YahooFinance from "yahoo-finance2";',
    "let includeQuote = true;",
    "let close = 123.456;",
    'let currency = "USD";',
    'YahooFinance.prototype.chart = async () => ({',
    "  meta: { currency },",
    '  quotes: includeQuote ? [{ date: new Date("2024-01-02T12:00:00Z"), close }] : [],',
    '});',
    `const { main } = await import(${JSON.stringify(cliModuleUrl)});`,
    'const args = ["node", "rmz-market-data", "prices", "AAPL", "--date", "2024-01-02"];',
    'await main(args);',
    'currency = "EUR";',
    'await main(args);',
    'await main([...args, "--format", "json"]);',
    'await main([...args, "--format", "csv"]);',
    'currency = "RON";',
    "close = 123.4;",
    'await main(args);',
    'currency = "JPY";',
    'await main(args);',
    "includeQuote = false;",
    "await main(args);",
    "await main([...args, \"--format\", \"csv\"]);",
    "includeQuote = true;",
    "close = Number.POSITIVE_INFINITY;",
    "await main(args);",
  ].join("\n");
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(child.status, 0, child.stderr);
  const expectedJson = JSON.stringify([{
    date: "2024-01-02",
    symbol: "AAPL",
    close: 123.456,
  }], null, 2);
  assert.equal(
    child.stdout,
    [
      "123.46",
      "123.46",
      expectedJson,
      "date,symbol,close\n2024-01-02,AAPL,123.456",
      "123.400",
      "123.4",
      "[]",
      "date,symbol,close",
      "null",
      "",
    ].join("\n"),
  );
});
