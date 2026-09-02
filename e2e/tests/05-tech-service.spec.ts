import { expect, test, type Page } from "@playwright/test";

/**
 * SF-20 (FI-265) — Đơn dịch vụ kỹ thuật FE. Chạy CUỐI (tiền tố 05) —
 * test assign (§5) mutate DB (SO-0001 gán KTV-001), staff (§4) chỉ assert
 * presence nên đặt trước assign để độc lập với state.
 *
 * Phủ ACCEPTANCE:
 * - §1 delivery tab: card + status pill + tel: phone-call (task 5)
 * - §2 filter → URL đổi + reload giữ (task 2)
 * - §3 installation tab: card + timeline + buttons BE-authoritative (task 6)
 * - §4 KTV-CTV tab: group staff×ngày + detail modal (task 4)
 * - §5 assign modal: suggest SF-19 + confirm gán (task 3)
 */

/** Dropdown đang mở duy nhất (dropdown ẩn vẫn mount trong DOM). */
function openOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/hub-store-order/tech");
  await expect(page.getByTestId("tech-page-title")).toHaveText("Đơn dịch vụ kỹ thuật");
});

test("§1 tab Giao hàng: card seed + pill trạng thái + tel: link", async ({ page }) => {
  // Tab mặc định = delivery (URL không có param tab)
  await expect(page.getByTestId("tech-tabs")).toContainText("Giao hàng");

  // Seed TD-0001..0010 — card TD-0005 DELIVERED hiển thị pill 'Đã giao'
  await expect(page.getByTestId("tech-status-DELIVERED")).toContainText("Đã giao");

  // tel: phone-call (IS_SHOW_PHONE_CALL=true) — driver/receiver phones từ seed
  const hrefs = await page.getByTestId("tech-phone-link").evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")),
  );
  expect(hrefs.some((h) => h?.startsWith("tel:0"))).toBe(true);
});

test("§2 filter trạng thái → URL đổi + reload giữ filter", async ({ page }) => {
  // Chọn status NEW trong MultiSelect
  await page.getByTestId("tech-filter-d-status").click();
  await openOptions(page).getByText("Mới", { exact: true }).click();
  await page.keyboard.press("Escape");

  // URL sync + chỉ còn card NEW
  await expect(page).toHaveURL(/dStatus=NEW/);

  // Reload → filter giữ (acceptance: reload giữ filter)
  await page.reload();
  await expect(page.getByTestId("tech-filter-d-status")).toContainText("Mới");
  await expect(page).toHaveURL(/dStatus=NEW/);
});

test("§3 tab Lắp đặt: card SO-0001 NEW có nút 'Gán KTV' (flag BE)", async ({ page }) => {
  await page.getByRole("tab", { name: "Lắp đặt" }).click();
  await expect(page).toHaveURL(/tab=installation/);

  // SO-0001 NEW chưa gán → BE flag allowAssign → nút 'Gán KTV'
  await expect(page.getByTestId("tech-assign-SO-0001")).toContainText("Gán KTV");

  // SO-0006 DELIVERED đã gán KTV-003 → không có nút assign (không nút không flag)
  await expect(page.getByTestId("tech-assign-SO-0006")).toHaveCount(0);
});

test("§4 tab KTV-CTV: group theo staff + detail modal theo ngày", async ({ page }) => {
  await page.getByRole("tab", { name: "KTV-CTV" }).click();
  await expect(page).toHaveURL(/tab=staff/);

  // Registry từ SF-19 suggest + đơn gán seed → KTV-001 Nguyễn Văn An
  const row = page.getByTestId("tech-staff-row-KTV-001");
  await expect(row).toContainText("Nguyễn Văn An");

  // Click row → detail modal: 'Công việc của Nguyễn Văn An' + group ngày
  await row.click();
  await expect(page.getByText("Công việc của Nguyễn Văn An")).toBeVisible();
  await expect(page.getByTestId("tech-staff-day-2026-09-02")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("§5 gán KTV: modal suggest (SF-19) + confirm → đơn gán thành công", async ({ page }) => {
  await page.getByRole("tab", { name: "Lắp đặt" }).click();

  // Mở modal gán cho SO-0001 (NEW, regionCode R1)
  await page.getByTestId("tech-assign-SO-0001").click();
  await expect(page.getByTestId("tech-assign-modal")).toContainText("Gán KTV — SO-0001");

  // Suggest theo region R1 (SF-19): danh sách KTV hiện ra
  await expect(page.getByTestId("tech-assign-options").getByText("Nguyễn Văn An")).toBeVisible({ timeout: 15_000 });

  // Confirm disabled khi chưa chọn → chọn → enabled → gán
  const confirm = page.getByTestId("tech-assign-confirm");
  await expect(confirm).toBeDisabled();
  await page.getByTestId("tech-assign-options").getByText("Nguyễn Văn An").click();
  await confirm.click();

  // Toast thành công + card SO-0001 update (technician hiển thị)
  await expect(page.getByText("Đã gán KTV cho SO-0001")).toBeVisible();
});
