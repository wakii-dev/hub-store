import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

/**
 * SF-4 — globalSetup: login THẬT qua Keycloak hosted UI (Authorization Code +
 * PKCE) cho các user mẫu của realm import (coordinator/warehouse/manager/
 * admin/warehouse-emp — password dev `Password123!`) → storageState
 * `.auth/<user>.json`. Các spec dùng lại storageState (default coordinator)
 * — KHÔNG login lại mỗi test.
 *
 * oidc-client-ts persist user ở window.localStorage (oidc.ts userStore) nên
 * storageState giữ nguyên session; reload sau đó loadCurrentUser đọc lại từ
 * localStorage → đăng nhập không cần đi qua /callback.
 *
 * Chạy sau khi webServer (boot-all.sh) đã keycloak :8081 + shell :3000 lên.
 * NOTE SF-18: warehouse-emp chỉ tồn tại sau khi Keycloak re-import realm JSON
 * (clean boot — verify ở Task 7).
 */

const USERS = ["coordinator", "warehouse", "manager", "admin", "warehouse-emp"] as const;
const PASSWORD = "Password123!"; // dev-only literal — realm JSON import
const AUTH_DIR = path.join(__dirname, ".auth");

export default async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const username of USERS) {
      const context = await browser.newContext();
      const page = await context.newPage();
      // globalSetup không kế thừa use.baseURL — URL đầy đủ
      await page.goto("http://localhost:3000/hub-store-order/order");
      await page.getByTestId("login-submit").click();
      // Redirect sang Keycloak hosted login (realm hubstore)
      await page.waitForURL("**/protocol/openid-connect/auth**");
      await page.locator("#username").fill(username);
      await page.locator("#password").fill(PASSWORD);
      await page.locator("#kc-login").click();
      // Về /callback → app navigate firstPathForRole (coordinator/manager
      // → /order, warehouse → /batch, warehouse-emp → /d2c — SF-18)
      await page.waitForURL("**/hub-store-order/**");
      // AppLayout render = session đã persist localStorage — storageState đủ.
      await page.getByTestId("lang-toggle").waitFor();
      await context.storageState({ path: path.join(AUTH_DIR, `${username}.json`) });
      await context.close();
      console.log(`[auth.setup] storageState cho ${username} OK`);
    }
  } finally {
    await browser.close();
  }
}
