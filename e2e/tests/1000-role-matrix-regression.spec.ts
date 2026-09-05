import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "../lib/credentials";

/**
 * SF-2 (FI-282) — regression 1000: auth + role matrix đầy đủ 5 roles
 * (Coordinator/WarehouseOps/Manager/Admin/WarehouseEmployee).
 *
 * Baseline 02-role-matrix chỉ phủ 3 roles — spec này guard thêm:
 *   - Admin: dashboard.view có, audit.view KHÔNG, printers.manage có.
 *   - WarehouseEmployee: chỉ d2c.view (landing /d2c, còn lại forbidden).
 *   - Logout: về login + SSO session chết (login sau phải qua KC form).
 *   - 401-refresh-fail: token hỏng → API 401 → redirect login (oidc interceptor).
 *
 * Tự lập state (không phụ thuộc mutation của specs 01–09): storageState từ
 * auth.setup per-user + real-login riêng trong describe cuối. KHÔNG import
 * sf11-helpers.ts (quy tắc rubric FI-280 — helper tự chứa).
 */

interface RoleCase {
  user: string;
  /** nav testids PHẢI hiện */
  nav: string[];
  /** nav testids PHẢI ẩn */
  noNav: string[];
  /** route được phép — mount + không forbidden */
  allowed: string;
  /** route bị cấm — forbidden hiện */
  forbidden: string;
}

const CASES: RoleCase[] = [
  {
    user: "coordinator",
    nav: ["nav-orders", "nav-batch", "nav-print", "nav-tech", "nav-areaStaff"],
    noNav: ["nav-dashboard", "nav-users", "nav-d2c", "nav-settlement", "nav-audit", "nav-printers"],
    allowed: "/hub-store-order/batch",
    forbidden: "/hub-store-order/dashboard",
  },
  {
    user: "warehouse",
    nav: ["nav-batch", "nav-print", "nav-areaStaff", "nav-d2c"],
    noNav: ["nav-orders", "nav-tech", "nav-dashboard", "nav-users", "nav-settlement", "nav-audit", "nav-printers"],
    allowed: "/hub-store-order/d2c",
    forbidden: "/hub-store-order/order",
  },
  {
    user: "manager",
    nav: [
      "nav-dashboard", "nav-orders", "nav-batch", "nav-print", "nav-tech",
      "nav-users", "nav-areaStaff", "nav-d2c", "nav-settlement", "nav-audit",
    ],
    noNav: ["nav-printers"],
    allowed: "/audit",
    forbidden: "/printers",
  },
  {
    user: "admin",
    nav: [
      "nav-dashboard", "nav-orders", "nav-batch", "nav-print", "nav-tech",
      "nav-users", "nav-areaStaff", "nav-d2c", "nav-settlement", "nav-printers",
    ],
    noNav: ["nav-audit"],
    allowed: "/printers",
    forbidden: "/audit",
  },
  {
    user: "warehouse-emp",
    nav: ["nav-d2c"],
    noNav: [
      "nav-orders", "nav-batch", "nav-print", "nav-tech", "nav-areaStaff",
      "nav-dashboard", "nav-users", "nav-settlement", "nav-audit", "nav-printers",
    ],
    allowed: "/hub-store-order/d2c",
    forbidden: "/hub-store-order/order",
  },
];

for (const c of CASES) {
  test.describe(`matrix ${c.user}`, () => {
    test.use({ storageState: `.auth/${c.user}.json` });

    test("nav ẩn-hiện đúng PERMISSION_MATRIX", async ({ page }) => {
      await page.goto(c.allowed);
      await expect(page.getByTestId("remote-mount")).toBeVisible();
      for (const tid of c.nav) {
        await expect(page.getByTestId(tid)).toBeVisible();
      }
      for (const tid of c.noNav) {
        await expect(page.getByTestId(tid)).toHaveCount(0);
      }
    });

    test(`route ${c.allowed} vào được, ${c.forbidden} bị chặn`, async ({ page }) => {
      await page.goto(c.allowed);
      await expect(page.getByTestId("forbidden")).toHaveCount(0);
      await expect(page.getByTestId("remote-mount")).toBeVisible();
      await page.goto(c.forbidden);
      await expect(page.getByTestId("forbidden")).toBeVisible();
    });
  });
}

test.describe("Session handling (tự lập state — KHÔNG storageState)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Login thật qua Keycloak hosted UI (độc lập port — realm theo base URL). */
  async function realLogin(page: import("@playwright/test").Page, username: string) {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/protocol/openid-connect/auth**");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.locator("#kc-login").click();
    await page.waitForURL("**/hub-store-order/**");
  }

  test("coordinator login thật → landing D1; logout → login lại phải qua KC form", async ({ page }) => {
    await realLogin(page, "coordinator");
    await expect(page).toHaveURL(/\/hub-store-order\/order$/);
    // Logout
    await page.getByTestId("logout-button").click();
    await expect(page.getByTestId("login-submit")).toBeVisible();
    // SSO session đã end — login lại phải qua Keycloak form (không auto-redirect)
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/protocol/openid-connect/auth**");
    await expect(page.locator("#username")).toBeVisible();
  });

  test("401-refresh-fail (SSO còn sống): token hỏng → 401 → redirect KHÔNG kẹt loop", async ({ page }) => {
    await realLogin(page, "warehouse");
    // Tamper token trong localStorage (oidc-client-ts persist) → reload →
    // API call 401 → interceptor signinRedirect → KC SSO còn sống → quay về
    // /callback?code → PHẢI exchange lại + phục hồi session (silent re-auth).
    // FI-282 [P1][PERM]: /callback chỉ có ở nhánh chưa-login → 404 → loop.
    const oidcKey = await page.evaluate(() =>
      Object.keys(localStorage).find((k) => k.startsWith("oidc.user:")),
    );
    expect(oidcKey).toBeTruthy();
    await page.evaluate((k) => {
      const u = JSON.parse(localStorage.getItem(k)!);
      u.access_token = "TAMPERED_INVALID_TOKEN";
      localStorage.setItem(k, JSON.stringify(u));
    }, oidcKey!);
    await page.goto("/hub-store-order/order");
    // Recovery THẬT (SSO alive): app tự exchange lại code → về landing /batch
    // render đủ content. KHÔNG chấp nhận: 404 treo trong AppLayout (loop
    // FI-282 — nav vẫn hiện trên trang 404 nên nav-visible là dương tính giả).
    await page.waitForURL(/\/hub-store-order\/batch$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Danh sách yêu cầu soạn hàng" })).toBeVisible();
  });
});
