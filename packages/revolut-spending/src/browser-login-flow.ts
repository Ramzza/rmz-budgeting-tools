import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCategoryBreakdownHtml } from "./spending-html.js";
import type { AnalyticsMonth } from "./browser-login-month.js";

const REVOLUT_URL = "https://revolut.com";
const LOGIN_NAME = /^log\s*in$/i;
const REJECT_COOKIES_NAME = /reject/i;
const ANALYTICS_NAME = /^analytics$/i;
const SEE_ALL_NAME = /^see all$/i;
const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const BROWSER_VIEWPORT = { width: 1860, height: 1000 };
const CATEGORY_GROUP_SELECTOR =
  'div[data-rui="group"]:has(> button[data-event-key="action.analytics.transaction-breakdown.click"])';

interface BrowserResponse {
  ok(): boolean;
  status(): number;
}

interface BrowserLocator {
  or(locator: BrowserLocator): BrowserLocator;
  first(): BrowserLocator;
  last(): BrowserLocator;
  filter(options: { visible: boolean }): BrowserLocator;
  isVisible(): Promise<boolean>;
  waitFor(options: { state: "visible"; timeout: number }): Promise<void>;
  click(options: { timeout: number }): Promise<void>;
  locator(selector: string): BrowserLocator;
  evaluate(pageFunction: (element: { outerHTML: string }) => string): Promise<string>;
}

interface BrowserPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<BrowserResponse | null>;
  getByRole(role: "link" | "button", options: { name: RegExp }): BrowserLocator;
  getByText(text: string, options: { exact: boolean }): BrowserLocator;
  locator(selector: string): BrowserLocator;
}

interface BrowserSession {
  newPage(options: { viewport: { width: number; height: number } }): Promise<BrowserPage>;
  once(event: "disconnected", listener: () => void): void;
  close(): Promise<void>;
}

export interface BrowserAutomation {
  launch(options: { headless: false; timeout: number }): Promise<BrowserSession>;
}

export type BrowserProgressLogger = (message: string) => void;

export async function runBrowserStep<T>(
  name: string,
  action: () => Promise<T>,
  progress: BrowserProgressLogger,
): Promise<T> {
  progress(`Starting: ${name}`);
  try {
    const result = await action();
    progress(`Completed: ${name}`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    progress(`Failed: ${name}: ${detail}`);
    throw error;
  }
}

function roleControl(page: BrowserPage, name: RegExp): BrowserLocator {
  return page.getByRole("link", { name }).or(page.getByRole("button", { name })).first();
}

export function observeBrowserDisconnection(
  browser: BrowserSession,
  onDisconnect: () => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    browser.once("disconnected", () => {
      onDisconnect();
      resolve();
    });
  });
}

export function launchVisibleBrowser(
  automation: BrowserAutomation,
  progress: BrowserProgressLogger,
): Promise<BrowserSession> {
  return runBrowserStep(
    "Launch visible Chromium",
    () => automation.launch({ headless: false, timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
}

export function createBrowserPage(
  browser: BrowserSession,
  progress: BrowserProgressLogger,
): Promise<BrowserPage> {
  return runBrowserStep(
    `Open browser page at ${BROWSER_VIEWPORT.width} x ${BROWSER_VIEWPORT.height}`,
    () => browser.newPage({ viewport: BROWSER_VIEWPORT }),
    progress,
  );
}

export function navigateToRevolut(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  return runBrowserStep("Navigate to https://revolut.com", async () => {
    const response = await page.goto(REVOLUT_URL, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_LOGIN_TIMEOUT_MS,
    });
    if (!response?.ok()) {
      const status = response ? ` (HTTP ${response.status()})` : "";
      throw new Error(`Could not open ${REVOLUT_URL}${status}`);
    }
    progress(`Loaded ${REVOLUT_URL} (HTTP ${response.status()}).`);
  }, progress);
}

export function clickLoginControl(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  return runBrowserStep(
    "Click Login",
    () => roleControl(page, LOGIN_NAME).click({ timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
}

export async function waitForManualSignIn(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  progress("Waiting for manual sign-in; credentials are not read by this CLI.");
  await runBrowserStep(
    "Wait for Analytics after manual sign-in",
    () => roleControl(page, ANALYTICS_NAME).waitFor({ state: "visible", timeout: 0 }),
    progress,
  );
}

export async function rejectCookiesIfShown(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  const rejectCookies = page.getByRole("button", { name: REJECT_COOKIES_NAME }).first();
  const cookiesVisible = await runBrowserStep(
    "Check for cookie rejection prompt",
    () => rejectCookies.isVisible(),
    progress,
  );
  if (cookiesVisible) {
    await runBrowserStep(
      "Reject cookies",
      () => rejectCookies.click({ timeout: BROWSER_LOGIN_TIMEOUT_MS }),
      progress,
    );
  } else {
    progress("No cookie rejection prompt was shown.");
  }
}

export function clickAnalytics(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  return runBrowserStep(
    "Click Analytics",
    () => roleControl(page, ANALYTICS_NAME).click({ timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
}

export function selectAnalyticsMonth(
  page: BrowserPage,
  month: AnalyticsMonth,
  progress: BrowserProgressLogger,
): Promise<void> {
  return runBrowserStep(`Select Analytics month: ${month.label}`, async () => {
    const currentPeriod = new Date(month.year, month.month - 1 + month.monthsBack, 1);
    let selectedPeriod = currentPeriod;
    let monthsBack = 0;
    while (monthsBack < month.monthsBack) {
      const periodLabel = analyticsPeriodLabel(selectedPeriod, currentPeriod);
      await clickAnalyticsLeftArrow(page, periodLabel, progress);
      selectedPeriod = new Date(selectedPeriod.getFullYear(), selectedPeriod.getMonth() - 1, 1);
      monthsBack += 1;
    }
    const monthLabel = page.getByText(month.label, { exact: true }).filter({ visible: true }).first();
    if (!(await monthLabel.isVisible())) {
      throw new Error(`Could not select Analytics month ${month.label}`);
    }
  }, progress);
}

function analyticsPeriodLabel(period: Date, currentPeriod: Date): string {
  const monthName = new Intl.DateTimeFormat("en-US", { month: "short" }).format(period);
  let label = monthName;
  if (
    period.getFullYear() === currentPeriod.getFullYear() &&
    period.getMonth() === currentPeriod.getMonth()
  ) {
    label = "This month";
  } else if (period.getFullYear() !== currentPeriod.getFullYear()) {
    label = `${monthName} ${period.getFullYear()}`;
  }
  return label;
}

function clickAnalyticsLeftArrow(
  page: BrowserPage,
  periodLabel: string,
  progress: BrowserProgressLogger,
): Promise<void> {
  return runBrowserStep(
    "Click Analytics left arrow",
    () => page
      .getByText(periodLabel, { exact: true })
      .filter({ visible: true })
      .first()
      .locator("xpath=preceding::button[1]")
      .click({ timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
}

export function clickSpent(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  const spentControl = page.getByText("Spent", { exact: true }).filter({ visible: true }).first();
  return runBrowserStep(
    "Click Spent",
    () => spentControl.click({ timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
}

export function clickSeeAll(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<void> {
  const seeAllControl = page
    .getByRole("link", { name: SEE_ALL_NAME })
    .or(page.getByRole("button", { name: SEE_ALL_NAME }))
    .last();
  return runBrowserStep(
    "Click See all",
    () => seeAllControl.click({ timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
}

export async function captureCategoryBreakdown(
  page: BrowserPage,
  progress: BrowserProgressLogger,
): Promise<string> {
  const categoryGroup = page.locator(CATEGORY_GROUP_SELECTOR).last();
  await runBrowserStep(
    "Wait for category breakdown",
    () => categoryGroup.waitFor({ state: "visible", timeout: BROWSER_LOGIN_TIMEOUT_MS }),
    progress,
  );
  const categoryHtml = await runBrowserStep(
    "Read category container HTML",
    () => categoryGroup.evaluate((element) => element.outerHTML),
    progress,
  );
  await runBrowserStep("Validate category breakdown", async () => {
    parseCategoryBreakdownHtml(categoryHtml);
  }, progress);
  return categoryHtml;
}

export async function saveCategoryBreakdown(
  html: string,
  month: AnalyticsMonth,
  progress: BrowserProgressLogger,
): Promise<void> {
  const outputDirectory = "output";
  await runBrowserStep(
    "Create output directory",
    () => mkdir(outputDirectory, { recursive: true }),
    progress,
  );
  const monthText = String(month.month).padStart(2, "0");
  const outputPath = join(outputDirectory, `spending-${month.year}-${monthText}.html`);
  await runBrowserStep(
    `Save category breakdown to ${outputPath}`,
    () => writeFile(outputPath, html, "utf8"),
    progress,
  );
}

export function waitForBrowserToClose(
  browserClosed: Promise<void>,
  progress: BrowserProgressLogger,
): Promise<void> {
  return runBrowserStep("Wait for browser to close", () => browserClosed, progress);
}

export function closeBrowserIfOpen(
  browser: BrowserSession,
  disconnected: boolean,
  progress: BrowserProgressLogger,
): Promise<void> | void {
  if (!disconnected) {
    return runBrowserStep("Close browser", () => browser.close(), progress);
  }
}
