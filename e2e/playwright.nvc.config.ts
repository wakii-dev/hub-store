import { defineConfig } from "@playwright/test";

/**
 * SF-15 — private-port config cho 05-nvc-api.spec.ts KHÔNG đụng shared ports
 * (3000-3002/8080/5005x) — chạy song song an toàn với worktree khác:
 *   Go :50062 · BFF :8085 (boot qua /tmp runner) · Keycloak shared :8081.
 * KHÔNG globalSetup (auth.setup cần shell :3000) — token mint trực tiếp từ
 * Keycloak Authorization Code + PKCE qua script (mint_nvc_auth.py) → storage
 * JSON, spec đọc E2E_NVC_STORAGE.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "05-nvc-api.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
  },
});
