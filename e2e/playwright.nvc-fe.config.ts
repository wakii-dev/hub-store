import { defineConfig } from "@playwright/test";

/**
 * SF-16 Task 9 — private-port config cho 07-nvc-fe.spec.ts, KHÔNG đụng
 * shared ports 3000-3002/8080 (port-war cross-worktree — stack chạy qua
 * runner /tmp/story/fi233/run-sf16-t9-private.sh: shell :3010, remotes
 * :3011/:3012, BFF :8085; Keycloak shared :8081). KHÔNG globalSetup
 * (auth.setup cần shell :3000) — storageState mint trực tiếp từ Keycloak
 * qua e2e/scripts/mint_nvc_auth.py (pattern SF-15), pass qua
 * E2E_NVC_STORAGE. Chạy:
 *   E2E_REUSE=1 E2E_NVC_STORAGE=<minted> \
 *     pnpm exec playwright test -c playwright.nvc-fe.config.ts tests/07-nvc-fe.spec.ts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "07-nvc-fe.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3010",
    storageState: process.env.E2E_NVC_STORAGE ?? "/tmp/story/fi233/sf16-t9-coordinator.json",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
