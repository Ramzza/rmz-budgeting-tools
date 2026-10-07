#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  appendValues,
  CellValue,
  createSheetsClient,
  getValues,
  updateValues,
  Values,
} from "./sheets.js";

type Command = "get" | "update" | "append";

function usage(): string {
  return `Usage:
  rmz-sheets get SPREADSHEET_ID RANGE
  rmz-sheets update SPREADSHEET_ID RANGE --values JSON
  rmz-sheets append SPREADSHEET_ID RANGE --values JSON

Pass --values - to read a JSON array of rows from standard input.`;
}

function parseArguments(args: string[]): {
  command: Command;
  spreadsheetId: string;
  range: string;
  rawValues?: string;
} {
  const [command, spreadsheetId, range, ...options] = args;
  if (
    (command !== "get" && command !== "update" && command !== "append") ||
    !spreadsheetId ||
    !range
  ) {
    throw new Error(usage());
  }

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

export async function run(args: string[]): Promise<void> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const parsed = parseArguments(args);
  const sheets = await createSheetsClient();
  let result: unknown;

  if (parsed.command === "get") {
    result = await getValues(sheets, parsed.spreadsheetId, parsed.range);
  } else {
    const values = await readValues(parsed.rawValues!);
    result =
      parsed.command === "update"
        ? await updateValues(sheets, parsed.spreadsheetId, parsed.range, values)
        : await appendValues(sheets, parsed.spreadsheetId, parsed.range, values);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
