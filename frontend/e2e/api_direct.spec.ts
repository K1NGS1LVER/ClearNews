import { test, expect } from "@playwright/test";

test.describe("API direct smoke tests", () => {
  test("GET /api/stories returns an array of story cards", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/stories");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBeTruthy();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty("id");
      expect(body[0]).toHaveProperty("title");
      expect(body[0]).toHaveProperty("status");
    }
  });

  test("GET /api/search?q=economy returns 200 quickly", async ({ request }) => {
    const resp = await request.get(
      "http://localhost:8000/api/search?q=economy&limit=3",
      { timeout: 20_000 }
    );
    expect(resp.ok()).toBeTruthy();
  });

  test("GET /api/analytics returns dashboard data", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/analytics");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty("stories_by_status");
    expect(body).toHaveProperty("articles_by_bias");
  });

  test("GET /api/countries returns a list", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/countries");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("search with uncommon term returns empty array gracefully", async ({ request }) => {
    const resp = await request.get(
      "http://localhost:8000/api/search?q=zzzzzzz&limit=1"
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("auth endpoints accessible", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/auth/me");
    // Not authenticated, so should be 401 or 403, not 5xx
    expect(resp.status()).toBeLessThan(500);
  });

  test("GET /api/stories/:id returns 404 for missing", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/stories/999999");
    expect(resp.status()).toBe(404);
  });
});
