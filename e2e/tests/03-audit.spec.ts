import { expect, test, type Page } from "@playwright/test";

/**
 * SF-11 Task 5+6 — i18n audit BINARY (zero missing-key warning VI/EN trên
 * 5 screens: D1, D1b, D1c, D2, D3) + COD format audit
 * (VI `15.000.000đ` / EN `15,000,000 ₫`) + formatPeriodOfTime nhất quán.
 * Chạy sau 01-main-flow (dùng BATCH-0001 seed + batch vừa tạo).
 */

const MISSING_KEY = /missingKey|i18next::|The .* key.*missing/i;

async function login(page: Page) {
  await page.goto("/hub-store-order/order");
  await page.getByTestId("login-page").waitFor();
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/hub-store-order/**");
}

async function visitAllScreens(page: Page) {
  // D1 + filters render
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();

  // D1c transfer modal (1 row selection) — waitFor thật (không .catch nuốt lỗi)
  await page.locator('tr[data-row-key="ORD-3004"] .ant-checkbox-input').check();
  await page.getByTestId("bulk-transfer").click();
  // wait locale-agnostic (test chạy cả VI lẫn EN — không assert text ngôn ngữ nào)
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  // đóng qua nút X (Escape không reliable — focus có khi không nằm trong modal)
  await page.locator(".ant-modal .ant-modal-close").first().click();
  // chờ modal đóng xong (animation) — .ant-modal-wrap còn sống sẽ cản click uncheck
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10_000 });
  await page.locator('tr[data-row-key="ORD-3004"] .ant-checkbox-input').uncheck();

  // D1b modal (3 rows cùng kho)
  for (const code of ["ORD-3001", "ORD-3002", "ORD-3003"]) {
    await page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`).check();
  }
  await page.getByTestId("bulk-create-batch").click();
  await expect(page.locator(".create-batching-modal")).toBeVisible();
  await page.getByTestId("batch-packing-suggest").click();
  await expect(page.getByTestId("batch-groups")).toBeVisible();
  await page.getByTestId("batch-close").click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10_000 });
  for (const code of ["ORD-3001", "ORD-3002", "ORD-3003"]) {
    await page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`).uncheck();
  }

  // D2
  await page.getByTestId("nav-batch").click();
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  await expect(page.locator('[data-testid^="batch-actions-"]').first()).toBeVisible();

  // D3 (seed batch ACTIVE BATCH-0001)
  await page.goto("/hub-store-order/batch/print?batchCode=BATCH-0001");
  await expect(page.getByRole("tab", { name: /.+/ }).first()).toBeVisible();
  await page.locator(".print-preview-area canvas").first().waitFor({ timeout: 45_000 });
}

test("i18n binary: VI+EN qua 5 screens — zero missing-key warning", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (MISSING_KEY.test(msg.text())) warnings.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    if (MISSING_KEY.test(err.message)) warnings.push(`[pageerror] ${err.message}`);
  });

  await login(page);
  await visitAllScreens(page);

  // Toggle EN (lang-toggle hiển thị ngược locale hiện tại) + đi lại toàn bộ
  const toggleText = (await page.getByTestId("lang-toggle").textContent())?.trim();
  await page.getByTestId("lang-toggle").click();
  await expect(page.getByTestId("lang-toggle")).toHaveText(toggleText === "EN" ? "VI" : "EN", { ignoreCase: false });
  await visitAllScreens(page);

  expect(warnings, `Missing-key warnings:\n${warnings.join("\n")}`).toHaveLength(0);
});

test("COD format: VI '1.850.000đ' → EN '1,850,000 ₫' + formatPeriodOfTime nhất quán", async ({ page }) => {
  await login(page);
  const periodRe = /\d{2}:\d{2} \d{2}\/\d{2}\/\d{4} – \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/;
  const codVn = /^\d{1,3}(\.\d{3})+đ$/;
  const codEn = /^\d{1,3}(,\d{3})+ ₫$/;
  const collectCods = async () =>
    (await page.locator("td").allTextContents())
      .map((t) => t.trim())
      .filter((t) => /^\d[\d.,\s]*[đ₫]$/.test(t)); // chỉ cell tiền tệ — không nhầm cell text có chữ đ

  // VI pass — D1 period + D2 COD
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();
  await expect(page.locator("td", { hasText: periodRe }).first()).toBeVisible();
  await page.goto("/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  await expect(page.locator('[data-testid^="batch-actions-"]').first()).toBeVisible();
  const codsVi = await collectCods();
  expect(codsVi.length, "phải có ≥1 cell COD để audit").toBeGreaterThan(0);
  expect(codsVi.filter((t) => !codVn.test(t)), `COD VI sai format: ${codsVi.join(", ")}`).toHaveLength(0);

  // EN pass — toggle + lại D1/D2
  await page.getByTestId("lang-toggle").click();
  await page.goto("/hub-store-order/order");
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();
  await expect(page.locator("td", { hasText: periodRe }).first()).toBeVisible();
  await page.goto("/hub-store-order/batch");
  await expect(page.locator('[data-testid^="batch-actions-"]').first()).toBeVisible();
  const codsEn = await collectCods();
  expect(codsEn.length).toBeGreaterThan(0);
  expect(codsEn.filter((t) => !codEn.test(t)), `COD EN sai format: ${codsEn.join(", ")}`).toHaveLength(0);
});
