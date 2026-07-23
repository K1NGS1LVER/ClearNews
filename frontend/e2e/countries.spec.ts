import { test, expect } from "@playwright/test";

// ponytail: no test-DB isolation exists; namespace with @test.local so leftover
// signups are easy to identify and clean up manually.
const email = `e2e-country+${Date.now()}@test.local`;
const password = "correcthorse";

test.describe("Country dimension", () => {
  test("onboarding country picker → foryou/stories filters → 3-dot feedback", async ({ page }) => {
    await page.goto("/signup");
    await page.fill("input:not([type])", "Country Tester");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await page.click("button:has-text('Create account')");
    await page.waitForURL("**/welcome", { timeout: 10_000 });

    // onboarding country picker: search + select two unrelated countries
    await expect(page.locator("text=COUNTRIES TO FOLLOW")).toBeVisible({ timeout: 10_000 });
    await page.fill("input[placeholder='Search for a country…']", "India");
    await page.click("button:has-text('India')");
    await page.fill("input[placeholder='Search for a country…']", "Brazil");
    await page.click("button:has-text('Brazil')");
    // selected countries render as removable chips
    await expect(page.locator("text=India").first()).toBeVisible();
    await expect(page.locator("text=Brazil").first()).toBeVisible();

    await page.click("button:has-text('Save & continue')");
    await page.waitForURL("**/foryou", { timeout: 10_000 });

    // preference actually persisted server-side
    const me = await page.request.get("http://localhost:8000/api/me", {
      headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    expect(meBody.countries.sort()).toEqual(["BR", "IN"]);

    // For You filter bar: wait for countries to load, then select India
    const countrySelect = page.locator("select");
    await expect(countrySelect.locator("option[value='IN']")).toBeAttached({ timeout: 15_000 });
    await countrySelect.selectOption("IN");
    // country filter is applied: mode buttons appear, and the select shows IN
    await expect(countrySelect).toHaveValue("IN");
    await expect(page.locator("text=From this country")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=About this country")).toBeVisible();

    // back to unfiltered feed
    await page.selectOption("select", "");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (await storyLink.isVisible().catch(() => false)) {
      // 3-dot menu: "less of this" hides the card without navigating away.
      const cardWrapper = storyLink.locator("xpath=..");
      const title = await cardWrapper.locator("h2").first().textContent();
      await cardWrapper.locator('button[aria-label="Story options"]').click();
      await page.click("text=Show me less of this");
      await expect(page).toHaveURL(/\/foryou/); // menu click must not have navigated
      if (title) await expect(page.locator("h2", { hasText: title })).toHaveCount(0);
    }

    // Stories tab: same country filter + status pills, no auth required
    await page.goto("/stories");
    await expect(page.locator("text=Tracking")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("button:has-text('Active')")).toBeVisible();
    const storiesSelect = page.locator("select");
    await expect(storiesSelect.locator("option[value='BR']")).toBeAttached({ timeout: 15_000 });
    await storiesSelect.selectOption("BR");
    await expect(page.locator("text=From this country")).toBeVisible();

    await page.click("button:has-text('LOG OUT')");
    await page.waitForURL("http://localhost:5173/", { timeout: 10_000 });
  });
});
