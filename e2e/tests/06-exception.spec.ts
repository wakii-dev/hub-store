import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * SF-13 Task 9 — exception E2E (spec §5): tạo phiếu từ 2 đơn Chưa soạn →
 * hoàn tất soạn → mark-fail (lý do + note) → audit → giao lại → đơn mới có
 * old-order-link + audit → double-redeliver bị server chặn 422.
 * Chạy CUỐI (tiền tố 06) — đọc state 01 tạo (3001-3003 Đã soạn) + MUTATE 2 đơn mới.
 * Test 1 coordinator (tạo phiếu + hoàn tất) — tests 2-4 warehouse (fail/redeliver).
 * DB Postgres persist giữa các run → chọn đơn TƯƠNG ĐỐI (2 hàng đầu filter
 * 30201 + Chưa soạn), KHÔNG hardcode mã đơn.
 * Chia state qua biến module — workers=1, thứ tự khai báo = thứ tự chạy.
 */

let batchCode = "";
let failCode = ""; // đơn bị mark-fail + giao lại
let secondCode = ""; // đơn còn lại trong phiếu
let newCode = ""; // đơn giao lại sinh ra

/** Dropdown đang mở duy nhất (dropdown ẩn vẫn mount trong DOM). */
function openOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option");
}

async function tickOrder(page: Page, code: string, checked: boolean) {
  const box = page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`);
  if (checked) await box.check();
  else await box.uncheck();
}

/** Tạo phiếu từ các đơn đã tick (pattern spec 01 — shipper + TG giao + submit). */
async function createBatch(page: Page) {
  await expect(page.getByTestId("bulk-create-batch")).toBeEnabled();
  await page.getByTestId("bulk-create-batch").click();
  const modal = page.locator(".create-batching-modal");
  await expect(modal).toBeVisible();
  // SF-28 T7 — wizard step 1 (preset) mới thêm → advance sang step cũ trước
  // khi thao tác shipper/TG giao.
  await page.getByTestId("batch-continue").click();
  await page.getByTestId("batch-shipper-select").locator(".ant-select-selector").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("batch-shipper-select").locator(".ant-select-selection-item"),
  ).toBeVisible();
  await page.getByTestId("batch-time-hint-0").click();
  await page.getByTestId("batch-submit").click();
  await expect(page.locator(".ant-message")).toContainText("Tạo phiếu soạn thành công");
  await expect(modal).toBeHidden();
}

/** Cross-remote sang D2, search theo mã đơn, trả batchCode của phiếu đang hoạt động. */
async function openBatchOfOrder(page: Page, orderCode: string): Promise<string> {
  await page.getByTestId("nav-batch").click();
  await page.waitForURL("**/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill(orderCode);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  const actions = page
    .locator('[data-testid^="batch-actions-"]')
    .filter({ hasNotText: "Đã hủy" })
    .first();
  await expect(actions).toBeVisible();
  return (await actions.getAttribute("data-testid"))!.replace("batch-actions-", "");
}

/** D2 (storageState hiện tại) search mã đơn → mở expand của đơn đó. */
async function expandOrderOnD2(page: Page, orderCode: string) {
  await page.goto("/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill(orderCode);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  const row = page.locator(`tr[data-row-key$="-${orderCode}"]`);
  await expect(row).toBeVisible();
  await row.locator(".ant-table-row-expand-icon").click();
  await expect(page.getByTestId(`order-expand-${orderCode}`)).toBeVisible();
}

// ---------------------------------------------------------------------------
// AUDIT PATTERN (SF-13): audit KHÔNG có màn hình FE → E2E gọi REST BFF trực tiếp
// (GET /orders/:code/audit). Playwright request KHÔNG tự gắn Bearer — interceptor
// axios của app không chạy ngoài app context → đọc access_token từ user
// oidc-client-ts persist trong window.localStorage (key "oidc.user:<authority>:
// <client_id>" — ENUMERATE keys, không hardcode authority/client_id), rồi
// request.get với header Authorization. Token từ storageState có thể hết hạn giữa
// suite → 401 thì reload 1 lần (silent renew refresh + persist lại) rồi thử lại.
// ---------------------------------------------------------------------------

async function getAccessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("oidc.user:"));
    if (!key) throw new Error("Không tìm thấy oidc user trong localStorage");
    const user = JSON.parse(localStorage.getItem(key) ?? "null") as { access_token?: string } | null;
    if (!user?.access_token) throw new Error(`oidc user ${key} thiếu access_token`);
    return user.access_token;
  });
}

interface AuditEntry {
  action: string;
  actor: string;
  target: string;
  detail: { reason?: string; note?: string } | null;
}

async function getAudit(page: Page, request: APIRequestContext, code: string): Promise<AuditEntry[]> {
  const call = (token: string) =>
    request.get(`http://localhost:8080/orders/${code}/audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  let res = await call(await getAccessToken(page));
  if (res.status() === 401) {
    await page.reload();
    await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
    res = await call(await getAccessToken(page));
  }
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { items: AuditEntry[] }).items;
}

test("chuẩn bị: tick 2 đơn Chưa soạn 30201 → tạo phiếu → hoàn tất soạn", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();

  // Filter kho 30201 (pattern spec 01) + Chưa soạn → các đơn chưa dùng batch
  await page.locator(".ant-select").filter({ hasText: "Kho CN xuất hàng" }).click();
  await openOptions(page).filter({ hasText: "(30201)" }).first().click();
  await page.locator(".ant-select").filter({ hasText: "Trạng thái soạn hàng" }).click();
  await openOptions(page).filter({ hasText: "Chưa soạn" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();

  // 2 hàng đầu trang = 2 đơn Chưa soạn chưa dùng (mã đọc động — DB persist)
  const keys = (await page
    .locator(".ant-table-tbody tr.ant-table-row")
    .evaluateAll((rows) =>
      rows.map((r) => r.getAttribute("data-row-key")).filter((k): k is string => Boolean(k)),
    )) as string[];
  expect(keys.length, "phải còn ≥2 đơn Chưa soạn 30201").toBeGreaterThanOrEqual(2);
  [failCode, secondCode] = keys.slice(0, 2);

  await tickOrder(page, failCode, true);
  await tickOrder(page, secondCode, true);
  await createBatch(page);

  batchCode = await openBatchOfOrder(page, failCode);
  expect(batchCode).toMatch(/^BATCH-\d+$/);

  // Hoàn tất soạn → batchStatus 1→2 (đủ điều kiện mark-fail/giao lại)
  await page
    .getByTestId(`batch-actions-${batchCode}`)
    .getByRole("button", { name: "Hoàn tất soạn" })
    .click();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.locator(".ant-message")).toContainText(`Đã hoàn tất phiếu ${batchCode}`);
});

test.describe("warehouse ops (storageState warehouse)", () => {
  test.use({ storageState: ".auth/warehouse.json" });

  test("mark-fail: lý do 'Khách vắng' + note → fail-tag + audit order.failed", async ({ page, request }) => {
    await expandOrderOnD2(page, failCode);

    await page.getByTestId(`mark-fail-button-${failCode}`).click();
    const modal = page.getByTestId("mark-fail-modal");
    await expect(modal).toBeVisible();

    await page.getByTestId("fail-reason-select").locator(".ant-select-selector").click();
    await openOptions(page).filter({ hasText: "Khách vắng" }).first().click();
    await page.getByTestId("fail-note").fill("Khách không có nhà — E2E SF-13");
    await page.getByTestId("fail-submit").click();

    await expect(page.locator(".ant-message")).toContainText(
      `Đã mark đơn ${failCode} giao thất bại`,
    );
    // Hydration refetch sau mutation → tag lý do hiện trong expand
    await expect(page.getByTestId(`fail-tag-${failCode}`)).toBeVisible();

    // Audit (pattern ở đầu file): entry order.failed với đúng lý do
    const entries = await getAudit(page, request, failCode);
    const failed = entries.find((e) => e.action === "order.failed");
    expect(failed, `audit ${failCode} phải có order.failed: ${JSON.stringify(entries)}`).toBeTruthy();
    expect(failed!.detail?.reason).toBe("KHACH_VANG");
    expect(failed!.detail?.note).toContain("E2E");
  });

  test("giao lại: đơn FAILED → đơn mới + old-order-link + audit 2 chiều", async ({ page, request, browser }) => {
    await expandOrderOnD2(page, failCode);

    const respPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/orders/${failCode}/redeliver`) && r.request().method() === "POST",
    );
    await page.getByTestId(`redeliver-button-${failCode}`).click();
    const resp = await respPromise;
    expect(resp.status()).toBe(201);
    newCode = ((await resp.json()) as { fulfillCode: string }).fulfillCode;
    expect(newCode).toMatch(/^ORD-\d+$/);
    await expect(page.locator(".ant-message")).toContainText(`Đã tạo đơn giao lại ${newCode}`);

    // Audit: đơn mới order.redelivered (detail trỏ đơn gốc) + đơn gốc order.failed
    const newEntries = await getAudit(page, request, newCode);
    expect(newEntries.some((e) => e.action === "order.redelivered")).toBe(true);
    const oldEntries = await getAudit(page, request, failCode);
    expect(oldEntries.some((e) => e.action === "order.failed")).toBe(true);

    // D1 là route Coordinator (warehouse bị 403) → context coordinator riêng
    const ctx = await browser.newContext({
      storageState: path.join(__dirname, "..", ".auth", "coordinator.json"),
      baseURL: "http://localhost:3000",
    });
    try {
      const cPage = await ctx.newPage();
      await cPage.goto("/hub-store-order/order");
      await cPage.getByPlaceholder("Số đơn hàng").fill(newCode);
      await cPage.getByRole("button", { name: "Tìm kiếm" }).click();
      await expect(cPage.getByTestId(`fulfill-code-${newCode}`)).toBeVisible();
      // Expand đơn mới → link Đơn gốc trỏ đúng mã đơn FAILED
      await cPage
        .locator(`tr[data-row-key="${newCode}"]`)
        .getByRole("button", { name: "Chi tiết" })
        .click();
      await expect(cPage.getByTestId(`expand-${newCode}`)).toBeVisible();
      await expect(cPage.getByTestId("old-order-link")).toContainText(failCode);
    } finally {
      await ctx.close();
    }
  });

  test("double-redeliver chặn: Giao lại lần nữa → server 422 + message lỗi", async ({ page }) => {
    await expandOrderOnD2(page, failCode);

    // FE luôn hiện nút Giao lại trên đơn FAILED (server là chốt cuối — plan T8)
    const button = page.getByTestId(`redeliver-button-${failCode}`);
    await expect(button).toBeVisible();
    const respPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/orders/${failCode}/redeliver`) && r.request().method() === "POST",
    );
    await button.click();
    const resp = await respPromise;
    expect(resp.status()).toBe(422); // INVALID_ARGUMENT — "Đơn đã được giao lại."
    await expect(page.locator(".ant-message")).toContainText("Thao tác thất bại");
  });
});
