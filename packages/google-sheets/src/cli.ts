#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import type { sheets_v4 } from "googleapis";
import {
  appendValues,
  CellValue,
  createSheetsClient,
  getValues,
  updateValues,
  Values,
} from "./sheets.js";
import {
  fillSpendings,
  parseCategorySpendings,
  validateYearMonth,
  type SpendingProfile,
} from "./spendings.js";

type ParsedArguments =
  | { command: "get"; spreadsheetId?: string; range: string }
  | { command: "update" | "append"; spreadsheetId?: string; range: string; rawValues: string }
  | {
      command: "fill-spendings";
      spreadsheetId?: string;
      yearMonth: string;
      rawSpendingInput: string;
      profile: SpendingProfile;
    };

interface CliDependencies {
  createSheetsClient?: () => Promise<sheets_v4.Sheets>;
  readStdin?: () => Promise<string>;
  writeStdout?: (value: string) => void;
  workingDirectory?: string;
}

function usage(): string {
  return `Usage:
  rmz-sheets get [SPREADSHEET_ID] RANGE
  rmz-sheets update [SPREADSHEET_ID] RANGE --values JSON
  rmz-sheets append [SPREADSHEET_ID] RANGE --values JSON
  rmz-sheets fill-spendings YYYY-MM --spending-input JSON|FILE|-
    [--profile N|Z] [--spreadsheet-id ID]

Pass --values - to read a JSON array of rows from standard input.
For fill-spendings, --spending-input accepts JSON text, a JSON file path, or - for standard input.
For get/update/append, if SPREADSHEET_ID is omitted, set GOOGLE_SHEETS_SPREADSHEET_ID in .env or enter it when prompted.
For fill-spendings, if --spreadsheet-id is omitted, set GOOGLE_SHEETS_SPREADSHEET_ID in .env.`;
}

function parseSpendingArguments(args: string[]): ParsedArguments {
  let yearMonth: string | undefined;
  let rawSpendingInput: string | undefined;
  let spreadsheetId: string | undefined;
  let profile: SpendingProfile = "Z";
  const seenOptions = new Set<string>();

  for (let index = 0; index < args.length;) {
    const argument = args[index] ?? "";
    if (
      argument === "--spending-input" ||
      argument === "--profile" ||
      argument === "--spreadsheet-id"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`);
      }
      if (seenOptions.has(argument)) {
        throw new Error(`Duplicate option: ${argument}`);
      }
      seenOptions.add(argument);
      if (argument === "--spending-input") rawSpendingInput = value;
      if (argument === "--spreadsheet-id") spreadsheetId = value;
      if (argument === "--profile") {
        if (value !== "N" && value !== "Z") {
          throw new Error("--profile must be N or Z");
        }
        profile = value;
      }
      index += 2;
    } else if (!argument.startsWith("--") && yearMonth === undefined) {
      yearMonth = argument;
      index += 1;
    } else {
      throw new Error(`Unknown option or unexpected argument: ${argument}`);
    }
  }

  if (yearMonth === undefined) throw new Error("year-month is required");
  const month = validateYearMonth(yearMonth);
  if (rawSpendingInput === undefined) throw new Error("--spending-input is required");
  return {
    command: "fill-spendings",
    spreadsheetId,
    yearMonth: month,
    rawSpendingInput,
    profile,
  };
}

export function parseArguments(args: string[]): ParsedArguments {
  const [command, ...commandArgs] = args;
  if (command === "fill-spendings") return parseSpendingArguments(commandArgs);
  if (
    command !== "get" &&
    command !== "update" &&
    command !== "append"
  ) {
    throw new Error(usage());
  }

  let spreadsheetId: string | undefined;
  let range: string;
  let options: string[];
  const commandHasSpreadsheetId =
    command === "get" ? commandArgs.length === 2 : commandArgs.length === 4;
  const argumentCountWithoutSpreadsheetId = command === "get" ? 1 : 3;

  if (commandArgs.length === argumentCountWithoutSpreadsheetId) {
    range = commandArgs[0] ?? "";
    options = commandArgs.slice(1);
  } else if (commandHasSpreadsheetId) {
    spreadsheetId = commandArgs[0];
    range = commandArgs[1] ?? "";
    options = commandArgs.slice(2);
  } else {
    throw new Error(usage());
  }

  if (!range) throw new Error(usage());

  if (command === "get") {
    if (options.length !== 0) throw new Error(usage());
    return { command, spreadsheetId, range };
  }

  if (options.length !== 2 || options[0] !== "--values" || !options[1]) {
    throw new Error(usage());
  }
  return { command, spreadsheetId, range, rawValues: options[1] };
}

function isCellValue(value: unknown): value is CellValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function parseValues(value: unknown): Values {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      (row) =>
        Array.isArray(row) &&
        row.length > 0 &&
        row.every(isCellValue),
    )
  ) {
    throw new Error("values must be a non-empty JSON array of non-empty rows with scalar cells");
  }
  return value;
}

export async function resolveSpreadsheetId(
  explicitSpreadsheetId?: string,
  workingDirectory = process.cwd(),
  allowPrompt = true,
): Promise<string> {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()) {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  }
  const envPath = resolve(workingDirectory, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);

  let spreadsheetId = explicitSpreadsheetId?.trim() ?? "";
  if (!spreadsheetId) {
    spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";
  }
  if (!spreadsheetId && allowPrompt) {
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
      spreadsheetId = (await prompt.question("Spreadsheet ID: ")).trim();
    } finally {
      prompt.close();
    }
  }
  if (!spreadsheetId) {
    const detail = allowPrompt
      ? ""
      : " Set GOOGLE_SHEETS_SPREADSHEET_ID in .env or pass --spreadsheet-id.";
    throw new Error(`Spreadsheet ID is required.${detail}`);
  }
  return spreadsheetId;
}

async function readStandardInput(): Promise<string> {
  return new Promise<string>((resolveInput, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolveInput(input));
    process.stdin.on("error", reject);
  });
}

export async function readSpendingInput(
  rawInput: string,
  readStdin: () => Promise<string> = readStandardInput,
): Promise<ReturnType<typeof parseCategorySpendings>> {
  let content: string;
  const trimmedInput = rawInput.trimStart();
  if (rawInput === "-") {
    content = await readStdin();
  } else if (trimmedInput.startsWith("[") || trimmedInput.startsWith("{")) {
    content = rawInput;
  } else {
    content = await readFile(rawInput, "utf8");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid spending JSON: ${detail}`);
  }
  return parseCategorySpendings(parsed);
}

async function readValues(raw: string): Promise<Values> {
  let content = raw;
  if (raw === "-") {
    content = await new Promise<string>((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk: string) => {
        input += chunk;
      });
      process.stdin.on("end", () => resolve(input));
      process.stdin.on("error", reject);
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON values: ${detail}`);
  }
  return parseValues(parsed);
}

export async function run(
  args: string[],
  dependencies: CliDependencies = {},
): Promise<void> {
  const writeStdout = dependencies.writeStdout ?? ((value: string) => {
    process.stdout.write(value);
  });
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    writeStdout(`${usage()}\n`);
    return;
  }
  const parsed = parseArguments(args);
  const spreadsheetId = await resolveSpreadsheetId(
    parsed.spreadsheetId,
    dependencies.workingDirectory ?? process.cwd(),
    parsed.command !== "fill-spendings",
  );
  let result: unknown;

  if (parsed.command === "get") {
    const sheets = await (dependencies.createSheetsClient ?? createSheetsClient)();
    result = await getValues(sheets, spreadsheetId, parsed.range);
  } else if (parsed.command === "fill-spendings") {
    const spendings = await readSpendingInput(parsed.rawSpendingInput, dependencies.readStdin);
    const sheets = await (dependencies.createSheetsClient ?? createSheetsClient)();
    result = await fillSpendings(
      sheets,
      spreadsheetId,
      parsed.yearMonth,
      parsed.profile,
      spendings,
    );
  } else {
    const values = await readValues(parsed.rawValues!);
    const sheets = await (dependencies.createSheetsClient ?? createSheetsClient)();
    result =
      parsed.command === "update"
        ? await updateValues(sheets, spreadsheetId, parsed.range, values)
        : await appendValues(sheets, spreadsheetId, parsed.range, values);
  }

  writeStdout(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
