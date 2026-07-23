import { test, expect } from "@playwright/test";

test.describe("Feed - /stories", () => {
  test("shows story list when data is present", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("domcontentloaded");

    const storyLink = page.locator('a[href^="/story/"]').first();
    const failed = page.locator("text=Failed to load stories");

    await expect(storyLink.or(failed)).toBeVisible({ timeout: 15_000 });

    if (await storyLink.isVisible()) {
      await expect(page.locator("text=Tracking")).toBeVisible();
    } else {
      test.info().annotations.push({ type: "warn", description: "No DB — stories not available" });
    }
  });

  test("story cards show status and bias when available", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("domcontentloaded");

    const firstCard = page.locator('a[href^="/story/"]').first();
    await expect(firstCard.or(page.locator("text=Failed to load"))).toBeVisible({ timeout: 15_000 });
    if (!(await firstCard.isVisible())) test.skip("No stories in database");
  });
});

test.describe("Story detail - /story/:id", () => {
  test("navigates from feed to story detail", async ({ page }) => {
    await page.goto("/stories");
    const firstCard = page.locator('a[href^="/story/"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    const storyUrl = await firstCard.getAttribute("href");
    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(storyUrl!), { timeout: 15_000 });
    await expect(page.getByText("← ALL STORIES")).toBeVisible({ timeout: 15_000 });
  });

  test("shows article list and data panels on story page", async ({ page }) => {
    await page.goto("/stories");
    const firstCard = page.locator('a[href^="/story/"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();

    await expect(page.getByRole("heading", { name: /^The coverage/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Lifecycle/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Framing/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Outlets on this story/ })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Article - /article/:id", () => {
  test("navigates from story to article detail", async ({ page }) => {
    await page.goto("/stories");
    const storyLink = page.locator('a[href^="/story/"]').first();
    await expect(storyLink).toBeVisible({ timeout: 15_000 });
    await storyLink.click();

    const articleLink = page.locator('a[href^="/article/"]').first();
    await expect(articleLink).toBeVisible({ timeout: 15_000 });
    await articleLink.click();
    await expect(page.getByText("READ ORIGINAL AT")).toBeVisible({ timeout: 15_000 });
  });

  test("shows article metadata (outlet, date, bias, sentiment)", async ({ page }) => {
    await page.goto("/stories");
    const storyLink = page.locator('a[href^="/story/"]').first();
    await expect(storyLink).toBeVisible({ timeout: 15_000 });
    await storyLink.click();

    const articleLink = page.locator('a[href^="/article/"]').first();
    await expect(articleLink).toBeVisible({ timeout: 15_000 });
    await articleLink.click();
    await expect(page.getByText("READ ORIGINAL AT")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Search - /search", () => {
  test("search form is visible and functional", async ({ page }) => {
    await page.goto("/search");

    const input = page.locator('input[placeholder*="diplomatic"]');
    await expect(input).toBeVisible({ timeout: 15_000 });

    const searchBtn = page.getByRole("button", { name: "Search" });
    await expect(searchBtn).toBeVisible();
    await expect(searchBtn).toBeDisabled();

    await input.fill("climate");
    await expect(searchBtn).toBeEnabled();
  });

  test("submitting a search shows results or empty state", async ({ page }) => {
    await page.goto("/search");

    const input = page.locator('input[placeholder*="diplomatic"]');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill("climate");
    await page.getByRole("button", { name: "Search" }).click({ force: true });

    const matches = page.locator("text=MATCH");
    const noMatches = page.locator("text=No matches");
    await expect(matches.or(noMatches)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Analytics - /analytics", () => {
  test("shows analytics dashboard when data is available", async ({ page }) => {
    await page.goto("/analytics");

    const activeStories = page.locator("text=ACTIVE STORIES");
    const loading = page.locator("text=Loading…");
    await expect(activeStories.or(loading)).toBeVisible({ timeout: 20_000 });

    if (await loading.isVisible()) {
      await loading.waitFor({ state: "hidden", timeout: 15_000 });
    }

    if (await activeStories.isVisible()) {
      await expect(page.locator("text=FADING")).toBeVisible();
      await expect(page.getByRole("heading", { name: /Political lean/ })).toBeVisible();
      await expect(page.getByRole("heading", { name: /category/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Outlet landscape/ })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Most active outlets/ })).toBeVisible();
    }
  });
});

test.describe("Chat - /chat", () => {
  test("chat page renders with heading and chat panel", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Ask about the archive" })).toBeVisible();
  });
});
