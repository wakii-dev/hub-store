import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * SF-13 Task 9 — intake E2E (spec §5): D1 template download → import
 * preview/confirm (lỗi đúng row/column) → tạo đơn thủ công.
 * Chạy sau 01-04 (tiền tố 05) — MUTATE store: import +8 đơn + 1 đơn tay.
 * DB Postgres PERSIST giữa các run → assertion TƯƠNG ĐỐI: delta tổng qua text
 * "Tổng N mã" + mã mới > max seed ORD-3027 (sequence chỉ tăng).
 * storageState coordinator (default) — import/tạo đơn là quyền Coordinator.
 */

const TEMPLATE_HEADERS =
  "customerName,customerPhone,customerAddress,items,quantity,codAmount,shopHint";
const SEED_MAX = 3027; // seed ORD-3001..3027 — mã mới sinh sau phải lớn hơn

/** 1 dòng CSV import hợp lệ: 1 sản phẩm SL 2 → quantity cell phải = 2. */
function csvRow(i: number, phone: string, quantityCell: number): string {
  return `Khách E2E ${i},${phone},Địa chỉ E2E ${i},SKU-${i}:Sản phẩm ${i}:2,${quantityCell},1500000,30201`;
}

/** 10 dòng: #3 phone sai định dạng, #7 quantity ≠ sum(items) — còn lại hợp lệ. */
function mixedCsv(): string {
  const rows: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const phone = i === 3 ? "12345" : `09012345${String(i).padStart(2, "0")}`;
    rows.push(csvRow(i, phone, i === 7 ? 5 : 2));
  }
  return `${TEMPLATE_HEADERS}\n${rows.join("\n")}`;
}

/** Đúng 8 dòng hợp lệ (bỏ 2 dòng lỗi) — file confirm. */
function validCsv(): string {
  const rows: string[] = [];
  for (let i = 1; i <= 10; i++) {
    if (i === 3 || i === 7) continue;
    rows.push(csvRow(i, `09012345${String(i).padStart(2, "0")}`, 2));
  }
  return `${TEMPLATE_HEADERS}\n${rows.join("\n")}`;
}

async function readTotal(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.getByText(/^Tổng \d+ mã$/).textContent();
  return Number(text!.match(/\d+/)![0]);
}

test("template: nút Tải template trong modal nhập đơn → CSV đúng 7 header thứ tự", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();

  await page.getByTestId("import-orders-button").click();
  const modal = page.locator(".ant-modal").filter({ hasText: "Nhập đơn hàng" });
  await expect(modal).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-template").click(),
  ]);
  const target = path.join(os.tmpdir(), download.suggestedFilename());
  await download.saveAs(target);
  const content = fs.readFileSync(target, "utf8");
  // \r\n từ templateCsv() — normalize trước so sánh chính xác thứ tự header
  expect(content.replace(/\r?\n$/, "")).toBe(TEMPLATE_HEADERS);
});

test("import: preview đúng 2 lỗi (customerPhone/quantity) → confirm disabled → 8 hợp lệ → +8 đơn", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();
  const before = await readTotal(page);

  await page.getByTestId("import-orders-button").click();
  const modal = page.locator(".ant-modal").filter({ hasText: "Nhập đơn hàng" });
  const input = modal.locator('input[type="file"]');

  // Lần 1: 10 dòng (2 lỗi) — preview phải report ĐÚNG row + column
  await input.setInputFiles({
    name: "orders-mixed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(mixedCsv(), "utf8"),
  });
  await expect(page.getByTestId("import-preview")).toBeVisible();
  const errorRows = page.locator('[data-testid^="import-error-row-"]');
  await expect(errorRows).toHaveCount(2);
  await expect(page.getByTestId("import-error-row-3")).toContainText("customerPhone");
  await expect(page.getByTestId("import-error-row-7")).toContainText("quantity");
  // 8 dòng còn lại hợp lệ
  await expect(page.getByTestId("import-valid-count")).toContainText("8");
  // Còn lỗi → chốt Confirm
  await expect(page.getByTestId("import-confirm")).toBeDisabled();

  // Lần 2: chỉ 8 dòng hợp lệ → preview sạch → confirm enable
  await input.setInputFiles({
    name: "orders-valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(validCsv(), "utf8"),
  });
  await expect(page.getByTestId("import-preview")).toBeVisible();
  await expect(page.locator('[data-testid^="import-error-row-"]')).toHaveCount(0);
  const confirm = page.getByTestId("import-confirm");
  await expect(confirm).toBeEnabled();

  // Confirm → chặn response lấy mã thật (tin cậy hơn parse message text)
  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/orders/import/confirm") && r.request().method() === "POST",
  );
  await confirm.click();
  const resp = await respPromise;
  expect(resp.status()).toBe(200);
  const codes: string[] = (await resp.json()).fulfillCodes;
  expect(codes).toHaveLength(8);
  for (const code of codes) {
    expect(code).toMatch(/^ORD-\d+$/);
    expect(Number(code.slice(4)), `${code} phải > max seed`).toBeGreaterThan(SEED_MAX);
  }

  await expect(page.locator(".ant-message")).toContainText("Nhập thành công 8 đơn");
  await expect(modal).toBeHidden();

  // D1 list invalidate → tổng TĂNG ĐÚNG +8 (delta — DB persist giữa các run)
  await expect(page.getByText(`Tổng ${before + 8} mã`)).toBeVisible();

  // Search 1 mã mới → row hiện trong D1
  await page.getByPlaceholder("Số đơn hàng").fill(codes[0]);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page.getByTestId(`fulfill-code-${codes[0]}`)).toBeVisible();
});

test("tạo đơn thủ công: form 1 item → submit → search mã mới trong D1", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();

  await page.getByTestId("create-order-button").click();
  const modal = page.getByTestId("create-order-modal");
  await expect(modal).toBeVisible();

  await page.getByTestId("create-order-customer-name").fill("Khách E2E Thủ Công");
  await page.getByTestId("create-order-customer-phone").fill("0987654321");
  await page.getByTestId("create-order-customer-address").fill("99 Đường E2E, Q.1");
  await page.getByTestId("create-order-item-code-0").fill("SKU-TC");
  await page.getByTestId("create-order-item-name-0").fill("Sản phẩm thủ công");
  await page.getByTestId("create-order-item-qty-0").fill("1");
  await page.getByTestId("create-order-cod-amount").fill("500000");

  const respPromise = page.waitForResponse(
    (r) => r.url().endsWith("/orders") && r.request().method() === "POST",
  );
  await page.getByTestId("create-order-submit").click();
  const resp = await respPromise;
  expect(resp.status()).toBe(201);
  const newCode: string = (await resp.json()).fulfillCode;
  expect(newCode).toMatch(/^ORD-\d+$/);
  expect(Number(newCode.slice(4))).toBeGreaterThan(SEED_MAX);

  await expect(page.locator(".ant-message")).toContainText("Tạo đơn thành công");
  await expect(modal).toBeHidden();

  // Search đúng mã mới → row hiện + expand có items (row tồn tại thật trong list)
  await page.getByPlaceholder("Số đơn hàng").fill(newCode);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  const row = page.locator(`tr[data-row-key="${newCode}"]`);
  await expect(page.getByTestId(`fulfill-code-${newCode}`)).toBeVisible();
  await row.getByRole("button", { name: "Chi tiết" }).click();
  await expect(page.getByTestId(`expand-${newCode}`)).toContainText("SKU-TC");
});
