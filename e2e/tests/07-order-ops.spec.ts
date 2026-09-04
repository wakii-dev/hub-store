import { expect, test, type Page } from "@playwright/test";
import { request as newApiContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * SF-28 Task 9 — D1 order ops (transfer ticket · delivery slots · wizard
 * preset · role gates · note verify):
 * 1. Coordinator: ORD-3004 → modal transfer-hub-modal → search kho → lý do →
 *    confirm → badge transfer-badge-ORD-3004 → history modal row PENDING.
 * 2. Chặn tách nợ: ORD-3006 (seed isDebtSplittingOrder=true) → nút
 *    bulk-transfer-ticket disable + tooltip debt.
 * 3. Delivery: ORD-3004 (batchStatus=0, không spec khác mutate) — DatePicker
 *    ngày quá khứ disabled → chọn ngày mai + slot → cell update.
 * 4. Wizard: step 1 preset 4 card (default balanced) → Tiếp tục → step DnD
 *    render như cũ (Deviation D1 — content step cũ KHÔNG bị ẩn).
 * 5. Role gates: warehouse — D1 route chặn tầng shell + API-level 3 mutations
 *    (PUT note, PUT delivery-time, POST transfer-tickets) → 403
 *    PERMISSION_DENIED.
 * 6. Note happy path (API-level, verify-only feature — SF-28 T8): PUT note →
 *    GET order → note khớp.
 *
 * Chạy serial cuối cùng (tiền tố 07) — mutate ORD-3004 (ticket + note + TG
 * giao), không đụng đơn specs khác phụ thuộc (01 dùng 3001-3003/3006/3013).
 */

const BFF_BASE = "http://localhost:8080";

/** Dropdown đang mở duy nhất (pattern 01-main-flow). */
function openOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option");
}

async function filterShop30201(page: Page) {
  await page.locator(".ant-select").filter({ hasText: "Kho CN xuất hàng" }).click();
  await openOptions(page).filter({ hasText: "(30201)" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByTestId("fulfill-code-ORD-3004").waitFor();
}

async function tickOrder(page: Page, code: string) {
  await page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`).check();
}

/** Ngày theo TZ +07:00 (cộng offset trước khi lấy ISO — tránh lệch múi host). */
function vnDate(dayOffset: number): string {
  return new Date(Date.now() + 7 * 3_600_000 + dayOffset * 86_400_000).toISOString().slice(0, 10);
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `HH:mm DD/MM/YYYY` local — khớp formatPeriodOfTime (browser cùng TZ host). */
function localDateTimeDisplay(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * BFF auth là Bearer JWT (plugins/auth.ts) — storageState chỉ mang cookies
 * (không dùng cho API). Token nằm trong oidc-client-ts user (localStorage key
 * `oidc.user:<authority>:<client_id>`) mà auth.setup đã persist.
 */
function bearerFrom(storageStateFile: string): string {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".auth", storageStateFile), "utf8");
  const state = JSON.parse(raw) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.startsWith("oidc.user:")) continue;
      const token = (JSON.parse(entry.value) as { access_token?: string }).access_token;
      if (token) return token;
    }
  }
  throw new Error(`Không tìm thấy access_token trong ${storageStateFile}`);
}

test("transfer ticket: tạo YC chuyển kho → badge D1 → history PENDING", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await filterShop30201(page);

  await tickOrder(page, "ORD-3004");
  await expect(page.getByTestId("bulk-transfer-ticket")).toBeEnabled();
  await page.getByTestId("bulk-transfer-ticket").click();

  const modal = page.getByTestId("transfer-hub-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("ORD-3004");

  // Search kho đích (debounce 300ms) → chọn candidate đầu (≠ kho hiện tại)
  await page.getByTestId("transfer-hub-search").fill("30202");
  await page.getByTestId("transfer-hub-target").first().waitFor();
  await page.getByTestId("transfer-hub-target").first().click();
  await page.getByTestId("transfer-hub-reason").fill("SF-28 E2E chuyển kho thử");
  await page.getByTestId("transfer-hub-confirm").click();

  // Success flash 800ms → modal tự đóng; badge D1 hiện qua invalidation list
  await expect(modal).toBeHidden();
  const badge = page.getByTestId("transfer-badge-ORD-3004");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("YC chuyển kho");

  // Click badge → history modal: row ticket MỚI NHẤT PENDING với lý do + kho đích
  await badge.click();
  await expect(page.getByTestId("transfer-ticket-history-modal")).toBeVisible();
  const table = page.getByTestId("transfer-history-table");
  await expect(table).toBeVisible();
  await expect(table).toContainText(/TT-\d{4}/);
  await expect(table).toContainText("Chờ duyệt");
  await expect(table).toContainText("SF-28 E2E chuyển kho thử");
  await expect(table).toContainText("(30202)");
});

test("transfer ticket: đơn tách nợ → nút YC chuyển kho bị chặn", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await filterShop30201(page);

  // ORD-3006 — seed isDebtSplittingOrder=true: 1 đơn chọn, đúng kho → vẫn
  // disable (debt gate của nút, không phải rule cùng-kho)
  await tickOrder(page, "ORD-3006");
  const button = page.getByTestId("bulk-transfer-ticket");
  await expect(button).toBeDisabled();
  // antd Tooltip bọc disabled button bằng span.ant-tooltip-disabled-compatible-wrapper
  // (span này nhận pointer events thay button) — hover span để tooltip render.
  await button.locator("xpath=..").hover();
  await expect(page.getByText("Không thể chuyển kho — đơn tách nợ")).toBeVisible();
});

test("delivery time: ngày quá khứ disabled → mai + slot → cell update", async ({ page }) => {
  const yesterday = vnDate(-1);
  const tomorrow = vnDate(1);

  await page.goto("/hub-store-order/order");
  await filterShop30201(page);

  const row = page.locator('tr[data-row-key="ORD-3004"]');
  const before = await row.getByTestId("delivery-time-text").innerText();

  await row.getByTestId("edit-delivery-ORD-3004").click();
  const modal = page.locator(".ant-modal-content").filter({ hasText: "Cập nhật thời gian dự kiến giao" });
  await expect(modal).toBeVisible();

  // DatePicker: ngày hôm qua disabled (disabledDate < hôm nay TZ +07:00)
  await modal.locator(".ant-picker").click();
  const dropdown = page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)");
  await expect(dropdown.locator(`td[title="${yesterday}"]`)).toHaveClass(/ant-picker-cell-disabled/);
  await expect(dropdown.locator(`td[title="${tomorrow}"]`)).not.toHaveClass(/ant-picker-cell-disabled/);

  // Chọn ngày mai → slots render → chọn slot đầu (08:00-10:00, không quá khứ).
  // antd Radio ẩn native input (opacity 0) — click label wrapper (input →
  // span.ant-radio-button → label.ant-radio-button-wrapper); force vì antd
  // wave animation khiến stability-wait lặp vô hạn.
  await modal.locator(".ant-picker input").fill(tomorrow);
  await page.keyboard.press("Enter");
  const slot = page.getByTestId("delivery-slot-0");
  const slotWrapper = slot.locator("xpath=../..");
  await expect(slotWrapper).toBeVisible();
  await slotWrapper.click({ force: true });

  await modal.getByRole("button", { name: "Lưu" }).click();
  await expect(page.locator(".ant-message")).toContainText("Cập nhật thời gian giao thành công");
  await expect(modal).toBeHidden();

  // Cell update: 08:00 ngày mai (+07:00) — format HH:mm DD/MM/YYYY theo TZ host
  const cell = row.getByTestId("delivery-time-text");
  await expect(cell).not.toHaveText(before);
  await expect(cell).toContainText(localDateTimeDisplay(`${tomorrow}T08:00:00+07:00`));
});

test("wizard: step 1 preset 4 card → chọn → step DnD render như cũ (D1)", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await filterShop30201(page);

  await tickOrder(page, "ORD-3004");
  await page.getByTestId("bulk-create-batch").click();
  const modal = page.locator(".create-batching-modal");
  await expect(modal).toBeVisible();

  const presetSection = page.getByTestId("wizard-step1-preset");
  await expect(presetSection.getByRole("radio")).toHaveCount(4);
  // Default BALANCED chọn sẵn khi API trả list có preset đó (design §2.4)
  await expect(page.getByTestId("wizard-preset-balanced")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("batch-continue")).toBeEnabled();

  // Đổi preset → selected chuyển
  await page.getByTestId("wizard-preset-shortest").click();
  await expect(page.getByTestId("wizard-preset-shortest")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("wizard-preset-balanced")).toHaveAttribute("aria-checked", "false");

  // Tiếp tục → step 2 (DnD) — Deviation D1: content step cũ vẫn render, không ẩn
  await page.getByTestId("batch-continue").click();
  const row = page.getByTestId("batch-row-ORD-3004");
  await expect(row).toBeVisible();
  await expect(row.getByTestId("batch-drag-handle")).toBeVisible();
  await expect(page.getByTestId("batch-packing-suggest")).toBeVisible();

  // KHÔNG submit — đóng modal (state store không đổi)
  await page.getByTestId("batch-close").click();
  await expect(modal).toBeHidden();
});

test.describe("Role gates — WarehouseOps", () => {
  test.use({ storageState: ".auth/warehouse.json" });

  test("D1 route chặn tầng shell — nút bulk-transfer-ticket không render", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await expect(page.getByTestId("forbidden")).toBeVisible();
    await expect(page.getByTestId("bulk-transfer-ticket")).toHaveCount(0);
  });
});

test("role 403 API-level: warehouse → note / delivery-time / transfer-tickets", async () => {
  const api = await newApiContext.newContext({
    baseURL: BFF_BASE,
    extraHTTPHeaders: { authorization: `Bearer ${bearerFrom("warehouse.json")}` },
  });
  try {
    const note = await api.put("/fulfillment/ORD-3004/note", {
      data: { note: "warehouse không được sửa note" },
    });
    expect(note.status()).toBe(403);
    expect((await note.json()).code).toBe("PERMISSION_DENIED");

    const delivery = await api.put("/fulfillment/ORD-3004/delivery-time", {
      data: {
        deliveryTime: {
          from: `${vnDate(1)}T08:00:00+07:00`,
          to: `${vnDate(1)}T10:00:00+07:00`,
        },
      },
    });
    expect(delivery.status()).toBe(403);
    expect((await delivery.json()).code).toBe("PERMISSION_DENIED");

    const transfer = await api.post("/fulfillment/ORD-3004/transfer-tickets", {
      data: { toHub: "Kho CN nội thành (30202)", reason: "SF-28 E2E — warehouse bị chặn" },
    });
    expect(transfer.status()).toBe(403);
    expect((await transfer.json()).code).toBe("PERMISSION_DENIED");
  } finally {
    await api.dispose();
  }
});

test("note happy path (API-level, verify-only — SF-28 T8): PUT note → GET khớp", async () => {
  const api = await newApiContext.newContext({
    baseURL: BFF_BASE,
    extraHTTPHeaders: { authorization: `Bearer ${bearerFrom("coordinator.json")}` },
  });
  try {
    const put = await api.put("/fulfillment/ORD-3004/note", {
      data: { note: "SF-28 E2E — ghi chú kiểm tra endpoint note" },
    });
    expect(put.status()).toBe(200);

    const get = await api.get("/fulfillment/ORD-3004");
    expect(get.status()).toBe(200);
    expect((await get.json()).note).toBe("SF-28 E2E — ghi chú kiểm tra endpoint note");
  } finally {
    await api.dispose();
  }
});
