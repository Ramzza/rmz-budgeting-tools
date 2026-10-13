import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cliModule = await import("../src/cli.js").catch(() => undefined);

test("APP-001: monthly CLI defaults to the previous month and accepts an explicit month and sheet ID", () => {
  assert.ok(cliModule, "the root CLI module must be available");
  assert.deepEqual(
    cliModule.parseArguments(["--sheet-id", "sheet-123"], new Date("2026-10-13T12:00:00.000Z")),
    {
      command: "monthly",
      yearMonth: "2026-09",
      spreadsheetId: "sheet-123",
      spendingFile: undefined,
    },
  );
  assert.deepEqual(
    cliModule.parseArguments(
      ["2026-08", "--sheet-id", "sheet-456", "--spending-file", "spend.html"],
      new Date("2026-10-13T12:00:00.000Z"),
    ),
    {
      command: "monthly",
      yearMonth: "2026-08",
      spreadsheetId: "sheet-456",
      spendingFile: "spend.html",
    },
  );
});

test("APP-003: the root CLI routes module-specific commands separately", () => {
  assert.ok(cliModule, "the root CLI module must be available");
  assert.deepEqual(cliModule.parseArguments(["sheets", "get", "sheet-123", "Budget!A1"]), {
    command: "sheets",
    args: ["get", "sheet-123", "Budget!A1"],
  });
  assert.deepEqual(cliModule.parseArguments(["market-data", "prices", "AAPL", "--date", "2026-09-30"]), {
    command: "market-data",
    args: ["prices", "AAPL", "--date", "2026-09-30"],
  });
  assert.deepEqual(cliModule.parseArguments(["revolut", "categories", "spending.html"]), {
    command: "revolut",
    args: ["categories", "spending.html"],
  });
});

test("APP-001: resolves the sheet ID from the working directory .env file", async () => {
  assert.ok(cliModule, "the root CLI module must be available");
  const directory = await mkdtemp(join(tmpdir(), "rmz-budgeting-cli-"));
  const originalSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const monthlyCalls: Array<{ yearMonth: string; spreadsheetId: string; spendingFile?: string }> = [];
  const output: string[] = [];
  try {
    await writeFile(join(directory, ".env"), "GOOGLE_SHEETS_SPREADSHEET_ID=sheet-from-env\n");
    await cliModule.run(["2026-09"], {
      workingDirectory: directory,
      runMonthlyWorkflow: async (options) => {
        monthlyCalls.push(options);
        return { yearMonth: options.yearMonth, asOfDate: "2026-09-30", updatedCells: 7 };
      },
      writeStdout: (value: string) => output.push(value),
    });
  } finally {
    if (originalSpreadsheetId === undefined) {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    } else {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = originalSpreadsheetId;
    }
    await rm(directory, { recursive: true, force: true });
  }

  assert.deepEqual(monthlyCalls, [{
    yearMonth: "2026-09",
    spreadsheetId: "sheet-from-env",
    spendingFile: undefined,
  }]);
  assert.match(output[0] ?? "", /"updatedCells": 7/);
});

test("APP-003: invokes the routed tools through their module CLIs", async () => {
  assert.ok(cliModule, "the root CLI module must be available");
  const calls: string[][] = [];
  const output: string[] = [];

  await cliModule.run(["sheets", "get", "sheet-1", "Budget!A1"], {
    runSheets: async (args: string[]) => {
      calls.push(["sheets", ...args]);
    },
  });
  await cliModule.run(["market-data", "prices", "AAPL", "--date", "2026-09-30"], {
    runMarketData: async (args: string[]) => {
      calls.push(["market-data", ...args]);
    },
  });
  await cliModule.run(["revolut", "categories", "spending.html"], {
    runRevolut: async (args: readonly string[]) => {
      calls.push(["revolut", ...args]);
      return "[]";
    },
    writeStdout: (value: string) => output.push(value),
  });
  await cliModule.run(["revolut", "categories", "spending.html", "--output", "categories.json"], {
    runRevolut: async (args: readonly string[]) => {
      calls.push(["revolut", ...args]);
      return "";
    },
    writeStdout: (value: string) => output.push(value),
  });

  assert.deepEqual(calls, [
    ["sheets", "get", "sheet-1", "Budget!A1"],
    ["market-data", process.execPath, "rmz-market-data", "prices", "AAPL", "--date", "2026-09-30"],
    ["revolut", "categories", "spending.html"],
    ["revolut", "categories", "spending.html", "--output", "categories.json"],
  ]);
  assert.deepEqual(output, ["[]\n"]);
});
