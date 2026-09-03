import { defineConfig } from "@playwright/test";

/**
 * SF-11 E2E — webServer boot TOÀN HỆ THỐNG qua scripts/boot-all.sh
 * (Java + Go + Python + BFF + shell + 2 remotes — 1 lệnh, không boot tay).
 * reuseExistingServer: false — state in-memory cần seed sạch.
 * Serial + workers 1: specs mutate store (main-flow chạy trước role-matrix/audit
 * — thứ tự ép bằng tiền tố 01/02/03 trong tên file).
 *
 * SF-4 — auth thật Keycloak: globalSetup login 3 user mẫu qua hosted UI →
 * storageState `.auth/<user>.json`; default coordinator (specs 01/03/04).
 * Spec 02 override per-test (`test.use({ storageState })`) theo role.
 */
/**
 * E2E_SHELL_URL — private-port seam (SF-15 precedent): override khi chạy stack
 * private (vd http://localhost:3100) mà không đụng stack mặc định :3000.
 * Default giữ nguyên behavior cũ.
 */
const SHELL_URL = process.env.E2E_SHELL_URL ?? "http://localhost:3000";

/**
 * E2E_PROXY — private-stack seam: route browser requests qua HTTP proxy
 * (vd http://127.0.0.1:8280 map localhost:8080 → BFF private). Specs hardcode
 * :8080 vẫn chạy đúng mà không sửa code cũ. Default: không proxy (behavior cũ).
 * E2E_PG_SEAM — PATH-prepend shim `docker` (redirect `docker compose exec -T
 * postgres psql` → private pg container) cho specs + seed-db.sh.
 */
const PROXY_URL = process.env.E2E_PROXY;
if (process.env.E2E_PG_SEAM === "1") {
  // Mutate PATH của chính runner process — execSync trong specs (psql helper,
  // seed-db.sh) + webServer con đều inherit shim.
  process.env.PATH = `/tmp/story/sf-14/shim:${process.env.PATH ?? ""}`;
}

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./auth.setup",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: SHELL_URL,
    storageState: ".auth/coordinator.json",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(PROXY_URL ? { proxy: { server: PROXY_URL } } : {}),
  },
  webServer: {
    command: "bash ../scripts/boot-all.sh",
    url: SHELL_URL,
    timeout: 300_000,
    reuseExistingServer: !!process.env.E2E_REUSE,
  },
});
