import { defineConfig } from "@playwright/test";

/**
 * SF-24 (FI-269) — private-port config cho 08-map.spec.ts, seam boot qua
 * e2e/scripts/run-map-private.sh: shell :4210, remotes :4211/:4212, BFF :4285,
 * Java :52071, Go :52072, postgres riêng sf-24-postgres :56442, Keycloak shared
 * :8081. KHÔNG globalSetup (auth.setup cần shell :3000) — storageState mint
 * trực tiếp từ Keycloak qua /tmp/story/fi233/mint_sf16_v2.py (pattern SF-15/16,
 * FULL oidc-client-ts User shape + origin arg), pass qua E2E_MAP_STORAGE. Chạy:
 *   E2E_MAP_STORAGE=<minted> \
 *     pnpm exec playwright test -c playwright.map.config.ts tests/08-map.spec.ts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: process.env.E2E_TEST_MATCH ?? "08-map.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4210",
    storageState: process.env.E2E_MAP_STORAGE ?? "/tmp/story/sf-24/sf24-coordinator.json",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
