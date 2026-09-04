import fs from "node:fs";
import path from "node:path";
import { expect, request as newRequest, test, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "../lib/credentials";

/**
 * SF-8 — Users management: Manager list/tạo/login-user-mới/set-password/
 * disable; Coordinator+WarehouseOps nav ẩn + API 403 (Bearer thật từ OIDC
 * storage — KHÔNG dùng cookie-only vì BFF verify Bearer → 401 nếu thiếu).
 */

const BFF = process.env.E2E_BFF_URL ?? "http://localhost:8080"; // private-port seam (SF-15/SF-14 precedent)

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
 * realLogin của 02-spec describe-scoped + hardcode password manager —
 * SF-12: import E2E_PASSWORD từ lib/credentials).
 * SF-7 QA: logout-button → signoutRedirect là NAVIGATION async (end_session
 * → post_logout redirect về origin root). goto("/") ngay sau click abort
 * navigation giữa chừng → KC SSO cookie không được clear → login tiếp bị
 * silent-SSO (không bao giờ thấy form). Chờ logout HOÀN TẤT trước. */
async function waitLoggedOut(page: Page): Promise<void> {
  const origin = process.env.E2E_SHELL_URL ?? "http://localhost:3000";
  await page.waitForURL(`${origin}/`);
}

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

  // SF-7 QA FI-287: user test `e2e-user-*` (disable-only, KC persist) tích tụ
  // qua mỗi lần chạy → list FE phân trang client-side 10/trang → user seeded
  // (warehouse) rớt khỏi trang 1 → assert row timeout. Dọn hẳn (DELETE /users
  // — SF-7 thêm route) TRƯỚC mỗi lần chạy để list về bộ seeded.
  test.beforeAll(async () => {
    const storagePath = path.resolve(__dirname, "..", ".auth", "manager.json");
    const state = JSON.parse(fs.readFileSync(storagePath, "utf8")) as {
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
    };
    let token = "";
    for (const origin of state.origins ?? []) {
      for (const entry of origin.localStorage ?? []) {
        if (!entry.name.startsWith("oidc.user:")) continue;
        const user = JSON.parse(entry.value) as { access_token?: string };
        if (user.access_token) token = user.access_token;
      }
    }
    expect(token, "manager storageState phải có access_token").toBeTruthy();
    const api = await newRequest.newContext({
      baseURL: BFF,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });
    const res = await api.get("/users");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { items?: Array<{ id: string; username: string }> };
    for (const u of body.items ?? []) {
      if (u.username.startsWith("e2e-user-")) {
        await api.delete(`/users/${u.id}`);
      }
    }
    await api.dispose();
  });

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
    await waitLoggedOut(page);
    await realLogin(page, username, password);
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    // WarehouseOps: KHÔNG thấy nav-users, KHÔNG rơi 403 màn batch (landing đúng quyền)
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    await expect(page.getByTestId("forbidden")).toHaveCount(0);

    // Quay lại manager: set password + disable
    await page.getByTestId("logout-button").click();
    await waitLoggedOut(page);
    await realLogin(page, "manager", E2E_PASSWORD);
    // SF-7 QA: realLogin không chờ post-login — goto("/") ngay sẽ đua với
    // callback processing (OIDC code exchange) → mất session, rơi về login.
    await page.waitForURL("**/hub-store-order/**");
    await page.goto("/users");
    await page.getByTestId(`user-set-password-${username}`).click();
    const pwModal = page.locator(".ant-modal:visible", { hasText: /Đặt lại mật khẩu|Reset password/i });
    await pwModal.getByLabel(/Mật khẩu|Password/i).fill(newPassword);
    await pwModal.getByRole("button", { name: /Xác nhận|Confirm/i }).click();

    await page.getByTestId(`user-toggle-${username}`).click();
    await page.locator(".ant-popconfirm .ant-btn-primary").click();
    // SF-7 QA: row có 2 .ant-tag (status sf6-status-tag + role tag từ SF-6)
    // → locator chung rơi strict-mode violation; nhắm đúng status tag.
    await expect(
      page.getByTestId(`user-row-${username}`).locator(".ant-tag.sf6-status-tag"),
    ).toContainText(/Đã khóa|Disabled/i);

    // Disable → login FAIL (message disabled cụ thể — capture từ trang thật;
    // sau realLogin fail KHÔNG waitForURL pattern auth — wait locator trực tiếp)
    // SF-7 QA: KC 26 theme Patternfly v5 — message nằm trong .pf-v5-c-alert
    // (selector cũ .alert-error/#kc-content-wrapper là theme KC cũ).
    await page.getByTestId("logout-button").click();
    await waitLoggedOut(page);
    await realLogin(page, username, newPassword);
    await expect(page.locator(".pf-v5-c-alert")).toContainText(
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
