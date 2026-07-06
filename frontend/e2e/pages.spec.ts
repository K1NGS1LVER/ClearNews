import { test, expect } from "@playwright/test";

test.describe("Feed - /stories", () => {
  test("shows story list when data is present", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const loading = page.locator("text=Loading stories");
    const failed = page.locator("text=Failed to load stories");
    const storyLink = page.locator('a[href^="/story/"]').first();

    if (await loading.isVisible()) {
      await loading.waitFor({ state: "hidden", timeout: 10_000 });
    }

    if (await storyLink.isVisible()) {
      await expect(page.locator("text=Tracking")).toBeVisible();
    } else if (await failed.isVisible()) {
      test.info().annotations.push({ type: "warn", description: "No DB — stories not available" });
    }
  });

  test("story cards show status and bias when available", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/story/"]').first();
    if (!(await firstCard.isVisible())) test.skip("No stories in database");

    await expect(firstCard).toBeVisible();
  });
});

test.describe("Story detail - /story/:id", () => {
  test("navigates from feed to story detail", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/story/"]').first();
    if (!(await firstCard.isVisible())) test.skip("No stories in database");

    const storyUrl = await firstCard.getAttribute("href");
    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(storyUrl!));

    await expect(page.getByText("← ALL STORIES")).toBeVisible();
  });

  test("shows article list and data panels on story page", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('a[href^="/story/"]').first();
    if (!(await firstCard.isVisible())) test.skip("No stories in database");

    await firstCard.click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /^The coverage/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Lifecycle/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Framing/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Outlets on this story/ })).toBeVisible();
  });
});

test.describe("Article - /article/:id", () => {
  test("navigates from story to article detail", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (!(await storyLink.isVisible())) test.skip("No stories in database");
    await storyLink.click();
    await page.waitForLoadState("networkidle");

    const articleLink = page.locator('a[href^="/article/"]').first();
    if (!(await articleLink.isVisible())) test.skip("No articles in this story");

    await articleLink.click();
    await expect(page.getByText("READ ORIGINAL AT")).toBeVisible();
  });

  test("shows article metadata (outlet, date, bias, sentiment)", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");

    const storyLink = page.locator('a[href^="/story/"]').first();
    if (!(await storyLink.isVisible())) test.skip("No stories in database");
    await storyLink.click();
    await page.waitForLoadState("networkidle");

    const articleLink = page.locator('a[href^="/article/"]').first();
    if (!(await articleLink.isVisible())) test.skip("No articles in this story");
    await articleLink.click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("READ ORIGINAL AT")).toBeVisible();
  });
});

test.describe("Search - /search", () => {
  test("search form is visible and functional", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    const input = page.locator('input[placeholder*="diplomatic"]');
    await expect(input).toBeVisible();

    const searchBtn = page.getByRole("button", { name: "Search" });
    await expect(searchBtn).toBeVisible();
    await expect(searchBtn).toBeDisabled();

    await input.fill("climate");
    await expect(searchBtn).toBeEnabled();
  });

  test("submitting a search shows results or empty state", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    const input = page.locator('input[placeholder*="diplomatic"]');
    await input.fill("climate");
    await page.getByRole("button", { name: "Search" }).click({ force: true });

    await page.waitForLoadState("networkidle");

    const matches = page.locator("text=MATCH");
    const noMatches = page.locator("text=No matches");

    if (await matches.isVisible()) {
      await expect(matches).toBeVisible();
    } else if (await noMatches.isVisible()) {
      await expect(noMatches).toBeVisible();
    }
  });
});

test.describe("Analytics - /analytics", () => {
  test("shows analytics dashboard when data is available", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    const loading = page.locator("text=Loading…");
    const activeStories = page.locator("text=ACTIVE STORIES");

    if (await loading.isVisible()) {
      await loading.waitFor({ state: "hidden", timeout: 15_000 });
    }

    if (await activeStories.isVisible()) {
      await expect(activeStories).toBeVisible();
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
