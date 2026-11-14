import { test, expect } from "@playwright/test";

const navLinks = [
  { label: "Stories", path: "/stories" },
  { label: "Search", path: "/search" },
  { label: "Data", path: "/analytics" },
  { label: "Ask", path: "/chat" },
];

test.describe("Navigation", () => {
  test("all nav links are visible and have correct hrefs", async ({ page }) => {
    await page.goto("/search");

    for (const link of navLinks) {
      const navBtn = page.locator(`nav a:has-text("${link.label}")`).first();
      await expect(navBtn).toBeVisible();
      await expect(navBtn).toHaveAttribute("href", link.path);
    }
  });

  test("navigating via URL works for all routes", async ({ page }) => {
    for (const link of navLinks) {
      await page.goto(link.path);
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(new RegExp(link.path));
    }
  });

  test("mobile bottom nav shows all links", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/stories");

    for (const link of navLinks) {
      const navBtn = page.locator(".fixed nav a, [class*='fixed'] a", { hasText: link.label.toUpperCase() }).first();
      await expect(navBtn).toBeVisible();
    }
  });

  test("browser back and forward navigation works", async ({ page }) => {
    await page.goto("/stories");
    await expect(page.locator("text=ClearNews")).toBeVisible({ timeout: 15_000 });

    await page.goto("/search");
    await expect(page.locator('input[placeholder*="diplomatic"]')).toBeVisible({ timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/stories/, { timeout: 15_000 });

    await page.goForward();
    await expect(page).toHaveURL(/\/search/, { timeout: 15_000 });
  });
});
