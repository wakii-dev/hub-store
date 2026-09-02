import { expect, test, type Page } from "@playwright/test";

/** AntD option hiển thị label i18n VI (không phải role value). */
const ROLE_LABEL: Record<string, string> = {
  Coordinator: "Điều phối",
  WarehouseOps: "Vận hành kho",
  Manager: "Quản lý",
};

/**
 * SF-11 Task 4 — role matrix verify 3 roles (REQUIREMENTS §2):
 * Coordinator D1+D2+Print · WarehouseOps D2+Print (D1 bị chặn) · Manager tất cả.
 * 2 tầng: shell route gating + nav filter (usePermissions).
 */

async function login(page: Page, role: string) {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("login-page").waitFor();
  await page.getByTestId("login-role").locator(".ant-select-selector").click();
  await page.locator(".ant-select-item-option").filter({ hasText: ROLE_LABEL[role] }).click();
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/hub-store-order/**");
}

async function navVisible(page: Page, ids: string[]) {
  for (const id of ["nav-orders", "nav-batch", "nav-print"]) {
    const nav = page.getByTestId(id);
    if (ids.includes(id)) await expect(nav).toBeVisible();
    else await expect(nav).toHaveCount(0);
  }
}

test("Coordinator: thấy D1+D2+Print, vào được cả 3 route", async ({ page }) => {
  await login(page, "Coordinator");
  await expect(page).toHaveURL(/\/hub-store-order\/order$/);
  await navVisible(page, ["nav-orders", "nav-batch", "nav-print"]);
  for (const route of ["order", "batch", "batch/print?batchCode=BATCH-0001"]) {
    await page.goto(`/hub-store-order/${route}`);
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
    await expect(page.getByTestId("remote-mount")).toBeVisible();
  }
});

test("WarehouseOps: landing D2, KHÔNG thấy D1, /order bị chặn 403", async ({ page }) => {
  await login(page, "WarehouseOps");
  await expect(page).toHaveURL(/\/hub-store-order\/batch$/); // firstPathForRole — KHÔNG rơi 403
  await navVisible(page, ["nav-batch", "nav-print"]);
  await page.goto("/hub-store-order/order");
  await expect(page.getByTestId("forbidden")).toBeVisible(); // route gating tầng 1
});

test("Manager: thấy tất cả như Coordinator", async ({ page }) => {
  await login(page, "Manager");
  await expect(page).toHaveURL(/\/hub-store-order\/order$/);
  await navVisible(page, ["nav-orders", "nav-batch", "nav-print"]);
  for (const route of ["order", "batch", "batch/print?batchCode=BATCH-0001"]) {
    await page.goto(`/hub-store-order/${route}`);
    await expect(page.getByTestId("forbidden")).toHaveCount(0);
  }
});

test("Role switcher: Coordinator → WarehouseOps khi đang D1 → redirect route được phép", async ({ page }) => {
  await login(page, "Coordinator");
  await expect(page).toHaveURL(/\/hub-store-order\/order$/);
  await page.getByTestId("role-switcher").locator(".ant-select-selector").click();
  // Option hiển thị label i18n VI (như login), không phải role value
  await page
    .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
    .filter({ hasText: ROLE_LABEL.WarehouseOps })
    .click();
  await expect(page).toHaveURL(/\/hub-store-order\/batch$/); // firstPermittedPath
  await expect(page.getByTestId("nav-orders")).toHaveCount(0);
});
