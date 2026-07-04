import { test, expect } from "@playwright/test";

test.describe("App shell", () => {
  test("page has correct title and heading", async ({ page }) => {
    await page.goto("/stories");
    await expect(page.locator("text=ClearNews")).toBeVisible();
  });

  test("theme toggle switches between dark and light", async ({ page }) => {
    await page.goto("/stories");
    const toggle = page.locator("button", { hasText: /LIGHT|DARK/ });
    await expect(toggle).toBeVisible();

    const initialTheme = await page.locator("html").getAttribute("data-theme");
    await toggle.click();
    const toggledTheme = await page.locator("html").getAttribute("data-theme");
    expect(toggledTheme).not.toBe(initialTheme);

    await toggle.click();
    const restoredTheme = await page.locator("html").getAttribute("data-theme");
    expect(restoredTheme).toBe(initialTheme);
  });

  test("theme persists across navigation", async ({ page }) => {
    await page.goto("/stories");
    const toggle = page.locator("button", { hasText: /LIGHT|DARK/ });
    await toggle.click();
    const theme = await page.locator("html").getAttribute("data-theme");

    await page.goto("/latest");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
  });
});
