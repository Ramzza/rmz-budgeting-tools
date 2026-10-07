import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/resources/{arg}{ext}",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  updateSnapshots: "none",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
      threshold: 0.15,
      animations: "disabled",
    },
  },
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1900, height: 910 },
    deviceScaleFactor: 1,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light",
    reducedMotion: "reduce",
  },
});
