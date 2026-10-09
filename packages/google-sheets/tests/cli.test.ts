import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import {
  parseArguments,
  parseValues,
  readSpendingInput,
  resolveSpreadsheetId,
  run,
} from "../src/cli.js";
import type { Values } from "../src/sheets.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("SHEETS-004: help documents the monthly category spending command", () => {
  const result = spawnSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /fill-spendings YYYY-MM --spending-input/);
});

test("SHEETS-004: rejects an invalid month before resolving Google credentials", () => {
  const environment = { ...process.env };
  delete environment.GOOGLE_SHEETS_SPREADSHEET_ID;

  const result = spawnSync(
    process.execPath,
    [cliPath, "fill-spendings", "2026-13", "--spending-input", "[]"],
    { env: environment, encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /year-month must use YYYY-MM format with a valid month/i);
});

test("SHEETS-004: parses required spending inputs and defaults the profile to Z", () => {
  const parsed = parseArguments([
    "fill-spendings",
    "2026-09",
    "--spending-input",
    '[{"category":"Groceries","ron":25}]',
  ]);
  assert.deepEqual(parsed, {
    command: "fill-spendings",
    spreadsheetId: undefined,
    yearMonth: "2026-09",
    rawSpendingInput: '[{"category":"Groceries","ron":25}]',
    profile: "Z",
  });

  const profileN = parseArguments([
    "fill-spendings",
    "--profile",
    "N",
    "--spreadsheet-id",
    "spreadsheet-1",
    "2026-09",
    "--spending-input",
    "spendings.json",
  ]);
  assert.equal(profileN.command, "fill-spendings");
  if (profileN.command === "fill-spendings") {
    assert.equal(profileN.profile, "N");
    assert.equal(profileN.spreadsheetId, "spreadsheet-1");
  }
  assert.throws(
    () => parseArguments(["fill-spendings", "2026-09"]),
    /--spending-input is required/,
  );
  assert.throws(
    () => parseArguments(["fill-spendings", "2026-09", "--spending-input", "[]", "--profile", "X"]),
    /--profile must be N or Z/,
  );
});

test("SHEETS-004: accepts inline JSON, a JSON file, and piped JSON input", async () => {
  const input = '[{"category":"Groceries","ron":25}]';
  const expected = [{ category: "Groceries", ron: 25 }];
  assert.deepEqual(await readSpendingInput(input), expected);
  assert.deepEqual(await readSpendingInput("-", async () => input), expected);

  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-spendings-"));
  try {
    const inputPath = join(workingDirectory, "spendings.json");
    await writeFile(inputPath, input);
    assert.deepEqual(await readSpendingInput(inputPath), expected);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test("SHEETS-004: uses the configured sheet ID or fails without prompting", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-spreadsheet-id-"));
  const previousSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  try {
    await assert.rejects(
      resolveSpreadsheetId(undefined, workingDirectory, false),
      /Spreadsheet ID is required.*GOOGLE_SHEETS_SPREADSHEET_ID/i,
    );
    await writeFile(
      join(workingDirectory, ".env"),
      "GOOGLE_SHEETS_SPREADSHEET_ID=configured-spreadsheet-id\n",
    );
    assert.equal(
      await resolveSpreadsheetId(undefined, workingDirectory, false),
      "configured-spreadsheet-id",
    );
  } finally {
    if (previousSpreadsheetId === undefined) {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    } else {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previousSpreadsheetId;
    }
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test("SHEETS-004: exits without prompting when the CLI has no sheet ID", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-no-prompt-"));
  const environment = { ...process.env };
  delete environment.GOOGLE_SHEETS_SPREADSHEET_ID;
  try {
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "fill-spendings",
        "2026-09",
        "--spending-input",
        "[]",
      ],
      { cwd: workingDirectory, env: environment, input: "must not prompt\n", encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Spreadsheet ID is required.*GOOGLE_SHEETS_SPREADSHEET_ID/i);
    assert.doesNotMatch(result.stderr, /Spreadsheet ID:/);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test("SHEETS-004: reads piped JSON and reports malformed input", () => {
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "fill-spendings",
      "2026-09",
      "--spending-input",
      "-",
      "--spreadsheet-id",
      "spreadsheet-1",
    ],
    { input: "[", encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid spending JSON/);
});

test("SHEETS-004: runs the fill command with the requested profile and spreadsheet", async () => {
  const calls: Array<{ method: string; spreadsheetId: string; range: string }> = [];
  const client = {
    spreadsheets: {
      values: {
        get: async (params: { spreadsheetId: string; range: string }) => {
          calls.push({ method: "get", ...params });
          return { data: { values: [["Groceries"]] } };
        },
        update: async (params: {
          spreadsheetId: string;
          range: string;
          requestBody: { values: Values };
        }) => {
          calls.push({ method: "update", ...params });
          return {
            data: {
              updatedRange: params.range,
              updatedRows: params.requestBody.values.length,
            },
          };
        },
      },
    },
  } as unknown as sheets_v4.Sheets;
  const output: string[] = [];

  await run(
    [
      "fill-spendings",
      "2026-09",
      "--spending-input",
      '[{"category":"Groceries","ron":25}]',
      "--profile",
      "N",
      "--spreadsheet-id",
      "spreadsheet-1",
    ],
    {
      createSheetsClient: async () => client,
      writeStdout: (value) => output.push(value),
    },
  );

  assert.deepEqual(calls.map(({ method, spreadsheetId, range }) => ({ method, spreadsheetId, range })), [
    { method: "get", spreadsheetId: "spreadsheet-1", range: "'2026-09'!A43:A70" },
    { method: "update", spreadsheetId: "spreadsheet-1", range: "'2026-09'!C43:C70" },
  ]);
  assert.deepEqual(JSON.parse(output[0] ?? ""), {
    updatedRange: "'2026-09'!C43:C70",
    updatedRows: 28,
  });
});

test("PRD-002: accepts scalar cell values", () => {
  assert.deepEqual(parseValues([["name", 4, true, null]]), [["name", 4, true, null]]);
});

test("PRD-002: rejects invalid row data", () => {
  for (const value of [{ name: "Tea" }, [], [[]], ["Tea"], [["nested", ["value"]]], [[Infinity]]]) {
    assert.throws(() => parseValues(value));
  }
});

test("SHEETS-003: prompts for a spreadsheet ID and rejects an empty response", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-prompt-"));
  const environment = { ...process.env };
  delete environment.GOOGLE_SHEETS_SPREADSHEET_ID;

  let status: number | null = null;
  let stderr = "";
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "get", "Sheet1!A1"],
      { cwd: workingDirectory, env: environment, input: "\n", encoding: "utf8" },
    );
    status = result.status;
    stderr = result.stderr?.toString() ?? "";
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }

  assert.equal(status, 1);
  assert.match(stderr, /Spreadsheet ID:/);
  assert.match(stderr, /spreadsheet ID is required/i);
});

test("SHEETS-003: uses a non-empty spreadsheet ID from the prompt", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-prompt-value-"));
  const environment = { ...process.env };
  delete environment.GOOGLE_SHEETS_SPREADSHEET_ID;

  let status: number | null = null;
  let stderr = "";
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "update", "Sheet1!A1", "--values", "not-json"],
      {
        cwd: workingDirectory,
        env: environment,
        input: "prompted-spreadsheet-id\n",
        encoding: "utf8",
      },
    );
    status = result.status;
    stderr = result.stderr?.toString() ?? "";
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }

  assert.notEqual(status, 0);
  assert.match(stderr, /Spreadsheet ID:/);
  assert.doesNotMatch(stderr, /spreadsheet ID is required/i);
  assert.doesNotMatch(stderr, /Usage:/);
  assert.match(stderr, /invalid JSON values/);
});

test("SHEETS-003: preserves the positional spreadsheet ID syntax", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-positional-id-"));
  const environment = { ...process.env };
  delete environment.GOOGLE_SHEETS_SPREADSHEET_ID;

  let status: number | null = null;
  let stderr = "";
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "update", "positional-id", "Sheet1!A1", "--values", "not-json"],
      { cwd: workingDirectory, env: environment, input: "\n", encoding: "utf8" },
    );
    status = result.status;
    stderr = result.stderr?.toString() ?? "";
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }

  assert.notEqual(status, 0);
  assert.doesNotMatch(stderr, /Spreadsheet ID:/);
  assert.doesNotMatch(stderr, /Usage:/);
  assert.match(stderr, /invalid JSON values/);
});

test("SHEETS-003: loads the spreadsheet ID from the working directory .env", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "rmz-sheets-env-"));
  const previousSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  try {
    await writeFile(
      join(workingDirectory, ".env"),
      "GOOGLE_SHEETS_SPREADSHEET_ID=test-spreadsheet-id\n",
    );
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    assert.equal(
      await resolveSpreadsheetId(undefined, workingDirectory),
      "test-spreadsheet-id",
    );
  } finally {
    if (previousSpreadsheetId === undefined) {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    } else {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = previousSpreadsheetId;
    }
    await rm(workingDirectory, { recursive: true, force: true });
  }
});
