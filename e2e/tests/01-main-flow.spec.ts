import { expect, test, type Page } from "@playwright/test";

/**
 * SF-11 Task 2+3 — E2E luồng §8 chính cross-remotes (spec §5 SF-11):
 * D1 filter 30201 → tick 3 đơn → D1b (DnD + suggest + thêm đơn +
 * shipper + TG giao) → tạo phiếu → D2 thấy phiếu (cross-remote invalidation)
 * → hủy → D1 đơn revert → tạo lại → In D3 PDF → hoàn tất soạn.
 * Chạy serial — spec này MUTATE store, phải chạy đầu (tiền tố 01).
 * SF-4: đăng nhập qua storageState coordinator (auth.setup login Keycloak).
 */

/** Dropdown đang mở duy nhất (modal có nhiều Select — dropdown ẩn vẫn mount trong DOM). */
function openOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option");
}

async function filterShop30201(page: Page) {
  await page.locator(".ant-select").filter({ hasText: "Kho CN xuất hàng" }).click();
  await openOptions(page).filter({ hasText: "(30201)" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();
}

async function tickOrder(page: Page, code: string, checked: boolean) {
  const box = page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`);
  if (checked) await box.check();
  else await box.uncheck();
}

async function createBatch(page: Page, opts: { suggest?: boolean; addOrder?: string; dnd?: boolean } = {}) {
  await expect(page.getByTestId("bulk-create-batch")).toBeEnabled();
  await page.getByTestId("bulk-create-batch").click();
  const modal = page.locator(".create-batching-modal");
  await expect(modal).toBeVisible();
  // SF-16 fix (regression DnD flaky): chờ animation mở modal (antd zoom +
  // sf6-modal-in, ~300ms) chạy xong TRƯỚC khi đo boundingBox kéo-thả —
  // đo giữa animation cho tọa độ scale ~0.2→1 → mouse.down trật handle.
  await page.waitForFunction(() => {
    const c = document.querySelector(".create-batching-modal .ant-modal-content");
    return !!c && c.getAnimations().every((a) => a.playState !== "running");
  });
  // Anim xong chưa đủ: reflow muộn (font/async render) vẫn dịch handle ~11px
  // giữa lúc đo boundingBox và mouse.down → trật handle nhỏ (~15px). Chờ top
  // của drag handle ổn định qua 4 frame liên tiếp (~65ms không dịch chuyển).
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const q = () =>
          document.querySelector<HTMLElement>(
            '[data-testid="batch-row-ORD-3001"] [data-testid="batch-drag-handle"]',
          );
        let last = q()?.getBoundingClientRect().top ?? Number.NaN;
        let stable = 0;
        const tick = () => {
          const el = q();
          if (!el) return resolve();
          const t = el.getBoundingClientRect().top;
          if (Math.abs(t - last) < 0.5) stable += 1;
          else stable = 0;
          last = t;
          if (stable >= 4) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

  // SF-28 T7 — wizard step 1 (preset 4 card) thêm vào trước nội dung step cũ
  // (Deviation D1: step cũ không bị ẩn) → advance sang step DnD trước khi kéo
  // (layout shift làm coordinate-drag trượt chỗ).
  await page.getByTestId("batch-continue").click();

  if (opts.dnd) {
    // Kéo hàng đầu xuống dưới 1 vị trí (react-sortable-hoc + useDragHandle)
    const first = page.getByTestId("batch-row-ORD-3001").getByTestId("batch-drag-handle");
    const second = page.getByTestId("batch-row-ORD-3002").getByTestId("batch-drag-handle");
    const from = await first.boundingBox();
    const to = await second.boundingBox();
    if (!from || !to) throw new Error("DnD: drag handle mất boundingBox (row detached?)");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 20, { steps: 12 });
    await page.mouse.up();
    // Thứ tự giao thay đổi: ORD-3002 giờ đứng trước ORD-3001 (stop-order re-number 1,2,3)
    await expect(
      page.locator('[data-testid^="batch-row-"]').first(),
    ).toHaveAttribute("data-testid", "batch-row-ORD-3002");
  }

  if (opts.suggest) {
    await page.getByTestId("batch-packing-suggest").click();
    await expect(page.getByTestId("batch-groups")).toBeVisible();
    await expect(page.getByTestId("batch-groups")).toContainText(/Nhóm \d+/);
  }

  if (opts.addOrder) {
    const add = page.getByTestId("batch-add-order");
    await add.locator(".ant-select-selector").click();
    await add.locator(".ant-select-selection-search-input").fill(opts.addOrder);
    await openOptions(page).filter({ hasText: opts.addOrder }).first().click();
    await expect(page.getByTestId(`batch-row-${opts.addOrder}`)).toBeVisible();
  }

  // Gán shipper — keyboard nav (AntD dropdown portal, chọn option đầu)
  await page.getByTestId("batch-shipper-select").locator(".ant-select-selector").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("batch-shipper-select").locator(".ant-select-selection-item"),
  ).toBeVisible();

  // Chọn TG giao qua hint chip nhanh nhất
  await page.getByTestId("batch-time-hint-0").click();

  await page.getByTestId("batch-submit").click();
  await expect(page.locator(".ant-message")).toContainText("Tạo phiếu soạn thành công");
  await expect(modal).toBeHidden();
}

async function openBatchOfOrder(page: Page, orderCode: string): Promise<string> {
  // Cross-remote: điều phối đang ở orders remote → nav sang fulfillment remote,
  // D2 refetchOnMountOrArgChange → thấy phiếu mới KHÔNG reload tay (Task 3).
  await page.getByTestId("nav-batch").click();
  await page.waitForURL("**/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill(orderCode);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  // Đơn đã từng thuộc phiếu ĐÃ HỦY vẫn match search — lấy phiếu còn hoạt động
  // (status tag khác "Đã hủy") mới có nút Hủy/Hoàn tất/In.
  const actions = page
    .locator('[data-testid^="batch-actions-"]')
    .filter({ hasNotText: "Đã hủy" })
    .first();
  await expect(actions).toBeVisible();
  const testid = await actions.getAttribute("data-testid");
  return testid!.replace("batch-actions-", "");
}

test("luồng §8: tạo phiếu → D2 cross-remote → hủy → revert", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await expect(page.getByText("Danh sách đơn hàng kho chi nhánh")).toBeVisible();

  // D1 filter Kho CN = 30201 → chỉ đơn 30201
  await filterShop30201(page);
  await expect(page.getByText(/^Tổng \d+ mã$/)).toBeVisible();
  // Chỉ đơn kho 30201 — không lẫn mã kho khác (ORD-3013 thuộc 30202)
  await expect(page.getByTestId("fulfill-code-ORD-3013")).toHaveCount(0);

  // Tick 3 đơn cùng kho → nút tạo phiếu enable
  await tickOrder(page, "ORD-3001", true);
  await tickOrder(page, "ORD-3002", true);
  await tickOrder(page, "ORD-3003", true);
  await expect(page.getByTestId("bulk-bar")).toBeVisible();
  await expect(page.getByTestId("bulk-create-batch")).toBeEnabled();

  // D1b: tạo phiếu với DnD + suggest + thêm đơn
  await createBatch(page, { dnd: true, suggest: true, addOrder: "ORD-3006" });

  // Cross-remote: D2 hiện phiếu mới (không reload tay)
  const batchCode = await openBatchOfOrder(page, "ORD-3001");
  expect(batchCode).toMatch(/^BATCH-\d+$/);

  // Hủy phiếu: confirm + reason
  await page
    .getByTestId(`batch-actions-${batchCode}`)
    .getByRole("button", { name: "Hủy phiếu" })
    .click();
  await page.getByPlaceholder("Nhập lý do hủy").fill("SF-11 E2E hủy thử");
  await page.getByRole("button", { name: "Xác nhận hủy" }).click();
  await expect(page.locator(".ant-message")).toContainText(`Đã hủy phiếu ${batchCode}`);

  // Đơn revert về Chưa soạn (navigate về orders remote — refetch mount)
  await page.getByTestId("nav-orders").click();
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();
  const row = page.locator('tr[data-row-key="ORD-3001"]');
  await expect(row).toContainText("Chưa soạn");
});

test("bulk: tick khác kho → 'Tạo phiếu soạn' disable (rule 1 UI layer)", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  // Lọc Chưa soạn → ORD-3001 (30201) + ORD-3013 (30202) cùng nằm page 1
  await page.locator(".ant-select").filter({ hasText: "Trạng thái soạn hàng" }).click();
  await openOptions(page).filter({ hasText: "Chưa soạn" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByTestId("fulfill-code-ORD-3001").waitFor();

  await tickOrder(page, "ORD-3001", true);
  await expect(page.getByTestId("bulk-create-batch")).toBeEnabled();

  // Tick thêm đơn khác kho (cùng trang, cả 2 visible) → disable (rule 1)
  await tickOrder(page, "ORD-3013", true);
  await expect(page.getByTestId("bulk-create-batch")).toBeDisabled();

  // Bỏ chọn đơn khác kho → chỉ còn đơn 30201 → enable lại
  await tickOrder(page, "ORD-3013", false);
  await expect(page.getByTestId("bulk-create-batch")).toBeEnabled();
});

test("luồng §8: tạo lại → In D3 PDF → hoàn tất soạn", async ({ page, browser }) => {
  await page.goto("/hub-store-order/order");
  await filterShop30201(page);

  // Tạo lại sau hủy
  await tickOrder(page, "ORD-3001", true);
  await tickOrder(page, "ORD-3002", true);
  await tickOrder(page, "ORD-3003", true);
  await createBatch(page, {});

  const batchCode = await openBatchOfOrder(page, "ORD-3001");

  // In → D3 (print route với ?batchCode)
  await page
    .getByTestId(`batch-actions-${batchCode}`)
    .getByRole("button", { name: "In" })
    .click();
  await page.waitForURL("**/hub-store-order/batch/print?batchCode=*");
  await expect(page.locator('[data-probe="fulfillment-print"]')).toBeVisible();

  // 5 tabs đúng
  for (const tab of ["Biên bản", "Vận đơn", "Bàn giao", "Bàn giao hàng", "Lắp đặt"]) {
    await expect(page.getByRole("tab", { name: tab, exact: true })).toBeVisible();
  }

  // PDF preview render (react-pdf → canvas) + zoom slider tồn tại
  const canvas = page.locator(".print-preview-area canvas").first();
  await canvas.waitFor({ timeout: 45_000 });
  // antd 4 Slider không nhận aria-label trực tiếp → dùng role=slider của handle.
  // Scope vào remote-mount: SF-21 thêm FontSizeSlider (slider thứ 2) ở header.
  const zoom = page.getByTestId("remote-mount").getByRole("slider");
  await expect(zoom).toBeVisible();
  await zoom.click();
  await page.keyboard.press("ArrowRight"); // tăng zoom — canvas re-render không crash

  // Chọn máy in từ API
  await page.locator(".ant-select").filter({ hasText: "Chọn máy in" }).click();
  await openOptions(page).first().click();

  // In 1 phiếu → feedback (accessible name "printer In" — icon + text; /In$/
  // khớp nút In đơn, loại "In tất cả")
  await page.getByRole("button", { name: /In$/ }).click();
  await expect(page.locator(".ant-message")).toContainText(/Đã gửi lệnh in|In thất bại/);

  // In tất cả — 5 call tuần tự + progress
  await page.getByRole("button", { name: "In tất cả" }).click();
  await expect(page.locator(".ant-message")).toContainText("Hoàn tất in 5/5 phiếu", { timeout: 60_000 });

  // Hoàn tất soạn (D11): confirm → đơn batchStatus 1→2
  await page.getByTestId("nav-batch").click();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill("ORD-3001");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await page
    .getByTestId(`batch-actions-${batchCode}`)
    .getByRole("button", { name: "Hoàn tất soạn" })
    .click();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.locator(".ant-message")).toContainText(`Đã hoàn tất phiếu ${batchCode}`);
  await expect(page.getByTestId(`batch-actions-${batchCode}`)).toBeVisible();
});
