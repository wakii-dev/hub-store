import { defineConfig } from "@playwright/test";

/**
 * SF-26 — private-port config cho 09-webhook.spec.ts (pattern
 * playwright.nvc.config.ts): KHÔNG globalSetup (auth.setup cần shell :3000)
 * và KHÔNG webServer (stack boot qua e2e/scripts/run-sf26-private.sh —
 * BFF :19080, Java :53051, kafka-ui :56485, Keycloak shared :8081).
 * Token mint trực tiếp từ Keycloak (mint_nvc_auth.py) → spec đọc
 * E2E_SF26_STORAGE. Skip-gate E2E_SF26 trong chính spec.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "09-webhook.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
  },
});
