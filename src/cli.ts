#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run as runSheets } from "./google-sheets/cli.js";
import { resolveSpreadsheetId } from "./google-sheets/cli.js";
import { main as runMarketData } from "./market-data/cli.js";
import { run as runRevolut } from "./revolut-spending/cli.js";
import {
  runMonthlyWorkflow,
  type MonthlyWorkflowDependencies,
  type MonthlyWorkflowResult,
} from "./monthly-workflow.js";
import { validateYearMonth } from "./google-sheets/spendings.js";

export type CliArguments =
  | { command: "help" }
  | { command: "monthly"; yearMonth: string; spreadsheetId?: string; spendingFile?: string }
  | { command: "sheets" | "market-data" | "revolut"; args: string[] };

export interface MainCliDependencies {
  workingDirectory?: string;
  writeStdout?: (value: string) => void;
  runMonthlyWorkflow?: (
    options: { yearMonth: string; spreadsheetId: string; spendingFile?: string },
    dependencies?: MonthlyWorkflowDependencies,
  ) => Promise<MonthlyWorkflowResult>;
  monthlyWorkflowDependencies?: MonthlyWorkflowDependencies;
  runSheets?: typeof runSheets;
  runMarketData?: typeof runMarketData;
  runRevolut?: typeof runRevolut;
}

function usage(): string {
  return `Usage:
  rmz-budgeting-tools [YYYY-MM] [--sheet-id ID] [--spending-file FILE]
  rmz-budgeting-tools sheets <command> [options]
  rmz-budgeting-tools market-data <command> [options]
  rmz-budgeting-tools revolut <command> [options]

The monthly workflow defaults to the previous month and reads
output/spending-YYYY-MM.html. Without --spending-file, it first opens visible
Revolut for manual sign-in and saves the requested month's category breakdown.
Use --spending-file to process saved HTML without opening a browser. The sheet
ID comes from --sheet-id or GOOGLE_SHEETS_SPREADSHEET_ID in the current
directory's .env; it identifies the spreadsheet for that year.
The month selects the two-digit MM tab.
The tab must contain the documented spending, ticker, and currency tables.
`;
}

function previousMonth(date: Date): string {
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function browserLoginMonth(yearMonth: string): string {
  const monthName = new Date(`${yearMonth}-01T00:00:00.000Z`)
    .toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${yearMonth.slice(0, 4)}-${monthName}`;
}

export function parseArguments(
  args: readonly string[],
  now: Date = new Date(),
): CliArguments {
  const first = args[0];
  if (first === "--help" || first === "-h" || first === "help") {
    return { command: "help" };
  }
  if (first === "sheets" || first === "market-data" || first === "revolut") {
    return { command: first, args: [...args.slice(1)] };
  }

  let yearMonth: string | undefined;
  let spreadsheetId: string | undefined;
  let spendingFile: string | undefined;
  const seenOptions = new Set<string>();
  for (let index = 0; index < args.length;) {
    const argument = args[index] ?? "";
    if (argument === "--sheet-id" || argument === "--spending-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`);
      }
      if (seenOptions.has(argument)) throw new Error(`Duplicate option: ${argument}`);
      seenOptions.add(argument);
      if (argument === "--sheet-id") spreadsheetId = value.trim();
      if (argument === "--spending-file") spendingFile = value;
      index += 2;
    } else if (!argument.startsWith("--") && yearMonth === undefined) {
      yearMonth = validateYearMonth(argument);
      index += 1;
    } else {
      throw new Error(`Unknown option or unexpected argument: ${argument}`);
    }
  }

  return {
    command: "monthly",
    yearMonth: yearMonth ?? previousMonth(now),
    spreadsheetId,
    spendingFile,
  };
}

export async function run(
  args: readonly string[],
  dependencies: MainCliDependencies = {},
): Promise<void> {
  const parsed = parseArguments(args);
  const writeStdout = dependencies.writeStdout ?? ((value: string) => process.stdout.write(value));
  const workingDirectory = dependencies.workingDirectory ?? process.cwd();
  if (parsed.command === "help") {
    writeStdout(usage());
  } else if (parsed.command === "monthly") {
    const spreadsheetId = await resolveSpreadsheetId(
      parsed.spreadsheetId,
      workingDirectory,
      false,
    );
    if (parsed.spendingFile === undefined) {
      const captureResult = await (dependencies.runRevolut ?? runRevolut)([
        "browser-login",
        browserLoginMonth(parsed.yearMonth),
      ]);
      if (captureResult !== "") writeStdout(`${captureResult}\n`);
    }
    const result = await (dependencies.runMonthlyWorkflow ?? runMonthlyWorkflow)(
      {
        yearMonth: parsed.yearMonth,
        spreadsheetId,
        spendingFile: parsed.spendingFile,
      },
      dependencies.monthlyWorkflowDependencies,
    );
    writeStdout(`${JSON.stringify(result, null, 2)}\n`);
  } else if (parsed.command === "sheets") {
    await (dependencies.runSheets ?? runSheets)(parsed.args, {
      workingDirectory,
      writeStdout,
    });
  } else if (parsed.command === "market-data") {
    await (dependencies.runMarketData ?? runMarketData)([
      process.execPath,
      "rmz-market-data",
      ...parsed.args,
    ]);
  } else {
    const result = await (dependencies.runRevolut ?? runRevolut)(parsed.args);
    if (result !== "") writeStdout(`${result}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`rmz-budgeting-tools: error: ${message}\n`);
    process.exitCode = 1;
  });
}
