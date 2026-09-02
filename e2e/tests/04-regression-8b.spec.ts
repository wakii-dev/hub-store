import { expect, test, type Page } from "@playwright/test";

/**
 * SF-11 Task 10 — §8b regression: các dòng CHƯA phủ bởi 01-03.
 * 01 main-flow đã phủ: D1.1/3/4/5, D1b.1-7, D2.1/4, D3.1-4.
 * 03 audit đã phủ: D2.5 (COD format).
 * Spec này phủ: D1.2 (filter trạng thái), D1.6 (chuyển kho modal),
 * D1.7 (expand row), D1.8 (pagination + goto), D1.9 (URL state),
 * D2.2 (search mã phiếu), D2.3 (filter trạng thái phiếu).
 * Chạy CUỐI (tiền tố 04) — đọc state do 01 tạo ra (batch hoàn tất).
 */

/** Dropdown đang mở duy nhất (dropdown ẩn vẫn mount trong DOM). */
function openOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option");
}

const ROLE_LABEL: Record<string, string> = {
  Coordinator: "Điều phối",
  WarehouseOps: "Vận hành kho",
  Manager: "Quản lý",
};

async function login(page: Page, role: string) {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("login-page").waitFor();
  await page.getByTestId("login-role").locator(".ant-select-selector").click();
  await openOptions(page).filter({ hasText: ROLE_LABEL[role] }).click();
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/hub-store-order/**");
}

async function gotoPage(page: Page, pageInput: string) {
  await page.locator(".ant-pagination-options-quick-jumper input").fill(pageInput);
  await page.locator(".ant-pagination-options-quick-jumper input").press("Enter");
}

test("§8b D1.7+D1.8: expand row items[] + pagination Tổng N / page size 10 / goto page", async ({ page }) => {
  await login(page, "Coordinator");
  await expect(page.getByText("Danh sách đơn hàng kho chi nhánh")).toBeVisible();

  // D1.8: Tổng N mã đúng (27 đơn seed) + page size 10
  await expect(page.getByText("Tổng 27 mã")).toBeVisible();
  await expect(page.locator(".ant-table-tbody tr.ant-table-row")).toHaveCount(10);

  // goto page 2 → active page + URL sync
  await gotoPage(page, "2");
  await expect(page.locator(".ant-pagination-item-active")).toHaveText("2");
  await expect(page).toHaveURL(/page=2&pageSize=10/);

  // D1.7: expand row → items[] sản phẩm (Mã SP + tên + SL)
  await page.locator(".ant-table-tbody tr.ant-table-row .ant-table-row-expand-icon").first().click();
  await expect(page.locator(".ant-table-expanded-row")).toContainText("Mã SP");
  await expect(page.locator(".ant-table-expanded-row")).toContainText(/PRD-\d+/);
});

test("§8b D1.2+D1.9: filter Chưa soạn + URL state reload giữ nguyên filter", async ({ page }) => {
  // D1.9a: URL filters → render đúng state (useUrlState)
  await login(page, "Coordinator");
  await page.locator(".ant-select").filter({ hasText: "Trạng thái soạn hàng" }).click();
  await openOptions(page).filter({ hasText: "Chưa soạn" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByTestId("fulfill-code-ORD-3013").waitFor();

  // D1.2: chỉ đơn Chưa soạn — không row nào mang tag trạng thái khác
  const rows = page.locator(".ant-table-tbody tr.ant-table-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toContainText("Chưa soạn");
  }

  // D1.9b: reload → filter giữ nguyên (URL state)
  await page.reload();
  await expect(page.locator(".ant-select-selection-item").filter({ hasText: "Chưa soạn" })).toBeVisible();
  await page.getByTestId("fulfill-code-ORD-3013").waitFor();
  await expect(page.locator(".ant-table-tbody tr.ant-table-row").first()).toContainText("Chưa soạn");
});

test("§8b D1.6: tick 1 đơn → Chuyển kho modal select kho đích + lịch sử", async ({ page }) => {
  await login(page, "Coordinator");
  const box = page.locator('tr[data-row-key="ORD-3001"] .ant-checkbox-input');
  await box.check();
  await expect(page.getByTestId("bulk-transfer")).toBeEnabled();
  await page.getByTestId("bulk-transfer").click();

  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("ORD-3001");
  await expect(modal).toContainText(/Kho hiện tại: .*30201/);
  // Kho đích select + Xác nhận disabled khi chưa chọn kho
  await expect(modal.getByText("Kho đích").first()).toBeVisible();
  await expect(modal.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
  // Lịch sử chuyển kho table
  await expect(modal).toContainText("Lịch sử chuyển kho");
});

test("§8b D2.2+D2.3: D2 search theo mã phiếu + filter trạng thái phiếu", async ({ page }) => {
  await login(page, "Coordinator");
  await page.getByTestId("nav-batch").click();
  await page.waitForURL("**/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();

  // Tìm batch của ORD-3001 (01 đã tạo + hoàn tất → trạng thái Hoàn tất).
  // Đơn từng thuộc phiếu ĐÃ HỦY (test 1) vẫn match — lấy nhóm "Hoàn tất".
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill("ORD-3001");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  const actions = page
    .locator('[data-testid^="batch-actions-"]')
    .filter({ hasText: "Hoàn tất" })
    .first();
  await expect(actions).toBeVisible();
  const batchCode = (await actions.getAttribute("data-testid"))!.replace("batch-actions-", "");

  // D2.2: search theo MÃ PHIẾU → trả về đúng duy nhất phiếu đó
  await search.fill(batchCode);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page.locator(`[data-testid="batch-actions-${batchCode}"]`)).toBeVisible();
  await expect(page.locator('[data-testid^="batch-actions-"]')).toHaveCount(1);

  // D2.3: filter trạng thái = Hoàn tất → phiếu vẫn còn; Đã hủy → phiếu biến mất
  // (sau khi chọn, select hiển thị selection thay placeholder — match cả hai)
  const statusSelect = page
    .locator(".ant-select")
    .filter({ hasText: /Trạng thái phiếu|Hoàn tất/ });
  await statusSelect.click();
  await openOptions(page).filter({ hasText: "Hoàn tất" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page.locator(`[data-testid="batch-actions-${batchCode}"]`)).toBeVisible();

  await statusSelect.click();
  // mode=multiple — click lại option đang chọn (✓) để BỎ chọn
  await openOptions(page).filter({ hasText: "Hoàn tất" }).first().click();
  await openOptions(page).filter({ hasText: "Đã hủy" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page.locator(`[data-testid="batch-actions-${batchCode}"]`)).toHaveCount(0);
});
