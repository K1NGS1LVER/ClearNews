import { test, expect } from "@playwright/test";

const RATE_LIMIT_STATUS = 429;
const PASSWORD = "correcthorse";

// Rate limits: 10 auth/min, 20 chat/min, 10 suggest/min, 5 summarise/min

test.describe("Auth rate limiting", () => {
  test("blocks excessive login attempts", async ({ page }) => {
    const email = `e2e-ratelimit-login+${Date.now()}@test.local`;

    // sign up first
    await page.goto("/signup");
    await page.fill("input:not([type])", "RL Login");
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", PASSWORD);
    await page.click("button:has-text('Create account')");
    await page.waitForURL("**/welcome", { timeout: 10_000 });

    // logout
    await page.click("button:has-text('LOG OUT')");
    await page.waitForURL("http://localhost:5173/", { timeout: 10_000 });

    // now attempt login rapidly — hit /api/auth directly
    let got429 = false;
    for (let i = 0; i < 25; i++) {
      const resp = await page.request.post(
        "http://localhost:8000/api/auth/login",
        {
          data: { email, password: PASSWORD },
          headers: { "Content-Type": "application/json" },
        }
      );
      if (resp.status() === RATE_LIMIT_STATUS) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBeTruthy();
  });
});

test.describe("Suggest rate limiting", () => {
  test("blocks excessive suggest requests", async ({ request }) => {
    // suggest is 10/min, hit it rapidly (no auth needed)
    let got429 = false;
    for (let i = 0; i < 25; i++) {
      const resp = await request.get(
        "http://localhost:8000/api/suggest?context=hello"
      );
      if (resp.status() === RATE_LIMIT_STATUS) {
        got429 = true;
        break;
      }
    }
    // suggest is 10/min, so some requests after 10 should fail
    expect(got429).toBeTruthy();
  });
});
