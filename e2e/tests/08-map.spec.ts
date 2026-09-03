import { expect, test, type Page } from "@playwright/test";

/**
 * SF-24 (FI-269) — spec 08: map render (Leaflet + OSM tiles bị route-abort —
 * không phụ thuộc mạng). Chạy trên seam private-port sf-24
 * (e2e/scripts/run-map-private.sh + playwright.map.config.ts).
 *
 * Test 1 — batch route map: batch THẬT từ seed (BATCH-0001, ACTIVE, shop
 * 30201) mở qua D2 batch list như spec 07 (nút track chỉ hiện khi planning
 * map CÓ entries → addInitScript seed `nvc.plannings.BATCH-0001` TRƯỚC app
 * load — key format planningMap.ts:20). stopOrder nguồn từ planning map;
 * toạ độ là MOCK fixture (deriveStopCoord — REQUIREMENT-GAP FI-245).
 *
 * Test 2 — tech pins: route-mock POST /delivery-orders/filter (fulfillment
 * PaginationEnvelope {items,total,page,pageSize}) — 1 order có
 * receiver.location + 1 không → note đếm "chưa có tọa độ".
 */

/** Route-abort tiles OSM — markers/popup vẫn render (divIcon là DOM). */
async function abortTiles(page: Page) {
  await page.route("**://*.tile.openstreetmap.org/**", (r) => r.abort());
}

test.describe.serial("SF-24 map view", () => {
  test("tracking modal → tab bản đồ: warehouse + stops theo stopOrder + popup", async ({ page }) => {
    const BATCH = "BATCH-0001"; // seed canonical-seed.json — ACTIVE
    await abortTiles(page);
    // Seed planningMap TRƯỚC app load — batch-track button gate theo map này.
    await page.addInitScript((batch) => {
      localStorage.setItem(
        `nvc.plannings.${batch}`,
        JSON.stringify([
          { planningId: "pl-e2e-1", orderCode: "ORD-E2E-A", stopOrder: 1, serviceId: "1T", vehicleType: "TRUCK", addons: [] },
          { planningId: "pl-e2e-2", orderCode: "ORD-E2E-B", stopOrder: 2, serviceId: "1T", vehicleType: "TRUCK", addons: [] },
        ]),
      );
    }, BATCH);

    // Điều hướng batch list → tracking (theo spec 07 — seam boots service thật).
    await page.goto("/hub-store-order/batch");
    await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
    await page.getByPlaceholder("Số phiếu / Số đơn").fill(BATCH);
    await page.getByRole("button", { name: "Tìm kiếm" }).click();
    await page.getByTestId(`batch-track-${BATCH}`).click();

    // Modal 720 mở ở tab Timeline mặc định → sang tab bản đồ.
    await page.getByTestId("tracking-map-tab").click();
    const map = page.getByTestId("tracking-route-map");
    await expect(map).toBeVisible();
    // Container đo được — responsive trong modal 720 (spec-critic P2).
    const box = await map.boundingBox();
    expect(box?.width).toBeGreaterThan(300);
    // Markers đúng thứ tự stopOrder + warehouse.
    await expect(page.locator('[data-stop-order="1"]')).toBeVisible();
    await expect(page.locator('[data-stop-order="2"]')).toBeVisible();
    await expect(page.getByTestId("warehouse-marker")).toBeVisible();
    // Popup stop 1 mang orderCode.
    await page.locator('[data-stop-order="1"]').click();
    await expect(page.getByTestId("route-stop-popup-ORD-E2E-A")).toBeVisible();
  });

  test("tech map tab: pins theo trạng thái + popup gọi + note thiếu toạ độ", async ({ page }) => {
    await abortTiles(page);
    const buttons = {
      allowCancel: false, allowAssign: false, allowReassign: false,
      allowAccept: false, allowReschedule: false,
    };
    const order1 = {
      code: "TECH-E2E-1", status: "SHIPPING", driverName: "Trần Driver", driverPhone: "0987654321",
      receiver: { name: "Nguyễn Văn A", phone: "0901234567", location: { lat: 10.7951, long: 106.7218 } },
      sender: { name: "Kho HCM", phone: "02838111222", location: null },
      fee: 22000, tip: 0, items: [], regionCode: "SG", province: "TP. Hồ Chí Minh",
      coordination: null, deliveryDate: "2026-09-03", createdAt: "2026-09-03T00:00:00Z", buttons,
    };
    const order2 = {
      ...order1,
      code: "TECH-E2E-2", status: "NEW",
      receiver: { name: "Trần Thị B", phone: "0911222333", location: null },
    };
    // PaginationEnvelope shape (packages/api-client baseQuery.ts:63).
    await page.route("**/delivery-orders/filter", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [order1, order2], total: 2, page: 1, pageSize: 200 }),
      }),
    );

    await page.goto("/hub-store-order/tech?tab=map");
    await expect(page.getByTestId("tech-map-view")).toBeVisible();
    const pin = page.getByTestId("tech-map-pin-TECH-E2E-1");
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(page.getByTestId("tech-map-popup-TECH-E2E-1")).toBeVisible();
    const call = page.getByTestId("tech-map-call-TECH-E2E-1");
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", /^tel:/);
    // Đơn thiếu receiver.location đếm đúng 1.
    await expect(page.getByTestId("map-no-coords-note")).toContainText("1");
  });
});
