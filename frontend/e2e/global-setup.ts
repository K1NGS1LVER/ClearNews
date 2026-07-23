import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

/**
 * Flush Redis rate-limit keys before each test suite run so the auth
 * rate limiter (10/min, Redis-backed) from a previous run doesn't block
 * signups in the next run.
 */
export default async function globalSetup(_config: FullConfig) {
  try {
    execSync(
      `../backend/.venv/bin/python -c "import redis; r=redis.Redis(); keys=r.keys('ratelimit:*'); r.delete(*keys) if keys else None"`,
      { cwd: import.meta.dirname, timeout: 5_000, stdio: "pipe" },
    );
  } catch {
    // Redis unreachable or rate-limit keys already expired - skip
  }
}
