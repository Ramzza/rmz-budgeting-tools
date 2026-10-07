import { expect, test } from "@playwright/test";

test("PRD-007: compares the public homepage with the reviewed screenshot", async ({ page }) => {
  const response = await page.goto("https://revolut.com", { waitUntil: "domcontentloaded" });
  expect(
    response?.ok(),
    `Expected a successful homepage response, received HTTP ${response?.status() ?? "no response"}`,
  ).toBe(true);

  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, async (image) => {
        image.loading = "eager";
        await image.decode();
      }),
    );
  });

  await expect(page).toHaveScreenshot("01-revolut-homepage.png");
});
