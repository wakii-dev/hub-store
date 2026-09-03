import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { sf11StorageState } from "./sf11-helpers";

/**
 * SF-11 Task 6 — Export CSV D1 E2E (FI-256, spec §4.6) trên seam sf-11.
 * Manager: D1 → Export (testid export-csv-button) → download event + dòng đầu
 * = CSV header; filter không match → KHÔNG download + message.info; URL state
 * createdFrom ≠ createdTo (useUrlState flat params — utils/filters.ts) →
 * button disabled + Tooltip.
 */

test.use({ storageState: sf11StorageState("manager") });

test("export happy path → download event + file dòng đầu là CSV header", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  const button = page.getByTestId("export-csv-button");
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const target = path.join(os.tmpdir(), `sf11-export-${Date.now()}.csv`);
  await download.saveAs(target);
  const content = fs.readFileSync(target, "utf8");
  fs.unlinkSync(target);
  // BFF prepend BOM \uFEFF — strip trước assert header.
  const firstLine = content.replace(/^\uFEFF/, "").split(/\r?\n/)[0];
  expect(firstLine.startsWith("fulfillCode,orderCode,batchStatus")).toBeTruthy();
});

test("filter không match → KHÔNG download + message.info", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  const button = page.getByTestId("export-csv-button");
  await expect(button).toBeVisible();

  // TextSearch fulfillCode (placeholder i18n VI mặc định: "Số đơn hàng") → ZZZZZ.
  await page.getByPlaceholder("Số đơn hàng").fill("ZZZZZ");
  await page.getByPlaceholder("Số đơn hàng").press("Enter");
  // Chờ table rỗng (filter đã áp) — EmptyState custom (EmptyState shared,
  // KHÔNG .ant-empty) → assert 0 data row (locale-agnostic).
  await expect(page.locator(".ant-table-tbody .ant-table-row")).toHaveCount(0, { timeout: 20_000 });

  let downloaded: string | null = null;
  page.on("download", (d) => {
    downloaded = d.suggestedFilename();
  });
  await button.click();
  // message.info(i18n 'export.empty') — assert locale-agnostic (.ant-message-notice).
  await expect(page.locator(".ant-message-notice").first()).toBeVisible({ timeout: 15_000 });
  // Không có download event sau khi message hiện + grace 2s.
  await page.waitForTimeout(2000);
  expect(downloaded, "không được tải file khi CSV header-only").toBeNull();
});

test("createdFrom ≠ createdTo (URL state) → button disabled + Tooltip", async ({ page }) => {
  await page.goto("/hub-store-order/order?createdFrom=2026-08-01&createdTo=2026-08-05");
  const button = page.getByTestId("export-csv-button");
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  // Disabled button — Playwright hover actionability treo; dùng mouse.move thẳng
  // vào tọa độ để trigger Tooltip wrapper (antd Tooltip bọc disabled child).
  const box = await button.boundingBox();
  expect(box, "button có bounding box").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(500); // tooltip delay
  await expect(page.locator(".ant-tooltip").first()).toBeVisible();
});
