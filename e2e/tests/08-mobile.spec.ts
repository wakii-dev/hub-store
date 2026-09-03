import { expect, test } from "@playwright/test";
import { sf11StorageState } from "./sf11-helpers";

/**
 * SF-11 Task 6 — Mobile ≤768px smoke (FI-256, spec §4.6) trên seam sf-11.
 * Viewport 768×1024: hamburger sf11-nav-toggle → app-sidebar off-canvas mở
 * (translateX −100% → 0, element LUÔN trong DOM — frozen testid); click nav
 * item → nav đóng (class sf11-nav-open removed); D1 table scroll ngang; body
 * không overflow-x (> 2px tolerance — tránh flaky 1px retry storm).
 */

test.use({
  storageState: sf11StorageState("manager"),
  viewport: { width: 768, height: 1024 },
});

test("hamburger mở nav → click nav item → nav đóng", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-header")).toBeVisible();

  // Sidebar luôn attached (frozen testid) nhưng off-canvas trước khi mở.
  const sidebar = page.getByTestId("app-sidebar");
  await expect(sidebar).toBeAttached();
  const closedBox = await sidebar.boundingBox();

  await page.getByTestId("sf11-nav-toggle").click();
  // Wrapper có class sf11-nav-open → sidebar trượt vào (transform transition
  // ~0.3s → poll boundingBox đến khi x ≥ 0).
  await expect(page.locator(".sf11-nav-open").first()).toBeVisible();
  await expect(sidebar).toBeVisible();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.x ?? -999, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(0);
  if (closedBox) expect(closedBox.x).toBeLessThan(0);

  // Click 1 nav item → route change → nav tự đóng (class removed).
  await page.getByTestId("nav-dashboard").click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator(".sf11-nav-open")).toHaveCount(0);
});

test("D1 → bảng scroll ngang + body không overflow-x (>2px tolerance)", async ({ page }) => {
  await page.goto("/hub-store-order/order");
  await expect(page.getByTestId("export-csv-button")).toBeVisible();

  const tableScroll = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".ant-table-content");
    if (!el) return null;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  // Table scroll prop (SF-11 Task 3) — content rộng hơn viewport 768px → có thể
  // scroll ngang trong container.
  expect(tableScroll, "không thấy .ant-table-content của D1").not.toBeNull();
  expect(tableScroll!.scrollWidth).toBeGreaterThan(tableScroll!.clientWidth);

  // Body horizontal overflow ≤ 2px (scrollbar tolerance).
  const overflow = await page.evaluate(
    () => document.body.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
});
