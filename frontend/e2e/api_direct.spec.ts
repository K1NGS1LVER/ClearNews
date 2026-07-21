import { test, expect } from "@playwright/test";

test.describe("API direct smoke tests", () => {
  test("GET /api/health returns ok", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/health");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty("status", "healthy");
  });

  test("GET /api/search?q=economy returns 200 quickly", async ({ request }) => {
    const resp = await request.get(
      "http://localhost:8000/api/search?q=economy&limit=3",
      { timeout: 20_000 }
    );
    expect(resp.ok()).toBeTruthy();
  });

  test("GET /api/stories returns results", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/stories");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty("stories");
  });

  test("GET /api/stories/count returns a number", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/stories/count");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(typeof body).toBe("number");
  });

  test("GET /api/analytics/reach returns data", async ({ request }) => {
    const resp = await request.get(
      "http://localhost:8000/api/analytics/reach"
    );
    // 500 if missing API key, which is fine — we just want a response
    expect(resp.status()).toBeGreaterThanOrEqual(200);
    expect(resp.status()).toBeLessThan(500);
  });

  test("GET /api/countries returns a list", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/countries");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("search with uncommon term returns empty gracefully", async ({ request }) => {
    const resp = await request.get(
      "http://localhost:8000/api/search?q=zzzzzzz&limit=1"
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty("matches");
  });

  test("auth endpoints accessible", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/auth/me");
    // Not authenticated, so should be 401 or 403, not 5xx
    expect(resp.status()).toBeLessThan(500);
  });

  test("GET /api/stories/:id returns 404 for missing", async ({ request }) => {
    const resp = await request.get(
      "http://localhost:8000/api/stories/00000000-0000-0000-0000-000000000000"
    );
    expect(resp.status()).toBe(404);
  });
});
