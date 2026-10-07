import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runBrowserLogin } from "../src/browser-login.js";
import type { BrowserAutomation } from "../src/browser-login.js";
import { run } from "../src/cli.js";

const categoryHtml = `<div data-rui="group"><button data-event-key="action.analytics.transaction-breakdown.click">Groceries 2 transactions -RON&nbsp;1,234.50</button></div>`;

async function withTemporaryWorkingDirectory(
  action: (directory: string) => Promise<void>,
): Promise<void> {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), "rmz-browser-login-test-"));
  process.chdir(directory);
  try {
    await action(directory);
  } finally {
    process.chdir(originalDirectory);
    await rm(directory, { recursive: true, force: true });
  }
}

function createAutomation(options: {
  response?: { ok(): boolean; status(): number } | null;
  navigationError?: Error;
  loginError?: Error;
  spentClickError?: Error;
  launchError?: Error;
  cookiesVisible?: boolean;
  categoryHtml?: string;
  monthLabel?: string;
  monthLabelVisibleBeforeNavigation?: boolean;
} = {}): {
  automation: BrowserAutomation;
  calls: string[];
  clicks: string[];
  timeoutCalls: Array<{ operation: string; timeout: number | undefined }>;
  waitCalls: string[];
  categoryCapture: Promise<void>;
  closeBrowser(): void;
} {
  const calls: string[] = [];
  const clicks: string[] = [];
  const timeoutCalls: Array<{ operation: string; timeout: number | undefined }> = [];
  const waitCalls: string[] = [];
  let previousMonthClicks = 0;
  let onBrowserDisconnected: (() => void) | undefined;
  let resolveCategoryCapture: (() => void) | undefined;
  const categoryCapture = new Promise<void>((resolve) => {
    resolveCategoryCapture = resolve;
  });
  const closeBrowser = () => {
    onBrowserDisconnected?.();
  };
  const locator = (name: RegExp | string) => {
    let selectedLast = false;
    return {
      or() {
        calls.push("locator.or");
        return this;
      },
      first() {
        calls.push("locator.first");
        return this;
      },
      last() {
        calls.push("locator.last");
        selectedLast = true;
        return this;
      },
      locator(selector: string) {
        calls.push(`locator.locator:${selector}`);
        return locator(`${String(name)} >> ${selector}`);
      },
      filter({ visible }: { visible: boolean }) {
        calls.push(`locator.filter:${visible}`);
        return this;
      },
      async isVisible() {
        calls.push("locator.isVisible");
        if (name instanceof RegExp && name.test("Reject cookies")) {
          return options.cookiesVisible ?? true;
        }
        if (name === "This month") return previousMonthClicks === 0;
        if (name === options.monthLabel) {
          return options.monthLabelVisibleBeforeNavigation ?? previousMonthClicks > 0;
        }
        return options.cookiesVisible ?? true;
      },
      async waitFor({ state, timeout }: { state: "visible"; timeout: number }) {
        waitCalls.push(`${state}:${timeout}`);
      },
      async click({ timeout }: { timeout?: number } = {}) {
        calls.push("locator.click");
        clicks.push(`${String(name)}${selectedLast ? ":last" : ""}`);
        timeoutCalls.push({ operation: "locator.click", timeout });
        if (
          typeof name === "string" &&
          name.endsWith(" >> xpath=preceding::button[1]")
        ) {
          previousMonthClicks += 1;
        }
        if (name instanceof RegExp && name.test("Log in") && options.loginError) {
          throw options.loginError;
        }
        if (
          (name === "Spent" || (name instanceof RegExp && name.test("Spent"))) &&
          options.spentClickError
        ) {
          throw options.spentClickError;
        }
      },
      async evaluate<TResult>(
        pageFunction: (element: { outerHTML: string }) => TResult,
      ): Promise<TResult> {
        resolveCategoryCapture?.();
        return pageFunction({ outerHTML: options.categoryHtml ?? categoryHtml });
      },
    };
  };
  const page = {
    async goto(
      url: string,
      { waitUntil, timeout }: { waitUntil: "domcontentloaded"; timeout?: number },
    ) {
      calls.push(`page.goto:${url}:${waitUntil}`);
      timeoutCalls.push({ operation: "page.goto", timeout });
      if (options.navigationError) throw options.navigationError;
      return options.response === undefined
        ? { ok: () => true, status: () => 200 }
        : options.response;
    },
    getByRole(role: "link" | "button", { name }: { name: RegExp }) {
      calls.push(`page.getByRole:${role}:${name}`);
      return locator(name);
    },
    getByText(text: string, { exact }: { exact: boolean }) {
      calls.push(`page.getByText:${text}:${exact}`);
      return locator(text);
    },
    locator(selector: string) {
      calls.push(`page.locator:${selector}`);
      return locator(selector);
    },
  };
  const browser = {
    async newPage(options?: { viewport: { width: number; height: number } }) {
      calls.push(`browser.newPage:${options?.viewport.width}x${options?.viewport.height}`);
      return page;
    },
    async close() {
      calls.push("browser.close");
      closeBrowser();
    },
    once(event: "disconnected", listener: () => void) {
      calls.push(`browser.once:${event}`);
      onBrowserDisconnected = listener;
    },
  };
  const automation: BrowserAutomation = {
    async launch({ headless, timeout }: { headless: false; timeout?: number }) {
      calls.push(`chromium.launch:${headless}`);
      timeoutCalls.push({ operation: "chromium.launch", timeout });
      if (options.launchError) throw options.launchError;
      return browser;
    },
  };
  return { automation, calls, clicks, timeoutCalls, waitCalls, categoryCapture, closeBrowser };
}

test("PRD-006: targets Spent with exact visible text", async () => {
  await withTemporaryWorkingDirectory(async () => {
    const { automation, calls, closeBrowser, categoryCapture } = createAutomation();
    const running = runBrowserLogin(automation, () => {});
    await categoryCapture;
    closeBrowser();
    await running;

    assert.ok(calls.includes("page.getByText:Spent:true"));
    assert.ok(calls.includes("locator.filter:true"));
  });
});

test("PRD-006: clicks the previous-period button beside the visible month label", async () => {
  await withTemporaryWorkingDirectory(async () => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const monthLabel = (date: Date) => {
      const label = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
      return date.getFullYear() === now.getFullYear()
        ? label
        : `${label} ${date.getFullYear()}`;
    };
    const selection = {
      year: targetMonth.getFullYear(),
      month: targetMonth.getMonth() + 1,
      label: monthLabel(targetMonth),
      monthsBack: 2,
    };
    const { automation, clicks, closeBrowser, categoryCapture } = createAutomation({
      monthLabel: selection.label,
      monthLabelVisibleBeforeNavigation: true,
    });
    const running = runBrowserLogin(automation, () => {}, selection);
    await categoryCapture;
    closeBrowser();
    await running;

    assert.deepEqual(
      clicks.filter((click) => click.endsWith(" >> xpath=preceding::button[1]")),
      [
        "This month >> xpath=preceding::button[1]",
        `${monthLabel(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} >> xpath=preceding::button[1]`,
      ],
    );
  });
});

test("PRD-006: reports which browser step failed", async () => {
  const failure = new Error("Spent control did not receive a click");
  const { automation, calls } = createAutomation({ spentClickError: failure });
  const progress: string[] = [];

  await assert.rejects(
    runBrowserLogin(automation, (message) => progress.push(message)),
    failure,
  );
  assert.ok(progress.includes(`Failed: Click Spent: ${failure.message}`));
  assert.equal(calls.at(-1), "browser.close");
});

test("PRD-006: keeps Chromium open through category capture until the user closes it", async () => {
  await withTemporaryWorkingDirectory(async (directory) => {
    const now = new Date();
    const selection = {
      year: now.getFullYear() - 1,
      month: 9,
      label: `Sep ${now.getFullYear() - 1}`,
      monthsBack: 12 + now.getMonth() - 8,
    };
    const { automation, calls, clicks, closeBrowser, categoryCapture, waitCalls } = createAutomation({
      monthLabel: selection.label,
      monthLabelVisibleBeforeNavigation: true,
    });
    const progress: string[] = [];

    let returned = false;
    const running = runBrowserLogin(
      automation,
      (message) => progress.push(message),
      selection,
    ).then(() => {
      returned = true;
    });
    await categoryCapture;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(returned, false);
    const callsBeforeBrowserClose = [...calls];
    closeBrowser();
    await running;

    const stepsBeforeMonthSelection = [
      "Launch visible Chromium",
      "Open browser page at 1860 x 1000",
      "Navigate to https://revolut.com",
      "Click Login",
      "Wait for Analytics after manual sign-in",
      "Check for cookie rejection prompt",
      "Reject cookies",
      "Click Analytics",
    ];
    const monthSelectionStep = `Select Analytics month: ${selection.label}`;
    const arrowClickLabels = Array.from(
      { length: selection.monthsBack },
      (_, index) => {
        const period = new Date(
          selection.year,
          selection.month - 1 + selection.monthsBack - index,
          1,
        );
        const monthName = new Intl.DateTimeFormat("en-US", { month: "short" }).format(period);
        let label = monthName;
        if (index === 0) {
          label = "This month";
        } else if (period.getFullYear() !== now.getFullYear()) {
          label = `${monthName} ${period.getFullYear()}`;
        }
        return label;
      },
    );
    const arrowSteps = Array.from(
      { length: selection.monthsBack },
      () => "Click Analytics left arrow",
    );
    const stepsAfterMonthSelection = [
      "Click Spent",
      "Click See all",
      "Wait for category breakdown",
      "Read category container HTML",
      "Validate category breakdown",
      "Create output directory",
      `Save category breakdown to output/spending-${selection.year}-09.html`,
      "Wait for browser to close",
    ];
    const expectedStartingSteps = [
      ...stepsBeforeMonthSelection,
      monthSelectionStep,
      ...arrowSteps,
      ...stepsAfterMonthSelection,
    ];
    const expectedCompletedSteps = [
      ...stepsBeforeMonthSelection,
      ...arrowSteps,
      monthSelectionStep,
      ...stepsAfterMonthSelection,
    ];
    assert.deepEqual(
      progress.filter((message) => message.startsWith("Starting:")),
      expectedStartingSteps.map((step) => `Starting: ${step}`),
    );
    assert.deepEqual(
      progress.filter((message) => message.startsWith("Completed:")),
      expectedCompletedSteps.map((step) => `Completed: ${step}`),
    );
    assert.ok(progress.includes("Starting: Click Spent"));
    assert.ok(progress.includes("Completed: Click Spent"));
    assert.ok(calls.includes("page.getByText:Spent:true"));
    assert.equal(callsBeforeBrowserClose[0], "chromium.launch:false");
    assert.equal(callsBeforeBrowserClose.includes("browser.newPage:1860x1000"), true);
    assert.deepEqual(clicks, [
      "/^log\\s*in$/i",
      "/reject/i",
      "/^analytics$/i",
      ...arrowClickLabels.map((label) => `${label} >> xpath=preceding::button[1]`),
      "Spent",
      "/^see all$/i:last",
    ]);
    assert.deepEqual(waitCalls, ["visible:0", `visible:${5 * 60 * 1000}`]);
    assert.equal(calls.includes("browser.close"), false);

    const outputPath = join(directory, "output", `spending-${selection.year}-09.html`);
    assert.deepEqual(await readdir(join(directory, "output")), [`spending-${selection.year}-09.html`]);
    const savedHtml = await readFile(outputPath, "utf8");
    assert.equal(savedHtml, categoryHtml);
    assert.deepEqual(
      JSON.parse(await run(["categories", outputPath])),
      [{ category: "Groceries", ron: 1234.5 }],
    );
  });
});

test("PRD-006: browser-login keeps its orchestration entry point under 100 lines", async () => {
  const source = await readFile(new URL("../src/browser-login.ts", import.meta.url), "utf8");
  assert.ok(source.trimEnd().split("\n").length <= 100);
});

test("PRD-006: continues when the cookie rejection control is not shown", async () => {
  await withTemporaryWorkingDirectory(async () => {
    const { automation, clicks, closeBrowser, categoryCapture } = createAutomation({
      cookiesVisible: false,
    });
    const running = runBrowserLogin(automation, () => {});
    await categoryCapture;
    closeBrowser();
    await running;

    assert.equal(clicks.includes("/reject/i"), false);
    assert.equal(clicks.includes("/^analytics$/i"), true);
  });
});

test("PRD-006: rejects a category container the categories command cannot parse", async () => {
  await withTemporaryWorkingDirectory(async () => {
    const { automation, calls } = createAutomation({
      categoryHtml: '<div data-rui="group"><button data-event-key="action.analytics.transaction-breakdown.click">No totals</button></div>',
    });

    await assert.rejects(
      runBrowserLogin(automation, () => {}),
      /Could not parse a category breakdown row/,
    );
    assert.equal(calls.at(-1), "browser.close");
  });
});

test("PRD-006: applies a five-minute timeout to browser operations", async () => {
  await withTemporaryWorkingDirectory(async () => {
    const { automation, timeoutCalls, closeBrowser, categoryCapture } = createAutomation();

    const running = runBrowserLogin(automation, () => {});
    await categoryCapture;
    closeBrowser();
    await running;

    assert.deepEqual(timeoutCalls, [
      { operation: "chromium.launch", timeout: 5 * 60 * 1000 },
      { operation: "page.goto", timeout: 5 * 60 * 1000 },
      ...Array.from({ length: 5 }, () => ({
        operation: "locator.click",
        timeout: 5 * 60 * 1000,
      })),
    ]);
  });
});

test("PRD-006: reports HTTP failures and closes the browser", async () => {
  const { automation, calls } = createAutomation({
    response: { ok: () => false, status: () => 503 },
  });

  await assert.rejects(
    runBrowserLogin(automation, () => {}),
    /Could not open https:\/\/revolut\.com \(HTTP 503\)/,
  );
  assert.equal(calls.at(-1), "browser.close");
});

test("PRD-006: reports a missing HTTP response and closes the browser", async () => {
  const { automation, calls } = createAutomation({ response: null });

  await assert.rejects(runBrowserLogin(automation, () => {}), /Could not open https:\/\/revolut\.com$/);
  assert.equal(calls.at(-1), "browser.close");
});

test("PRD-006: reports navigation failures and closes the browser", async () => {
  const failure = new Error("network unavailable");
  const { automation, calls } = createAutomation({ navigationError: failure });

  await assert.rejects(runBrowserLogin(automation, () => {}), failure);
  assert.equal(calls.at(-1), "browser.close");
});

test("PRD-006: reports Login locator failures and closes the browser", async () => {
  const failure = new Error("Login control is unavailable");
  const { automation, calls } = createAutomation({ loginError: failure });

  await assert.rejects(runBrowserLogin(automation, () => {}), failure);
  assert.equal(calls.at(-1), "browser.close");
});

test("PRD-006: reports Chromium launch failures", async () => {
  const failure = new Error("Chromium could not launch");
  const { automation, calls } = createAutomation({ launchError: failure });
  const progress: string[] = [];
  const originalConsoleError = console.error;
  console.error = (message?: unknown) => progress.push(String(message));

  try {
    await assert.rejects(runBrowserLogin(automation), failure);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(progress, [
    "[browser-login] Starting: Launch visible Chromium",
    `[browser-login] Failed: Launch visible Chromium: ${failure.message}`,
  ]);
  assert.deepEqual(calls, ["chromium.launch:false"]);
});
