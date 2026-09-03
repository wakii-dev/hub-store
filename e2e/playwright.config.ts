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
 * E2E_SHELL_URL — private-port seam (SF-15/SF-14 precedent): override khi chạy
 * stack private (vd http://localhost:3100) mà không tranh :3000 với sibling SF
 * đang chạy e2e trên stack riêng. Default giữ nguyên behavior cũ.
 */
const SHELL_URL = process.env.E2E_SHELL_URL ?? "http://localhost:3000";

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
  },
  webServer: {
    command: "bash ../scripts/boot-all.sh",
    url: SHELL_URL,
    timeout: 300_000,
    reuseExistingServer: !!process.env.E2E_REUSE,
  },
});
