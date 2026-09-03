import { defineConfig } from "@playwright/test";

/**
 * SF-16 Task 9 — private-port config cho 07-nvc-fe.spec.ts (và regression
 * E2E_TEST_MATCH), KHÔNG đụng shared ports 3000-3002/8080 (port-war
 * cross-worktree — stack v2 chạy qua runner /tmp/story/fi233/run-sf16-v2.sh:
 * shell :4010, remotes :4011/:4012, BFF :4085, Java :50071, Go :50072;
 * Keycloak shared :8081). KHÔNG globalSetup (auth.setup cần shell :3000) —
 * storageState mint trực tiếp từ Keycloak qua /tmp/story/fi233/mint_sf16_v2.py
 * (pattern SF-15), pass qua E2E_NVC_STORAGE. Chạy:
 *   E2E_REUSE=1 E2E_NVC_STORAGE=<minted> \
 *     pnpm exec playwright test -c playwright.nvc-fe.config.ts tests/07-nvc-fe.spec.ts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: process.env.E2E_TEST_MATCH ?? "07-nvc-fe.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4010",
    storageState: process.env.E2E_NVC_STORAGE ?? "/tmp/story/fi233/sf16-t9-coordinator.json",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
