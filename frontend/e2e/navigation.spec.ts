import { test, expect } from "@playwright/test";

const navLinks = [
  { label: "Stories", path: "/stories" },
  { label: "Latest", path: "/latest" },
  { label: "Search", path: "/search" },
  { label: "Data", path: "/analytics" },
  { label: "Ask", path: "/chat" },
];

test.describe("Navigation", () => {
  test("all nav links are visible and navigate correctly", async ({ page }) => {
    await page.goto("/stories");

    for (const link of navLinks) {
      const navBtn = page.getByRole("link", { name: link.label, exact: true });
      await expect(navBtn).toBeVisible();
      await navBtn.click();
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
    await page.goto("/latest");
    await expect(page.locator("text=ClearNews")).toBeVisible();

    await page.goto("/search");
    await expect(page.locator('input[placeholder*="diplomatic"]')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/latest/);

    await page.goForward();
    await expect(page).toHaveURL(/\/search/);
  });
});
