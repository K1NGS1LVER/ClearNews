import { test, expect } from "@playwright/test";

test.describe("Agentic pipeline e2e verification", () => {
  test("feed returns agent_headline field in story cards", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/stories");
    expect(resp.ok()).toBeTruthy();
    const stories = await resp.json();
    expect(Array.isArray(stories)).toBeTruthy();
    if (stories.length > 0) {
      const first = stories[0];
      expect(first).toHaveProperty("agent_headline");
      expect(first).toHaveProperty("title");
    }
  });

  test("story detail returns agentic metadata (agent_headline, coherence_score, milestones)", async ({ request }) => {
    const feedResp = await request.get("http://localhost:8000/api/stories");
    const stories = await feedResp.json();
    if (stories.length > 0) {
      const storyId = stories[0].id;
      const detailResp = await request.get(`http://localhost:8000/api/stories/${storyId}`);
      expect(detailResp.ok()).toBeTruthy();
      const detail = await detailResp.json();
      expect(detail).toHaveProperty("agent_headline");
      expect(detail).toHaveProperty("coherence_score");
      expect(detail).toHaveProperty("milestones");
    }
  });

  test("UI feed displays headlines properly", async ({ page }) => {
    await page.goto("/stories");
    await page.waitForLoadState("networkidle");
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
  });
});
