import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "../lib/credentials";

/**
 * SF-11 Task 4 — role matrix verify 3 roles (REQUIREMENTS §2):
 * Coordinator D1+D2+Print · WarehouseOps D2+Print (D1 bị chặn) · Manager tất cả.
 * 2 tầng: shell route gating + nav filter (usePermissions).
 *
 * SF-4 — role đến từ Keycloak realm role (login thật qua auth.setup →
 * storageState per user, override theo describe). Role-switcher dev-stub ĐÃ BỎ
 * — đổi role = đăng nhập user khác, nên test switch cũ thay bằng kiểm tra
 * chặn D1 của WarehouseOps.
 */

test.describe("Coordinator", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("thấy D1+D2+Print, vào được cả 3 route", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await expect(page).toHaveURL(/\/hub-store-order\/order$/);
    await expect(page.getByTestId("nav-orders")).toBeVisible();
    await expect(page.getByTestId("nav-batch")).toBeVisible();
    await expect(page.getByTestId("nav-print")).toBeVisible();
    for (const route of ["order", "batch", "batch/print?batchCode=BATCH-0001"]) {
      await page.goto(`/hub-store-order/${route}`);
      await expect(page.getByTestId("forbidden")).toHaveCount(0);
      await expect(page.getByTestId("remote-mount")).toBeVisible();
    }
  });
});

test.describe("WarehouseOps", () => {
  test.use({ storageState: ".auth/warehouse.json" });

  test("D1 bị chặn 403, nav KHÔNG có D1, D2+Print vào được", async ({ page }) => {
    // D1 route → chặn tầng 1 (RequirePermission — KHÔNG rơi 403 ở BFF)
    await page.goto("/hub-store-order/order");
    await expect(page.getByTestId("forbidden")).toBeVisible();
    // nav filter tầng 2: không có D1, có D2 + Print
    await expect(page.getByTestId("nav-orders")).toHaveCount(0);
    await expect(page.getByTestId("nav-batch")).toBeVisible();
    await expect(page.getByTestId("nav-print")).toBeVisible();
    // D2 + Print vào bình thường
    await page.goto("/hub-store-order/batch");
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
    await expect(page.getByTestId("remote-mount")).toBeVisible();
    await page.goto("/hub-store-order/batch/print?batchCode=BATCH-0001");
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
  });
});

test.describe("Manager", () => {
  test.use({ storageState: ".auth/manager.json" });

  test("thấy tất cả như Coordinator", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await expect(page).toHaveURL(/\/hub-store-order\/order$/);
    await expect(page.getByTestId("nav-orders")).toBeVisible();
    await expect(page.getByTestId("nav-batch")).toBeVisible();
    await expect(page.getByTestId("nav-print")).toBeVisible();
    for (const route of ["order", "batch", "batch/print?batchCode=BATCH-0001"]) {
      await page.goto(`/hub-store-order/${route}`);
      await expect(page.getByTestId("forbidden")).toHaveCount(0);
    }
  });
});

test.describe("Landing thật (login flow — KHÔNG storageState)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Login thật qua Keycloak hosted UI (như auth.setup nhưng trong test). */
  async function realLogin(page: import("@playwright/test").Page, username: string) {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/protocol/openid-connect/auth**");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#kc-login").click();
    await page.waitForURL("**/hub-store-order/**");
  }

  test("Coordinator: login thật → landing D1 /order (firstPathForRole)", async ({ page }) => {
    await realLogin(page, "coordinator");
    await expect(page).toHaveURL(/\/hub-store-order\/order$/);
    await expect(page.getByTestId("nav-orders")).toBeVisible();
  });

  test("WarehouseOps: login thật → landing D2 /batch (KHÔNG rơi 403 D1)", async ({ page }) => {
    await realLogin(page, "warehouse");
    await expect(page).toHaveURL(/\/hub-store-order\/batch$/);
    await expect(page.getByTestId("nav-orders")).toHaveCount(0);
  });
});
