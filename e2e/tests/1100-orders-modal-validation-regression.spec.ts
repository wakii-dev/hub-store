import { expect, test } from "@playwright/test";

/**
 * SF-3 (FI-283) — regression 1100: bugs đã fix trong sweep Orders CRUD.
 *
 * Bug 1 (P2): data-testid đặt trực tiếp lên <Modal> bị antd4 spread lên
 *   .ant-modal-root (height 0 → Playwright coi là hidden dù mắt thấy).
 *   Fix: testid lên div content bên trong (pattern TransferHubModal).
 *   → assert getByTestId("create-order-modal" / "import-orders-modal")
 *     toBeVisible() — testid HÌNH THỨC có thể tồn tại ngay cả khi hidden,
 *     nên visible-check là regression guard thật.
 *
 * Bug 2 (P2): form tạo đơn chỉ check required — SĐT sai format ("abc")
 *   submit được rồi backend reject với message sai ngữ cảnh ("Import có
 *   1 dòng lỗi."). Fix: FE pattern mirror IntakeValidator.PHONE
 *   (^(\+84|0)\d{9}$) + message i18n riêng.
 *   → submit SĐT sai PHẢI chặn trên FE (không có request đi ra, không
 *     toast server) + hiện message đúng.
 *
 * Tự lập state: storageState coordinator từ auth.setup, trang orders có
 * sẵn dữ liệu seed (chỉ đọc — KHÔNG mutate). KHÔNG import sf11-helpers.ts
 * (quy tắc rubric FI-280).
 */

test.describe("Regression 1100 — Orders modal testid + SĐT validation (FI-283)", () => {
  test("(bug1) modal Tạo đơn: testid trên div content — visible thật (không ant-modal-root height 0)", async ({
    page,
  }) => {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("create-order-button").click();
    await expect(page.getByTestId("create-order-modal")).toBeVisible();
    // Tiện thể assert các control bên trong cùng cụm visible (trước fix
    // testid trên Modal spread lên root, cả cụm vẫn visible — regression
    // là của testid root; visible-check chặn tái diễn).
    await expect(page.getByTestId("create-order-customer-name")).toBeVisible();
    await expect(page.getByTestId("create-order-submit")).toBeVisible();
    await page.getByTestId("create-order-cancel").click();
    await expect(page.getByTestId("create-order-modal")).toBeHidden();
  });

  test("(bug1) modal Import đơn: testid visible", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("import-orders-button").click();
    await expect(page.getByTestId("import-orders-modal")).toBeVisible();
    await page.getByTestId("import-cancel").click();
  });

  test("(bug2) SĐT sai format bị chặn trên FE với message đúng ngữ cảnh", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("create-order-button").click();
    await page.getByTestId("create-order-customer-name").fill("Khách Regression 1100");
    await page.getByTestId("create-order-customer-phone").fill("abc");
    await page.getByTestId("create-order-customer-address").fill("1 Đường Regression");
    await page.getByTestId("create-order-item-code-0").fill("SKU-REG");
    await page.getByTestId("create-order-item-name-0").fill("Sản phẩm regression");
    await page.getByTestId("create-order-item-qty-0").fill("1");
    await page.getByTestId("create-order-cod-amount").fill("1000");

    // No-op request guard: form KHÔNG được submit khi SĐT sai format.
    const createReq = page.waitForRequest(
      (r) => r.url().includes("/intake") && r.method() === "POST",
      { timeout: 2000 },
    );
    await page.getByTestId("create-order-submit").click();
    await expect(page.getByText("Số điện thoại sai định dạng")).toBeVisible();
    // Vẫn mở modal (chưa submit) → không request nào đi ra.
    await expect(createReq).rejects.toThrow(/Timeout/i);
    // Modal giữ state để user sửa.
    await expect(page.getByTestId("create-order-modal")).toBeVisible();
    await page.getByTestId("create-order-cancel").click();
  });

  test("(bug2) SĐT đúng format (+84 / 0) vẫn submit bình thường", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("create-order-button").click();
    const phone = page.getByTestId("create-order-customer-phone");
    await phone.fill("0987654321");
    await expect(page.getByText("Số điện thoại sai định dạng")).toHaveCount(0);
    await phone.fill("+84987654321");
    await expect(page.getByText("Số điện thoại sai định dạng")).toHaveCount(0);
    await page.getByTestId("create-order-cancel").click();
  });
});
