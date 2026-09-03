import { expect, test, type APIRequestContext } from "@playwright/test";
import { sf11Api, sf11StorageState } from "./sf11-helpers";

/**
 * SF-11 Task 6 — Audit viewer E2E (FI-256, spec §4.6) trên seam sf-11
 * (config playwright.sf11.config.ts — shell :4010, BFF :4085, keycloak :8082).
 *
 * Manager: nav /audit → bảng + phân trang; lọc actor/action; date range WIDE
 * (dateFrom = hôm nay − 7 ngày — vô hiệu hóa edge UTC/HCM).
 * Coordinator + Admin: KHÔNG có nav-audit + goto /audit → forbidden
 * (audit.view Manager-only — PERMISSION_MATRIX).
 *
 * activity_log KHÔNG có data từ seed (emptiness-gate chỉ nạp business tables) —
 * mutation BFF (assign-shop-hub) fire-and-forget logActivity → beforeAll đảm
 * bảo ≥1 row actor 'manager' trước khi assert UI (idempotent: skip nếu đã có).
 */

function vnDate(offsetDays: number): string {
  // Bare YYYY-MM-DD theo múi giờ VN — khớp convention AuditPage/date filter.
  const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000 + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

test.describe("08 audit-viewer — Manager", () => {
  test.use({ storageState: sf11StorageState("manager") });

  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await sf11Api("manager");

    // Đã có audit row cho manager → skip mutation (idempotent re-run).
    const probe = await api.get("/fulfillment/audit?actor=manager&page=1&pageSize=1");
    const probeBody = (await probe.json()) as { total?: number };
    if ((probeBody.total ?? 0) > 0) return;

    // Tạo 1 mutation: assign-shop 1 đơn Chưa soạn (không chia nợ) sang shop khác.
    const filterRes = await api.post("/fulfillment/filter", {
      data: { batchStatus: [0], page: 1, pageSize: 50 },
    });
    expect(filterRes.ok(), `filter fail: ${filterRes.status()}`).toBeTruthy();
    const orders = (await filterRes.json()) as {
      items: Array<{ fulfillCode: string; isDebtSplittingOrder?: boolean; shopAssignment?: { shopCode?: string } }>;
    };
    const shopsRes = await api.get("/master-data/shops");
    const shops = (await shopsRes.json()) as { items?: Array<{ shopCode: string }> };
    const shopCodes = (shops.items ?? []).map((s) => s.shopCode).filter(Boolean);
    expect(shopCodes.length, "cần ≥1 shop từ master-data").toBeGreaterThan(0);

    let assigned = false;
    for (const o of orders.items ?? []) {
      if (o.isDebtSplittingOrder) continue;
      const current = o.shopAssignment?.shopCode;
      const target = shopCodes.find((c) => c !== current);
      if (!target) continue;
      const res = await api.post(`/fulfillment/${o.fulfillCode}/assign-shop-hub`, {
        data: { toShopCode: target },
      });
      if (res.ok()) {
        assigned = true;
        break;
      }
    }
    expect(assigned, "assign-shop phải thành công với ≥1 đơn để tạo audit row").toBeTruthy();

    // logActivity fire-and-forget → poll tối đa ~15s.
    for (let i = 0; i < 15; i++) {
      const res = await api.get("/fulfillment/audit?actor=manager&page=1&pageSize=1");
      const body = (await res.json()) as { total?: number };
      if ((body.total ?? 0) > 0) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("activity_log không có row cho manager sau mutation — kiểm tra BFF FULFILLMENT_DB_* env");
  });

  test("nav-audit → /audit → bảng + phân trang", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-audit")).toBeVisible();
    await page.getByTestId("nav-audit").click();
    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByTestId("audit-page")).toBeVisible();
    await expect(page.getByTestId("audit-table")).toBeVisible();
    await expect(page.locator('[data-testid="audit-table"] tbody tr').first()).toBeVisible();
    // Pagination control — server-paginated pageSize 20.
    await expect(page.locator(".ant-pagination").first()).toBeVisible();
  });

  test("lọc actor 'manager' → rows còn hiển thị", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByTestId("audit-table")).toBeVisible();
    await page.getByTestId("audit-filter-actor").fill("manager");
    // Cột actor (ILIKE %manager%) — row đầu tiên phải chứa 'manager'.
    await expect(page.locator('[data-testid="audit-table"] tbody tr').first()).toContainText("manager");
  });

  test("lọc action 'order.assign_shop' → rows còn hiển thị", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByTestId("audit-table")).toBeVisible();
    await page.getByTestId("audit-filter-action").fill("order.assign_shop");
    await expect(page.locator('[data-testid="audit-table"] tbody tr').first()).toBeVisible();
  });

  test("date range WIDE (từ hôm nay −7d) → rows vẫn hiển thị", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByTestId("audit-table")).toBeVisible();
    const from = vnDate(-7);
    const to = vnDate(0);
    // antd 4.24 RangePicker — 2 input placeholder VI mặc định ("Từ ngày"/"Đến
    // ngày" — fresh context không có hub-store.lang → vi). type + Enter.
    const fromInput = page.getByPlaceholder("Từ ngày");
    const toInput = page.getByPlaceholder("Đến ngày");
    await fromInput.click();
    await fromInput.type(from);
    await toInput.click();
    await toInput.type(to);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    // Mutation today → nằm gọn trong range wide — bảng không rỗng.
    await expect(page.locator('[data-testid="audit-table"] tbody tr').first()).toBeVisible();
  });
});

test.describe("08 audit-viewer — Coordinator bị chặn", () => {
  test.use({ storageState: sf11StorageState("coordinator") });

  test("nav-audit KHÔNG trong DOM + goto /audit → forbidden", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-sidebar")).toBeAttached();
    await expect(page.getByTestId("nav-audit")).toHaveCount(0);
    await page.goto("/audit");
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });
});

test.describe("08 audit-viewer — Admin bị chặn", () => {
  test.use({ storageState: sf11StorageState("admin") });

  test("nav-audit KHÔNG trong DOM + goto /audit → forbidden", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-sidebar")).toBeAttached();
    await expect(page.getByTestId("nav-audit")).toHaveCount(0);
    await page.goto("/audit");
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });
});
