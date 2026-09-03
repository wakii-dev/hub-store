import { defineConfig } from "@playwright/test";

/**
 * SF-11 Task 6 — private-port config cho 08-*.spec.ts (audit/export/mobile,
 * FI-256), KHÔNG đụng shared ports 3000-3002/8080 (port-war cross-worktree —
 * seam sf-11 chạy qua runner e2e/scripts/run-sf11-stack.sh: shell :4010,
 * remotes :4011/:4012, BFF :4085, Java :50071, Go :50072; keycloak riêng
 * :8082, postgres :55442). KHÔNG globalSetup (auth.setup cần shell :3000) —
 * storageState mint từ keycloak seam qua e2e/scripts/mint_sf11.py
 * (adapt mint_sf16_v2.py pattern SF-15), spec chọn role qua helper
 * sf11-helpers.ts (test.use storageState per-role). Chạy:
 *   bash e2e/scripts/run-sf11-stack.sh &   # đợi ports
 *   python3 e2e/scripts/mint_sf11.py manager  # + coordinator + admin
 *   E2E_REUSE=1 pnpm exec playwright test -c playwright.sf11.config.ts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: process.env.E2E_TEST_MATCH ?? "08-*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4010",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
