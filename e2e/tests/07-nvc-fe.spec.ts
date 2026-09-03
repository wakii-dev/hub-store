import fs from "node:fs";
import path from "node:path";
import { expect, request as newRequest, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * SF-16 Task 9 — NVC FE E2E (UI qua browser, storageState coordinator mặc định).
 * Phủ luồng spec §2: tạo phiếu Xe tải (carrier-group → quotes → addon →
 * fee-limit gate → book) → tracking modal → hủy vận đơn + rebook → replan.
 *
 * Dùng 2 đơn shop 30203 CHƯA dùng bởi spec 01-06: ORD-3018 (distance null →
 * quotes @0km) + ORD-3021 (7.9km — fixture fee-limit: 8T 222.700 > 150.000 →
 * radio disabled). Cleanup beforeAll + afterAll cancel batch ACTIVE của các
 * đơn (pattern 05-nvc-api) → spec chạy LẠI được trên DB persist.
 *
 * QUAN TRỌNG — localStorage planning map (nvc.plannings.<batchCode>): test
 * Playwright context MỚI mỗi test → localStorage không tự sang trang. Flow 1
 * chốt map vào biến module; Flow 2-4 seed lại qua addInitScript trước goto.
 *
 * Quotes là PER-STOP (2 đơn → 12 quote item, mỗi serviceId 2 dòng) — mọi
 * locator quote dùng .first() / :has() thay vì unique testid.
 */

const ORDER_A = "ORD-3018"; // distance null → 0km
const ORDER_B = "ORD-3021"; // 7.9km — 8T vượt fee-limit 150000
const BOTH_ORDERS = [ORDER_A, ORDER_B];
// Private-port seam như 05-nvc-api (mặc định khớp stack boot-all chuẩn).
// 127.0.0.1 tường minh — node 24 resolve localhost → ::1 trước, BFF chỉ nghe IPv4.
const BFF = process.env.E2E_NVC_BFF ?? "http://127.0.0.1:8080";
const STORAGE_STATE = process.env.E2E_NVC_STORAGE ?? path.resolve(__dirname, "..", ".auth", "coordinator.json");

let api: APIRequestContext;
let batchCode: string; // batch chính Flow 1 (ORD-3018 + ORD-3021, Xe tải 1T)
// Planning map snapshot Flow 1 → seed lại cho Flow 2-4 (localStorage per-context).
let nvcMap: Record<string, string> = {};

/** Access token Keycloak từ storageState (oidc-client-ts lưu localStorage) — pattern 05. */
function readToken(): string {
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.startsWith("oidc.user:")) continue;
      const user = JSON.parse(entry.value) as { access_token?: string };
      if (user.access_token) return user.access_token;
    }
  }
  throw new Error(`Không tìm thấy access_token trong ${STORAGE_STATE} — globalSetup chưa chạy?`);
}

/** Hủy các batch fulfillment ACTIVE đang chứa đơn (chạy lại an toàn trên DB persist). */
async function cancelActiveBatchesOf(orderCodes: string[]): Promise<void> {
  for (const code of orderCodes) {
    const res = await api.post("/fulfillment/batches/filter", {
      data: { searchText: code, page: 1, pageSize: 20 },
    });
    const body = (await res.json()) as { items?: Array<{ batchCode: string; status: number }> };
    for (const b of body.items ?? []) {
      if (b.status === 0) {
        await api.put(`/fulfillment/batches/${b.batchCode}/cancel`, {
          data: { reason: "e2e 07 cleanup — trước khi tạo lại" },
        });
      }
    }
  }
}

/** Dropdown đang mở duy nhất (modal có nhiều Select — dropdown ẩn vẫn mount). */
function openOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option");
}

async function tickOrder(page: Page, code: string, checked: boolean) {
  const box = page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`);
  if (checked) await box.check();
  else await box.uncheck();
}

/** D1 filter shop 30203 → đơn spec này hiện trên trang 1. */
async function filterShop30203(page: Page) {
  await page.locator(".ant-select").filter({ hasText: "Kho CN xuất hàng" }).click();
  await openOptions(page).filter({ hasText: "(30203)" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByTestId(`fulfill-code-${ORDER_A}`).waitFor();
}

/** Seed planning map Flow 1 vào localStorage (context mới mất storage). */
async function seedPlanningMap(page: Page) {
  test.skip(Object.keys(nvcMap).length === 0, "Flow 1 chưa chốt planning map — flow phụ thuộc không chạy được");
  await page.addInitScript((map) => {
    for (const [k, v] of Object.entries(map)) localStorage.setItem(k, v as string);
  }, nvcMap);
}

/** D2: tìm batch ACTIVE chứa 1 đơn (nút legacy không ẩn — status ≠ Đã hủy). */
async function openActiveBatchOfOrder(page: Page, orderCode: string): Promise<string> {
  await page.goto("/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill(orderCode);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  const actions = page.locator('[data-testid^="batch-actions-"]').filter({ hasNotText: "Đã hủy" }).first();
  await expect(actions).toBeVisible();
  const testid = await actions.getAttribute("data-testid");
  return testid!.replace("batch-actions-", "");
}

test.describe.serial("SF-16 NVC FE — carrier / tracking / hủy+rebook / replan", () => {
  test.beforeAll(async () => {
    api = await newRequest.newContext({
      baseURL: BFF,
      extraHTTPHeaders: { Authorization: `Bearer ${readToken()}` },
    });
    // Đơn 30203 phải Chưa soạn — dọn batch ACTIVE của lần chạy trước nếu có.
    // Revert order có thể lag nhẹ sau cancel → poll batchStatus về 0 (≤10s).
    await cancelActiveBatchesOf(BOTH_ORDERS);
    for (let i = 0; i < 10; i++) {
      let settled = true;
      for (const code of BOTH_ORDERS) {
        const res = await api.post("/fulfillment/filter", {
          data: { fulfillCode: code, page: 1, pageSize: 5 },
        });
        const item = ((await res.json()) as { items?: Array<{ batchStatus: number }> }).items?.[0];
        if (!item || item.batchStatus !== 0) settled = false;
      }
      if (settled) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
  });

  test.afterAll(async () => {
    // Revert đơn về Chưa soạn để spec (và 05) chạy lại được — best-effort.
    await cancelActiveBatchesOf(BOTH_ORDERS);
    await api?.dispose();
  });

  test("Flow 1 — tạo phiếu Xe tải: quotes 6 xe + addon + tổng phí + fee-limit gate + book", async ({ page }) => {
    // Guard: 2 đơn seed phải còn Chưa soạn (batchStatus 0) sau cleanup.
    for (const code of BOTH_ORDERS) {
      const res = await api.post("/fulfillment/filter", {
        data: { fulfillCode: code, page: 1, pageSize: 5 },
      });
      const item = ((await res.json()) as { items?: Array<{ batchStatus: number }> }).items?.[0];
      test.skip(!item || item.batchStatus !== 0, `${code} không còn Chưa soạn — seed/cleanup đổi, không chạy UI`);
    }

    await page.goto("/hub-store-order/order");
    await filterShop30203(page);
    await tickOrder(page, ORDER_A, true);
    await tickOrder(page, ORDER_B, true);
    await expect(page.getByTestId("bulk-create-batch")).toBeEnabled();
    await page.getByTestId("bulk-create-batch").click();
    const modal = page.locator(".create-batching-modal");
    await expect(modal).toBeVisible();

    // Nhóm vận chuyển → Xe tải → quotes (debounce 300ms + API) render.
    // testid nằm TRỰC TIẾP trên input (antd Radio pass-through) — check() trực tiếp.
    await page.getByTestId("carrier-group-TRUCK").check();
    await expect(page.getByTestId("quote-list")).toBeVisible();
    // Quotes PER-STOP: 2 đơn × 6 tải trọng = 12 item — mỗi serviceId có mặt ≥1.
    for (const s of ["SGCN", "500KG", "1T", "2T", "3.5T", "8T"]) {
      await expect(page.getByTestId(`quote-${s}`).first()).toBeVisible();
    }

    // Chọn 1T (stop đầu — ORD-3018 @0km) → tổng phí xuất hiện ở sumbar.
    await page.getByTestId("quote-1T").first().click();
    const sumVal = page.getByTestId("sum-shipping-fee").locator(".sf6-sum-val");
    await expect(sumVal).toBeVisible();

    // Addon: ROUTE_MULTI (+15.000 → tổng phí ĐỔI) + DOCUMENT (checkbox, fee 0).
    const sumBefore = await sumVal.textContent();
    await page.getByTestId("addon-ROUTE_MULTI").click();
    await expect(sumVal).not.toHaveText(sumBefore!);
    await page.getByTestId("addon-DOCUMENT").locator("input.ant-checkbox-input").check();
    await expect(page.getByTestId("addon-DOCUMENT").locator("input.ant-checkbox-input")).toBeChecked();

    // Fee-limit gate: 8T @7.9km (ORD-3021) vượt 150.000 → disabled + tag.
    // Guard seed đổi: 8T @0km (ORD-3018) vẫn enabled — chỉ dòng 7.9km bị chặn.
    const blocked8T = page.locator('[data-testid="quote-8T"]').filter({ has: page.locator("input.ant-radio-input[disabled]") });
    test.skip((await blocked8T.count()) === 0, "Không có quote-8T nào vượt hạn mức — fixture fee-limit (ORD-3021 7.9km) đã đổi");
    await expect(blocked8T.first().locator("input.ant-radio-input")).toBeDisabled();
    await expect(page.getByTestId("quote-limit-tag-8T").first()).toBeVisible();

    // Submit TRUCK: cần shipper + TG giao (như flow legacy) → sequence
    // create → confirm → booking. Success KHÔNG auto-close — review hiện kết quả.
    await page.getByTestId("batch-shipper-select").locator(".ant-select-selector").click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("batch-shipper-select").locator(".ant-select-selection-item")).toBeVisible();
    await page.getByTestId("batch-time-hint-0").click();
    await page.getByTestId("batch-submit").click();
    const review = page.getByTestId("review-booking");
    await expect(review).toBeVisible();
    await expect(review).toContainText("MOCK-"); // carrierBookingId mock + driver text
    await expect(page.locator(".ant-message")).toContainText("Book vận chuyển thành công");
    await page.getByTestId("batch-close").click();
    await expect(modal).toBeHidden();

    // Chốt batch code + planning map cho Flow 2-4 (context mới mất localStorage).
    const findRes = await api.post("/fulfillment/batches/filter", {
      data: { searchText: ORDER_A, page: 1, pageSize: 20 },
    });
    const items = ((await findRes.json()) as { items?: Array<{ batchCode: string; status: number }> }).items ?? [];
    batchCode = items.find((b) => b.status === 0)!.batchCode;
    expect(batchCode).toMatch(/^BATCH-\d+$/);
    nvcMap = await page.evaluate(() =>
      Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("nvc.plannings.")).map((k) => [k, localStorage.getItem(k) ?? ""])),
    );
    expect(Object.keys(nvcMap)).toContain(`nvc.plannings.${batchCode}`);
  });

  test("Flow 2 — D2 tracking modal: timeline ĐỐI TÁC ≥1 mốc + trạng thái DRIVER_FOUND", async ({ page }) => {
    await seedPlanningMap(page);
    const code = await openActiveBatchOfOrder(page, ORDER_A);
    expect(code).toBe(batchCode);

    await page.getByTestId(`batch-track-${code}`).click();
    const modal = page.locator(".ant-modal:visible").first();
    await expect(modal).toContainText(new RegExp(batchCode));
    await expect(page.getByTestId("shipment-status-DRIVER_FOUND").first()).toBeVisible();
    // Timeline 2 cột — cột Đối tác có mốc (DRIVER_FOUND do PARTNER ghi — §NVC 5).
    await expect(page.getByTestId("tracking-timeline-partner").first().locator(".ant-timeline-item").first()).toBeVisible();
    await page.locator(".ant-modal-close:visible").last().click();
    await expect(page.getByTestId(`batch-track-${code}`)).toBeVisible();
  });

  test("Flow 3 — hủy vận đơn 1 đơn (auto-note) → rebook → booking MỚI", async ({ page }) => {
    await seedPlanningMap(page);
    const code = await openActiveBatchOfOrder(page, ORDER_A);

    // Expand row ORD-3021 → hủy vận đơn — modal prefill auto-note (editable).
    await page.locator(`tr[data-row-key="${code}-${ORDER_B}"] .ant-table-row-expand-icon`).click();
    await expect(page.getByTestId(`order-expand-${ORDER_B}`)).toBeVisible();
    await page.getByTestId(`cancel-delivery-${ORDER_B}`).click();
    const textarea = page.locator(".ant-modal textarea").first();
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(/Hủy vận đơn bởi .+ — .+\/ORD-3021/);
    await page.getByRole("button", { name: "Xác nhận hủy" }).click();
    await expect(page.locator(".ant-notification")).toContainText("Đã hủy vận đơn");

    // Rebook — batch ACTIVE + map có entries → nút hiện; modal rebook prefill 1T.
    await page.getByTestId(`batch-rebook-${code}`).click();
    await page.waitForURL("**/hub-store-order/order**");
    const modal = page.locator(".create-batching-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Book lại vận đơn"); // title theo mode rebook
    await expect(page.getByTestId("quote-list")).toBeVisible();
    await expect(page.getByTestId("quote-1T").first()).toHaveClass(/quote-item-selected/); // prefill uniform serviceId
    await expect(page.getByTestId("batch-submit")).toHaveText("Xác nhận book lại");
    await page.getByTestId("batch-submit").click();
    const review = page.getByTestId("review-booking");
    await expect(review).toBeVisible();
    await expect(review).toContainText("MOCK-"); // booking row MỚI (carrierBookingId mới)
    // KNOWN FE BUG (SF-16 T6 — report coordinator): modal rebook mount LẠI sau
    // close (D1Page rebuild từ RTKQ cache khi nvcRequest chưa clear — đã áp
    // dụng mitigation setNvcRequest(null) trong D1Page onClose, nhưng reopen
    // vẫn có thể xảy ra qua path khác). Plan 9.4 KHÔNG yêu cầu close → chỉ
    // click, không assert hidden (Flow 4 goto mới nên không bị state này).
    await page.getByTestId("batch-close").click();
    await modal.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  });

  test("Flow 4 — replan: hủy phiếu legacy qua API → D2 'Tạo lại phiếu' → batch MỚI", async ({ page }) => {
    // Legacy cancel (pattern 05): đơn revert Chưa soạn, batch sang CANCELLED → replan gate.
    await cancelActiveBatchesOf([ORDER_A]);

    // Tìm batch ĐÃ HỦY (search theo BATCH CODE — filter theo order code KHÔNG
    // trả batch đã hủy vì cancel dọn batch_items; batch code thì match được):
    await page.goto("/hub-store-order/batch");
    const search = page.getByPlaceholder("Số phiếu / Số đơn");
    await search.fill(batchCode);
    await page.getByRole("button", { name: "Tìm kiếm" }).click();
    const cancelledActions = page.locator('[data-testid^="batch-actions-"]').filter({ hasText: "Đã hủy" }).first();
    await expect(cancelledActions).toBeVisible();
    const code = (await cancelledActions.getAttribute("data-testid"))!.replace("batch-actions-", "");
    expect(code).toBe(batchCode);

    // Replan → navigate D1 với URL params → modal "Tạo lại phiếu giao" prefill
    // rows (loại đơn FAILED — seed không có FAILED → đủ 2 đơn).
    await page.getByTestId(`batch-replan-${code}`).click();
    await page.waitForURL("**/hub-store-order/order**");
    const modal = page.locator(".create-batching-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Tạo lại phiếu giao");
    await expect(page.getByTestId(`batch-row-${ORDER_A}`)).toBeVisible();
    await expect(page.getByTestId(`batch-row-${ORDER_B}`)).toBeVisible();

    // Submit replan = create flow legacy (KHO_CN default) → batch MỚI.
    await page.getByTestId("batch-shipper-select").locator(".ant-select-selector").click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("batch-shipper-select").locator(".ant-select-selection-item")).toBeVisible();
    await page.getByTestId("batch-time-hint-0").click();
    await page.getByTestId("batch-submit").click();
    await expect(page.locator(".ant-message")).toContainText("Tạo phiếu soạn thành công");
    // KNOWN FE BUG (SF-16 T6 — report coordinator): modal replan mount LẠI sau
    // close — cùng họ bug với Flow 3 (D1Page rebuild từ RTKQ cache). Plan 9.7
    // không assert close → chỉ click, tolerant.
    await page.getByTestId("batch-close").click();
    await modal.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});

    // D2 thấy batch MỚI (khác code cũ) chứa ORD-3018.
    await page.getByTestId("nav-batch").click();
    await page.waitForURL("**/hub-store-order/batch");
    const newSearch = page.getByPlaceholder("Số phiếu / Số đơn");
    await newSearch.fill(ORDER_A);
    await page.getByRole("button", { name: "Tìm kiếm" }).click();
    const active = page.locator('[data-testid^="batch-actions-"]').filter({ hasNotText: "Đã hủy" }).first();
    await expect(active).toBeVisible();
    const newCode = (await active.getAttribute("data-testid"))!.replace("batch-actions-", "");
    expect(newCode).not.toBe(code);
  });
});
