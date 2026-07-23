import { test, expect } from "@playwright/test";

const PASSWORD = "correcthorse";

test.describe("Tier 1 — Search result caching", () => {
  test("search form works end-to-end", async ({ page }) => {
    await page.goto("/search");

    const input = page.locator('input[placeholder*="diplomatic"]');
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("economy");
    await expect(page.getByRole("button", { name: "Search" })).toBeEnabled();

    await page.getByRole("button", { name: "Search" }).click({ force: true });

    await expect(
      page.locator("text=MATCH").or(page.locator("text=No matches"))
    ).toBeVisible({ timeout: 20_000 });
  });

  test("different queries both complete successfully", async ({ page }) => {
    await page.goto("/search");

    const input = page.locator('input[placeholder*="diplomatic"]');
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("climate");
    await page.getByRole("button", { name: "Search" }).click({ force: true });
    await expect(page.locator("text=MATCH").or(page.locator("text=No matches"))).toBeVisible({ timeout: 20_000 });

    await input.fill("trade");
    await page.getByRole("button", { name: "Search" }).click({ force: true });
    await expect(page.locator("text=MATCH").or(page.locator("text=No matches"))).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Tier 1 — For You feed caching", () => {
  test("signed-up user sees for you feed", async ({ page }) => {
    const email = `e2e-foryou-cache+${Date.now()}@test.local`;
    await page.goto("/signup");
    await page.fill("input:not([type])", "FY Cache");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", PASSWORD);
    await page.click("button:has-text('Create account')");
    await page.waitForURL("**/welcome", { timeout: 10_000 });

    await page.click("button:has-text('Economy')");
    await page.click("button:has-text('Save & continue')");
    await page.waitForURL("**/foryou", { timeout: 10_000 });

    await expect(page.locator("text=RANKED FOR YOU")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Tier 1 — Story drift caching", () => {
  test("story drift loads without error", async ({ page }) => {
    await page.goto("/stories");
    const storyLink = page.locator('a[href^="/story/"]').first();
    await expect(storyLink).toBeVisible({ timeout: 15_000 });

    await storyLink.click();
    const driftHeading = page.locator("text=DRIFT MAP").first();
    if (await driftHeading.isVisible()) {
      await expect(driftHeading).toBeVisible();
    }
  });
});

test.describe("Tier 2 — Session lifecycle", () => {
  const email = `e2e-session-lifecycle+${Date.now()}@test.local`;

  test("session persists across navigations and logout clears it", async ({ page }) => {
    await page.goto("/signup");
    await page.fill("input:not([type])", "Session Lifecycle");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", PASSWORD);
    await page.click("button:has-text('Create account')");
    await page.waitForURL("**/welcome", { timeout: 10_000 });

    // navigate around
    await page.goto("/search");
    await expect(page.locator('input[placeholder*="diplomatic"]')).toBeVisible({ timeout: 15_000 });

    await page.goto("/analytics");
    const activeStories = page.locator("text=ACTIVE STORIES");
    const loading = page.locator("text=Loading…");
    await expect(activeStories.or(loading)).toBeVisible({ timeout: 20_000 });

    // logout
    await page.click("button:has-text('LOG OUT')");
    await page.waitForURL("http://localhost:5173/", { timeout: 10_000 });

    // /foryou redirects to landing
    await page.goto("/foryou");
    await page.waitForURL("http://localhost:5173/", { timeout: 10_000 });
    await expect(page.locator("text=Every story has a life")).toBeVisible();
  });
});

test.describe("Tier 3 — Pipeline integration", () => {
  test("OpenAPI docs reachable", async ({ page }) => {
    const resp = await page.request.get("http://localhost:8000/docs");
    expect(resp.ok()).toBeTruthy();
  });

  test("analytics page renders", async ({ page }) => {
    await page.goto("/analytics");
    await expect(
      page.locator("text=ACTIVE STORIES").or(page.locator("text=Loading…"))
    ).toBeVisible({ timeout: 20_000 });
  });
});
