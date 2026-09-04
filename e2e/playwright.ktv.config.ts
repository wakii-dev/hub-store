import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

/**
 * SF-25 (FI-270) — private-port config cho 09-ktv-mobile.spec.ts, seam boot
 * qua e2e/scripts/run-ktv-private.sh: app :4220 (vite dev), BFF :4286,
 * Java :52073, Go :52074, postgres riêng sf-25-postgres :56443, Keycloak riêng
 * sf-25-keycloak :8082 (FRESH volume — realm hubstore-mobile). KHÔNG
 * globalSetup — runner mint storageState KTV-001 + CTV-001 trực tiếp từ
 * Keycloak (mint_ktv_auth.py, pattern SF-15/16) vào e2e/.auth/ (gitignored).
 * Viewport mobile 375x667 (iPhone SE landscape-cao — spec §4.4). Chạy:
 *   bash e2e/scripts/run-ktv-private.sh &   # đợi "seam ready"
 *   pnpm --dir e2e exec playwright test -c playwright.ktv.config.ts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: process.env.E2E_TEST_MATCH ?? "09-ktv-mobile.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4220",
    // Mặc định KTV-001 — test CTV-001 override qua test.use trong spec.
    storageState:
      process.env.E2E_KTV_STORAGE ?? resolve(__dirname, ".auth/ktv-001.json"),
    viewport: { width: 375, height: 667 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
