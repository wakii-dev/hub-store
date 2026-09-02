import { defineConfig } from "@playwright/test";

/**
 * SF-11 E2E — webServer boot TOÀN HỆ THỐNG qua scripts/boot-all.sh
 * (Java + Go + Python + BFF + shell + 2 remotes — 1 lệnh, không boot tay).
 * reuseExistingServer: false — state in-memory cần seed sạch.
 * Serial + workers 1: specs mutate store (main-flow chạy trước role-matrix/audit
 * — thứ tự ép bằng tiền tố 01/02/03 trong tên file).
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "bash ../scripts/boot-all.sh",
    url: "http://localhost:3000",
    timeout: 300_000,
    reuseExistingServer: !!process.env.E2E_REUSE,
  },
});
