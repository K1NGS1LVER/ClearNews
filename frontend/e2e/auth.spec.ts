import { test, expect } from "@playwright/test";

// ponytail: no test-DB isolation exists; namespace with @test.local so leftover
// signups are easy to identify and clean up manually.
const email = `e2e+${Date.now()}@test.local`;
const password = "correcthorse";

test.describe("Auth journey", () => {
  test("landing → signup → welcome → foryou → stories → logout", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Every story has a life")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();

    await page.getByRole("link", { name: "Sign up" }).first().click();
    await expect(page).toHaveURL(/\/signup/);

    await page.fill("input:not([type])", "E2E Tester");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await page.click("button:has-text('Create account')");

    await page.waitForURL("**/welcome", { timeout: 10_000 });
    await expect(page.locator("text=Tell us what you follow")).toBeVisible();

    await page.click("button:has-text('Economy')");
    await page.click("button[title='Set as favourite']");
    await page.click("button:has-text('BALANCED')");
    await page.fill("input[placeholder*='artificial']", "markets");
    await page.keyboard.press("Enter");
    await page.click("button:has-text('Save & continue')");

    await page.waitForURL("**/foryou", { timeout: 10_000 });
    await expect(page.locator("text=RANKED FOR YOU")).toBeVisible({ timeout: 15_000 });

    // "/" now redirects straight to the personalized feed
    await page.goto("/");
    await page.waitForURL("**/foryou", { timeout: 10_000 });

    // classic Stories feed is still public and unpersonalized
    await page.goto("/stories");
    await expect(page.locator("text=Tracking")).toBeVisible();

    await page.click("button:has-text('LOG OUT')");
    await page.waitForURL("http://localhost:5173/", { timeout: 10_000 });
    await expect(page.locator("text=Every story has a life")).toBeVisible();

    // signed out again: /foryou bounces back to the landing page
    await page.goto("/foryou");
    await page.waitForURL("http://localhost:5173/", { timeout: 10_000 });
  });
});
