#!/usr/bin/env node
import { chromium } from "playwright";
import {
  captureCategoryBreakdown,
  clickAnalytics,
  clickLoginControl,
  clickSeeAll,
  clickSpent,
  closeBrowserIfOpen,
  createBrowserPage,
  launchVisibleBrowser,
  navigateToRevolut,
  observeBrowserDisconnection,
  rejectCookiesIfShown,
  saveCategoryBreakdown,
  selectAnalyticsMonth,
  waitForBrowserToClose,
  waitForManualSignIn,
} from "./browser-login-flow.js";
import { parseAnalyticsMonth } from "./browser-login-month.js";
import type { AnalyticsMonth } from "./browser-login-month.js";
import type { BrowserAutomation, BrowserProgressLogger } from "./browser-login-flow.js";

export type { AnalyticsMonth } from "./browser-login-month.js";
export type { BrowserAutomation, BrowserProgressLogger } from "./browser-login-flow.js";

function defaultProgressLogger(message: string): void {
  console.error(`[browser-login] ${message}`);
}

export async function runBrowserLogin(
  automation: BrowserAutomation = chromium,
  progress: BrowserProgressLogger = defaultProgressLogger,
  month: AnalyticsMonth = parseAnalyticsMonth("current"),
): Promise<void> {
  const browser = await launchVisibleBrowser(automation, progress);
  let browserDisconnected = false;
  try {
    const browserClosed = observeBrowserDisconnection(browser, () => {
      browserDisconnected = true;
    });
    const page = await createBrowserPage(browser, progress);
    await navigateToRevolut(page, progress);
    await clickLoginControl(page, progress);
    await waitForManualSignIn(page, progress);
    await rejectCookiesIfShown(page, progress);
    await clickAnalytics(page, progress);
    await selectAnalyticsMonth(page, month, progress);
    await clickSpent(page, progress);
    await clickSeeAll(page, progress);
    const categoryHtml = await captureCategoryBreakdown(page, progress);
    await saveCategoryBreakdown(categoryHtml, month, progress);
    await waitForBrowserToClose(browserClosed, progress);
  } finally {
    await closeBrowserIfOpen(browser, browserDisconnected, progress);
  }
}
