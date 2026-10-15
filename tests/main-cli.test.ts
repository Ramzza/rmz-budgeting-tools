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

test("APP-001: help explains how the year and month select the spreadsheet and tab", async () => {
  assert.ok(cliModule, "the root CLI module must be available");
  const output: string[] = [];

  await cliModule.run(["--help"], { writeStdout: (value: string) => output.push(value) });

  assert.match(output.join(""), /spreadsheet for that year/i);
  assert.match(output.join(""), /month selects the two-digit MM tab/i);
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
  const revolutCalls: string[][] = [];
  const output: string[] = [];
  try {
    await writeFile(join(directory, ".env"), "GOOGLE_SHEETS_SPREADSHEET_ID=sheet-from-env\n");
    await cliModule.run(["2026-09"], {
      workingDirectory: directory,
      runRevolut: async (args: readonly string[]) => {
        revolutCalls.push([...args]);
        return "";
      },
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
  assert.deepEqual(revolutCalls, [["browser-login", "2026-Sep"]]);
  assert.match(output[0] ?? "", /"updatedCells": 7/);
});

test("APP-002: SPEND-006: monthly CLI captures the requested Revolut month before updating the sheet", async () => {
  assert.ok(cliModule, "the root CLI module must be available");
  const calls: string[] = [];
  const output: string[] = [];

  await cliModule.run(["2026-09", "--sheet-id", "sheet-123"], {
    runRevolut: async (args: readonly string[]) => {
      calls.push(`revolut:${args.join(" ")}`);
      return "Browser session closed.";
    },
    runMonthlyWorkflow: async (options) => {
      calls.push(`monthly:${options.yearMonth}:${options.spreadsheetId}:${options.spendingFile ?? "default"}`);
      return { yearMonth: options.yearMonth, asOfDate: "2026-09-30", updatedCells: 7 };
    },
    writeStdout: (value: string) => output.push(value),
  });

  assert.deepEqual(calls, [
    "revolut:browser-login 2026-Sep",
    "monthly:2026-09:sheet-123:default",
  ]);
  assert.equal(output[0], "Browser session closed.\n");
  assert.match(output[1] ?? "", /"updatedCells": 7/);
});

test("APP-002: SPEND-006: an explicit spending file skips browser capture", async () => {
  assert.ok(cliModule, "the root CLI module must be available");
  const calls: string[] = [];

  await cliModule.run(
    ["2026-09", "--sheet-id", "sheet-123", "--spending-file", "spending.html"],
    {
      runRevolut: async () => {
        calls.push("capture");
        return "";
      },
      runMonthlyWorkflow: async (options) => {
        calls.push(`monthly:${options.spendingFile}`);
        return { yearMonth: options.yearMonth, asOfDate: "2026-09-30", updatedCells: 7 };
      },
      writeStdout: () => {},
    },
  );

  assert.deepEqual(calls, ["monthly:spending.html"]);
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
