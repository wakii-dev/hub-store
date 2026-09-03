/**
 * SF-18 Task 7 — Rule 0 browser walkthrough (không phải test — chạy 1 lần):
 * login THẬT warehouse-emp qua Keycloak → landing D2C → filter → expand →
 * note → export; screenshots từng bước lưu .claude/verify-sf18/.
 * Chạy sau khi stack đã boot (BOOT_ONLY=1 bash scripts/boot-all.sh):
 *   cd e2e && npx tsx walkthrough-sf18.ts
 */
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { E2E_PASSWORD } from "./lib/credentials";

const OUT = `${__dirname}/../.claude/verify-sf18`;
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: import("@playwright/test").Page, name: string) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 1. Login thật warehouse-emp qua Keycloak hosted UI
await page.goto("http://localhost:3000/hub-store-order/d2c");
await page.getByTestId("login-submit").click();
await page.waitForURL("**/protocol/openid-connect/auth**");
await page.locator("#username").fill("warehouse-emp");
await page.locator("#password").fill(E2E_PASSWORD);
await page.locator("#kc-login").click();
await page.waitForURL("**/hub-store-order/d2c**");
await page.getByTestId("d2c-page").waitFor();
await shot(page, "01-login-landing-d2c");

// 2. Filter carrier GHN + khung giờ 08:00-09:00
await page.locator(".ant-select").filter({ hasText: "Hãng vận chuyển" }).click();
await page
  .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
  .filter({ hasText: "GHN" })
  .first()
  .click();
await page.keyboard.press("Escape");
const slot = page.getByPlaceholder("Khung giờ đẩy");
await slot.nth(0).fill("08:00");
await slot.nth(1).fill("09:00");
await slot.nth(1).press("Enter");
await page.getByRole("button", { name: "Tìm kiếm" }).click();
await page.getByText("Tổng 1 đơn").waitFor();
await shot(page, "02-filter-ghn-slot-0809");

// 3. Reset filter → expand D2C-2004
await page.getByRole("button", { name: "Reset" }).click();
await page.locator('[data-row-key="D2C-2004"]').getByText("Chi tiết").click();
await page.getByTestId("d2c-expand-D2C-2004").waitFor();
await shot(page, "03-expand-d2c-2004");

// 4. Note modal tiếng Việt
await page.getByTestId("d2c-row-note-D2C-2003").click();
await page.getByTestId("d2c-note-input").fill("Walkthrough SF-18: giao buổi tối, gọi trước 30 phút.");
await shot(page, "04-note-modal");
await page.getByTestId("d2c-note-save").click();
await page.getByText("Đã lưu ghi chú").waitFor();
await page.getByTestId("d2c-row-note-D2C-2003").click();
await shot(page, "05-note-reopened");
await page.getByTestId("d2c-note-cancel").click();

// 5. Export 40 ngày bị chặn + 31 ngày download
await page.getByPlaceholder("Từ ngày").fill("2026-06-01");
await page.getByPlaceholder("Đến ngày").fill("2026-07-11");
await page.getByPlaceholder("Đến ngày").press("Enter");
await page.getByTestId("d2c-export-button").click();
await page.getByText("Khoảng thời gian export tối đa 31 ngày").waitFor();
await shot(page, "06-export-40d-blocked");
await page.getByPlaceholder("Từ ngày").fill("2026-07-01");
await page.getByPlaceholder("Đến ngày").fill("2026-08-01");
await page.getByPlaceholder("Đến ngày").press("Enter");
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByTestId("d2c-export-button").click(),
]);
await download.saveAs(`${OUT}/07-download-${download.suggestedFilename()}`);
await shot(page, "08-after-export");

await browser.close();
console.log(`[walkthrough] DONE — screenshots + CSV ở ${OUT}`);
