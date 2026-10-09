#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runBrowserLogin } from "./browser-login.js";
import { parseAnalyticsMonth } from "./browser-login-month.js";
import { serializeCsv } from "./csv.js";
import { getSpending, parseRevolutCsv, summarizeSpending } from "./revolut.js";
import { parseCategoryBreakdownHtml } from "./spending-html.js";
import type { AnalyticsMonth } from "./browser-login-month.js";
import type { SpendingSummary, Transaction } from "./revolut.js";
import type { CategorySpend } from "./spending-html.js";

type OutputFormat = "json" | "csv";

function parseDateOption(value: string, option: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${option} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${option} must be a valid calendar date`);
  }
  return value;
}

export async function run(
  args: readonly string[],
  browserLogin: (month: AnalyticsMonth) => Promise<void> = (month) =>
    runBrowserLogin(undefined, undefined, month),
): Promise<string> {
  const [command, file, ...options] = args;
  let output: string;

  if (command === "browser-login") {
    if (args.length > 2) {
      throw new Error("Usage: rmz-revolut-spending browser-login [last|current|YYYY-mon]");
    }
    await browserLogin(parseAnalyticsMonth(args[1] ?? "current"));
    output = "Browser session closed.";
  } else {
    if (!command || !file || !["transactions", "summary", "categories"].includes(command)) {
      throw new Error("Usage: rmz-revolut-spending <transactions|summary> <statement.csv> [--from DATE] [--to DATE] [--format json|csv] | rmz-revolut-spending categories <spending.html> [--format json|csv] [--output FILE] | rmz-revolut-spending browser-login [last|current|YYYY-mon]");
    }

    let from: string | undefined;
    let to: string | undefined;
    let format: OutputFormat = "json";
    let outputFile: string | undefined;
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const value = options[index + 1];
      if (option === "--from" || option === "--to" || option === "--format" || option === "--output") {
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
        if (option === "--from") from = parseDateOption(value, option);
        if (option === "--to") to = parseDateOption(value, option);
        if (option === "--format") {
          if (value !== "json" && value !== "csv") throw new Error("--format must be json or csv");
          format = value;
        }
        if (option === "--output") outputFile = value;
        index += 1;
      } else {
        throw new Error(`Unknown option: ${option}`);
      }
    }
    if (from && to && from > to) throw new Error("--from must be on or before --to");
    if (outputFile && command !== "categories") {
      throw new Error("--output is only supported for categories");
    }

    if (command === "categories") {
      if (from || to) {
        throw new Error("--from and --to are only supported for transactions and summary");
      }
      const categories = parseCategoryBreakdownHtml(await readFile(file, "utf8"));
      if (format === "json") {
        output = JSON.stringify(categories, null, 2);
      } else {
        output = serializeCsv(
          ["category", "ron"],
          categories.map((category: CategorySpend) => [category.category, category.ron]),
        );
      }
      if (outputFile) {
        await writeFile(outputFile, `${output}\n`, "utf8");
        output = "";
      }
    } else {
      const transactions = getSpending(
        parseRevolutCsv(await readFile(file, "utf8")),
        from,
        to,
      );
      if (command === "summary") {
        const summaries = summarizeSpending(transactions);
        if (format === "json") {
          output = JSON.stringify(summaries, null, 2);
        } else {
          output = serializeCsv(
            ["currency", "transactionCount", "totalSpent"],
            summaries.map((summary: SpendingSummary) => [
              summary.currency,
              summary.transactionCount,
              summary.totalSpent,
            ]),
          );
        }
      } else if (format === "json") {
        output = JSON.stringify(transactions, null, 2);
      } else {
        output = serializeCsv(
          ["date", "description", "amount", "currency", "category", "type"],
          transactions.map((transaction: Transaction) => [
            transaction.date,
            transaction.description,
            transaction.amount,
            transaction.currency,
            transaction.category,
            transaction.type,
          ]),
        );
      }
    }
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const output = await run(process.argv.slice(2));
    if (output !== "") process.stdout.write(`${output}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`rmz-revolut-spending: error: ${message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
