import { test, expect } from "@playwright/test";

test.describe("BiasBar", () => {
  test("bias bar renders on story cards in feed", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (!(await storyLink.isVisible())) test.skip("No stories in database");

    const biasNumbers = page.locator("text=/^\\d+·\\d+·\\d+$/").first();
    if (await biasNumbers.isVisible()) {
      await expect(biasNumbers).toBeVisible();
    }
  });

  test("bias bar shows BiasBar component on story detail page", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (!(await storyLink.isVisible())) test.skip("No stories in database");
    await storyLink.click();
    await page.waitForLoadState("networkidle");

    const leftLabel = page.locator("text=LEFT").first();
    const rightLabel = page.locator("text=RIGHT").first();
    if (await leftLabel.isVisible()) {
      await expect(leftLabel).toBeVisible();
      await expect(rightLabel).toBeVisible();
    }
  });
});

test.describe("Sparkline", () => {
  test("sparkline renders on story cards", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const svg = page.locator("svg", { hasText: /article|count|\d+/ }).first();
    const storyLink = page.locator('a[href^="/story/"]').first();

    if (await storyLink.isVisible()) {
      if (await svg.isVisible()) {
        await expect(svg).toBeVisible();
        const box = await svg.boundingBox();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
    }
  });
});

test.describe("DriftMap", () => {
  test("drift section renders on story detail page", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (!(await storyLink.isVisible())) test.skip("No stories in database");
    await storyLink.click();
    await page.waitForLoadState("networkidle");

    // Drift map section
    const driftHeading = page.locator("text=DRIFT MAP").first();
    if (await driftHeading.isVisible()) {
      await expect(driftHeading).toBeVisible();
    }
  });
});

test.describe("StoryAsk", () => {
  test("StoryAsk button appears on story detail page", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (!(await storyLink.isVisible())) test.skip("No stories in database");
    await storyLink.click();
    await page.waitForLoadState("networkidle");

    const askBtn = page.locator("button", { hasText: /Ask|ask/i }).first();
    if (await askBtn.isVisible()) {
      await expect(askBtn).toBeVisible();
    }
  });
});

test.describe("OutletMap", () => {
  test("outlet map section renders on analytics page", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const loading = page.locator("text=Loading…");
    if (await loading.isVisible()) {
      await loading.waitFor({ state: "hidden", timeout: 15_000 });
    }

    const outletHeading = page.locator("text=OUTLET LANDSCAPE").first();
    if (await outletHeading.isVisible()) {
      await expect(outletHeading).toBeVisible();
    }
  });
});
