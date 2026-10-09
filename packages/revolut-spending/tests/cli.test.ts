import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";

const statement = [
  "Started Date,Completed Date,Description,Amount,Currency,State,Category,Type",
  "2025-01-01,2025-01-01,Groceries,-10.00,EUR,COMPLETED,Groceries,Card Payment",
  "2025-01-02,,Pending,-2.00,EUR,PENDING,Shopping,Card Payment",
].join("\n");

const categoryBreakdownHtml = `
<button data-event-key="action.analytics.transaction-breakdown.click">
  <span>Groceries</span><span>1 transaction</span><span>-RON&nbsp;20.00</span><span>100%</span>
</button>`;

async function withStatement(action: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "rmz-revolut-spending-"));
  const path = join(directory, "statement.csv");
  try {
    await writeFile(path, statement);
    await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withHtml(action: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "rmz-revolut-spending-"));
  const path = join(directory, "spending.html");
  try {
    await writeFile(path, categoryBreakdownHtml);
    await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("PRD-004: CLI outputs transactions as JSON by default", async () => {
  await withStatement(async (path) => {
    const result = JSON.parse(await run(["transactions", path])) as Array<{ description: string }>;
    assert.deepEqual(result.map(({ description }) => description), ["Groceries"]);
  });
});

test("PRD-004: CLI filters date range and outputs transaction CSV", async () => {
  await withStatement(async (path) => {
    const result = await run([
      "transactions", path, "--from", "2025-01-01", "--to", "2025-01-01", "--format", "csv",
    ]);
    assert.equal(result, "date,description,amount,currency,category,type\n2025-01-01,Groceries,-10,EUR,Groceries,Card Payment");
  });
});

test("PRD-004: CLI outputs summary JSON and CSV", async () => {
  await withStatement(async (path) => {
    const json = JSON.parse(await run(["summary", path])) as Array<{ totalSpent: number }>;
    assert.equal(json[0].totalSpent, 10);
    assert.equal(
      await run(["summary", path, "--format", "csv"]),
      "currency,transactionCount,totalSpent\nEUR,1,10",
    );
  });
});

test("PRD-005: CLI outputs extracted category RON amounts as JSON and CSV", async () => {
  await withHtml(async (path) => {
    const json = JSON.parse(await run(["categories", path])) as Array<{ category: string; ron: number }>;
    assert.deepEqual(json, [{ category: "Groceries", ron: 20 }]);
    assert.equal(
      await run(["categories", path, "--format", "csv"]),
      "category,ron\nGroceries,20",
    );
    await assert.rejects(
      run(["categories", path, "--from", "2025-01-01"]),
      /only supported for transactions and summary/,
    );
  });
});

test("SPEND-008: categories writes selected JSON and CSV output to a file instead of stdout", async () => {
  await withHtml(async (path) => {
    const directory = dirname(path);
    const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const packagePath = fileURLToPath(new URL("../", import.meta.url));
    const jsonPath = join(directory, "categories.json");
    const jsonResult = spawnSync(
      process.execPath,
      ["--import", "tsx", cliPath, "categories", path, "--output", jsonPath],
      { cwd: packagePath, encoding: "utf8" },
    );
    assert.equal(jsonResult.status, 0, jsonResult.stderr);
    assert.equal(jsonResult.stdout, "");
    assert.equal(jsonResult.stderr, "");
    assert.equal(
      await readFile(jsonPath, "utf8"),
      `${JSON.stringify([{ category: "Groceries", ron: 20 }], null, 2)}\n`,
    );

    const csvPath = join(directory, "categories.csv");
    const csvResult = spawnSync(
      process.execPath,
      ["--import", "tsx", cliPath, "categories", path, "--format", "csv", "--output", csvPath],
      { cwd: packagePath, encoding: "utf8" },
    );
    assert.equal(csvResult.status, 0, csvResult.stderr);
    assert.equal(csvResult.stdout, "");
    assert.equal(csvResult.stderr, "");
    assert.equal(await readFile(csvPath, "utf8"), "category,ron\nGroceries,20\n");
  });
});

test("SPEND-008: categories requires an output path and other commands reject --output", async () => {
  await withStatement(async (path) => {
    await assert.rejects(
      run(["categories", path, "--output"]),
      /Missing value for --output/,
    );
    await assert.rejects(
      run(["transactions", path, "--output", join(dirname(path), "transactions.json")]),
      /only supported for categories/,
    );
  });
});

test("PRD-006: browser-login defaults to the current Analytics month", async () => {
  const now = new Date();
  let selectedMonth: unknown;
  const output = await run(["browser-login"], async (...args: unknown[]) => {
    selectedMonth = args[0];
  });
  assert.deepEqual(selectedMonth, {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    label: "This month",
    monthsBack: 0,
  });
  assert.equal(output, "Browser session closed.");
});

test("PRD-006: browser-login resolves case-insensitive last and year-month inputs", async () => {
  const now = new Date();
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let selectedLast: unknown;
  await run(["browser-login", "LaSt"], async (...args: unknown[]) => {
    selectedLast = args[0];
  });
  assert.deepEqual(selectedLast, {
    year: lastMonth.getFullYear(),
    month: lastMonth.getMonth() + 1,
    label: lastMonth.getFullYear() === now.getFullYear()
      ? monthNames[lastMonth.getMonth()]
      : `${monthNames[lastMonth.getMonth()]} ${lastMonth.getFullYear()}`,
    monthsBack: 1,
  });

  const previousYear = now.getFullYear() - 1;
  let selectedExplicitMonth: unknown;
  await run(["browser-login", `${previousYear}-aUg`], async (...args: unknown[]) => {
    selectedExplicitMonth = args[0];
  });
  assert.deepEqual(selectedExplicitMonth, {
    year: previousYear,
    month: 8,
    label: `Aug ${previousYear}`,
    monthsBack: 12 + now.getMonth() - 7,
  });
});

test("PRD-006: browser-login accepts each supported month abbreviation case-insensitively", async () => {
  const now = new Date();
  const previousYear = now.getFullYear() - 1;
  const months = [
    ["dec", 12, "Dec"],
    ["nov", 11, "Nov"],
    ["oct", 10, "Oct"],
    ["sep", 9, "Sep"],
    ["aug", 8, "Aug"],
    ["jul", 7, "Jul"],
    ["jun", 6, "Jun"],
    ["may", 5, "May"],
    ["apr", 4, "Apr"],
    ["mar", 3, "Mar"],
    ["feb", 2, "Feb"],
    ["jan", 1, "Jan"],
  ] as const;

  for (const [token, month, label] of months) {
    let selectedMonth: unknown;
    await run(["browser-login", `${previousYear}-${token.toUpperCase()}`], async (...args: unknown[]) => {
      selectedMonth = args[0];
    });
    assert.deepEqual(selectedMonth, {
      year: previousYear,
      month,
      label: `${label} ${previousYear}`,
      monthsBack: 12 + now.getMonth() - (month - 1),
    });
  }
});

test("PRD-006: browser-login rejects invalid and future month inputs", async () => {
  await assert.rejects(
    run(["browser-login", "2025-foo"], async () => {}),
    /Month must be last, current, or YYYY-mon/,
  );
  await assert.rejects(
    run(["browser-login", "2025-sept"], async () => {}),
    /Month must be last, current, or YYYY-mon/,
  );
  await assert.rejects(
    run(["browser-login", `${new Date().getFullYear() + 1}-jan`], async () => {}),
    /cannot be in the future/,
  );
});

test("PRD-006: browser-login dispatches without requiring a statement file", async () => {
  let launches = 0;
  const output = await run(["browser-login"], async () => {
    launches += 1;
  });
  assert.equal(launches, 1);
  assert.equal(output, "Browser session closed.");
});

test("PRD-006: browser-login rejects unexpected arguments", async () => {
  let launches = 0;
  await assert.rejects(
    run(["browser-login", "last", "current"], async () => {
      launches += 1;
    }),
    /Usage:/,
  );
  assert.equal(launches, 0);
});

test("PRD-004: CLI rejects invalid commands, options, and date ranges", async () => {
  await withStatement(async (path) => {
    await assert.rejects(run([]), /Usage:/);
    await assert.rejects(run(["other", path]), /Usage:/);
    await assert.rejects(run(["transactions", path, "--from"]), /Missing value for --from/);
    await assert.rejects(run(["transactions", path, "--nope"]), /Unknown option/);
    await assert.rejects(run(["transactions", path, "--format", "xml"]), /must be json or csv/);
    await assert.rejects(run(["transactions", path, "--from", "2025-02-30"]), /valid calendar date/);
    await assert.rejects(
      run(["transactions", path, "--from", "2025-02-01", "--to", "2025-01-01"]),
      /must be on or before/,
    );
  });
});
