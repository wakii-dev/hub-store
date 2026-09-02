import { expect, test, type Page } from "@playwright/test";

/**
 * SF-8 — Users management: Manager list/tạo/login-user-mới/set-password/
 * disable; Coordinator+WarehouseOps nav ẩn + API 403 (Bearer thật từ OIDC
 * storage — KHÔNG dùng cookie-only vì BFF verify Bearer → 401 nếu thiếu).
 */

const BFF = "http://localhost:8080";

/** Đọc access token từ oidc-client-ts storage (localStorage key oidc.user:*). */
async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      const key = Object.keys(store).find((k) => k.startsWith("oidc.user:"));
      if (!key) continue;
      const user = JSON.parse(store.getItem(key) ?? "null");
      if (typeof user?.access_token === "string") return user.access_token;
    }
    return null;
  });
  expect(token, "OIDC access token phải tồn tại trong storage").toBeTruthy();
  return token as string;
}

async function bffGet(page: Page, path: string): Promise<Response> {
  const token = await accessToken(page);
  return page.request.get(`${BFF}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Login thật qua KC hosted UI với username/password bất kỳ (helper riêng —
 * realLogin của 02-spec describe-scoped + hardcode Password123!). */
async function realLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/protocol/openid-connect/auth**");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
}

test.describe("Manager — Users management", () => {
  test.use({ storageState: ".auth/manager.json" });

  test("nav-users + list 3 users mẫu", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByTestId("nav-users")).toBeVisible();
    await expect(page.getByTestId("users-page")).toBeVisible();
    await expect(page.getByTestId("user-row-coordinator")).toBeVisible();
    await expect(page.getByTestId("user-row-warehouse")).toBeVisible();
    await expect(page.getByTestId("user-row-manager")).toBeVisible();
  });

  test("tạo user WarehouseOps → login mới OK đúng quyền → set-password → disable → login FAIL", async ({ page }) => {
    test.setTimeout(120_000);
    const username = `e2e-user-${Date.now()}`;
    const password = "E2eUserPass1!";
    const newPassword = "E2eUserPass2!";

    await page.goto("/users");
    await page.getByTestId("users-add-button").click();
    const modal = page.getByTestId("users-add-modal");
    await modal.getByLabel(/Tên đăng nhập|Username/i).fill(username);
    await modal.getByLabel(/Mật khẩu|Password/i).fill(password);
    await modal.locator(".ant-select-selector").click();
    await page.locator(".ant-select-item-option[title='WarehouseOps']").click();
    await modal.getByRole("button", { name: /Tạo người dùng|Create user/i }).click();
    await expect(page.getByTestId(`user-row-${username}`)).toBeVisible();

    // Logout manager → login user mới (flow thật KC)
    await page.getByTestId("logout-button").click();
    await realLogin(page, username, password);
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    // WarehouseOps: KHÔNG thấy nav-users, KHÔNG rơi 403 màn batch (landing đúng quyền)
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    await expect(page.getByTestId("forbidden")).toHaveCount(0);

    // Quay lại manager: set password + disable
    await page.getByTestId("logout-button").click();
    await realLogin(page, "manager", "Password123!");
    await page.goto("/users");
    await page.getByTestId(`user-set-password-${username}`).click();
    const pwModal = page.locator(".ant-modal:visible", { hasText: /Đặt lại mật khẩu|Reset password/i });
    await pwModal.getByLabel(/Mật khẩu|Password/i).fill(newPassword);
    await pwModal.getByRole("button", { name: /Xác nhận|Confirm/i }).click();

    await page.getByTestId(`user-toggle-${username}`).click();
    await page.locator(".ant-popconfirm .ant-btn-primary").click();
    await expect(page.getByTestId(`user-row-${username}`).locator(".ant-tag")).toContainText(/Đã khóa|Disabled/i);

    // Disable → login FAIL (message disabled cụ thể — capture từ trang thật;
    // sau realLogin fail KHÔNG waitForURL pattern auth — wait locator trực tiếp)
    await page.getByTestId("logout-button").click();
    await realLogin(page, username, newPassword);
    await expect(page.locator(".alert-error, #kc-content-wrapper")).toContainText(
      /disabled|không hoạt động|vô hiệu/i,
      { ignoreCase: true, timeout: 15_000 },
    );
  });
});

test.describe("Coordinator — nav ẩn + API 403", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("nav-users ẩn, GET /users 403 PERMISSION_DENIED", async ({ page }) => {
    await page.goto("/hub-store-order/batch");
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    const res = await bffGet(page, "/users");
    expect(res.status()).toBe(403);
    expect((await res.json()) as { code?: string }).toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

test.describe("WarehouseOps — nav ẩn + API 403", () => {
  test.use({ storageState: ".auth/warehouse.json" });

  test("nav-users ẩn, GET /users 403 PERMISSION_DENIED", async ({ page }) => {
    await page.goto("/hub-store-order/batch");
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    const res = await bffGet(page, "/users");
    expect(res.status()).toBe(403);
    expect((await res.json()) as { code?: string }).toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
