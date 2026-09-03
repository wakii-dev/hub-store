import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

/**
 * SF-25 (FI-270) — spec 09: ktv-mobile 375px trên seam private-port sf-25
 * (e2e/scripts/run-ktv-private.sh + playwright.ktv.config.ts — app :4220,
 * BFF :4286, keycloak riêng :8082 FRESH volume). storageState mint sẵn bởi
 * runner (mint_ktv_auth.py): mặc định KTV-001, test CTV-001 override.
 *
 * Seed reality (tech-sample.json, SF-25 T2):
 * - install KTV-001 hôm nay: SO-0004 PROCESSING + SO-0006 CONFIRMED
 *   (SO-0005 = KTV-002 — KHÔNG được thấy; SO-0007 = CTV-001).
 * - delivery driverName "Nguyễn Văn An" (= name claim KTV-001): TD-0007 —
 *   DTO delivery CÓ receiver.phone/location; installation KHÔNG (proto) →
 *   tel:+map assert dùng TD-0007, timeline assert dùng SO-0004 (spec §4.5).
 *
 * Serial: S2 accept SO-0006 → S3 complete SO-0006 → S4 reschedule SO-0004
 * (mutate DB tuần tự, mỗi test reload fetch lại — BE-authoritative).
 */

/** Route-abort tiles OSM — MapView/leaflet vẫn render marker (SF-24 pattern). */
async function abortTiles(page: Page) {
  await page.route("**://*.tile.openstreetmap.org/**", (r) => r.abort());
}

/** Ngày mai theo Asia/Ho_Chi_Minh — YYYY-MM-DD (en-CA) cho form dời lịch. */
function tomorrowKt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 24 * 3600 * 1000));
}

test.describe.serial("SF-25 ktv-mobile — KTV-001", () => {
  test("S1 · My Orders hôm nay: đúng đơn của mình (SO-0004, SO-0006, TD-0007) — không SO-0005", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    // Tab Lắp đặt (mặc định): SO-0004 PROCESSING + SO-0006 CONFIRMED
    await expect(page.getByTestId("ktv-order-card-SO-0004")).toBeVisible();
    await expect(page.getByTestId("ktv-order-card-SO-0006")).toBeVisible();
    await expect(page.getByTestId("ktv-status-PROCESSING").first()).toBeVisible();
    // Đơn người khác: SO-0005 (KTV-002) + SO-0007 (CTV-001) không lộ
    await expect(page.getByTestId("ktv-order-card-SO-0005")).toHaveCount(0);
    await expect(page.getByTestId("ktv-order-card-SO-0007")).toHaveCount(0);
    // Tab Giao hàng: TD-0007 (driverName = name claim KTV-001)
    await page.getByTestId("ktv-tab-delivery").click();
    await expect(page.getByTestId("ktv-order-card-TD-0007")).toBeVisible();
  });

  test("S2 · Accept SO-0006 → PROCESSING + nút Hoàn tất xuất hiện (flag BE)", async ({ page }) => {
    await page.goto("/");
    const actions = page.getByTestId("ktv-actions-SO-0006");
    await expect(actions).toBeVisible();
    await expect(page.getByTestId("ktv-accept-SO-0006")).toBeVisible();
    await expect(page.getByTestId("ktv-complete-SO-0006")).toHaveCount(0);
    await page.getByTestId("ktv-accept-SO-0006").click();
    // Sau accept: state local thay bằng response BE — accept mất, complete vào
    // (allowComplete bật ở PROCESSING); toast xác nhận mutate thành công.
    await expect(page.getByText("Đã nhận việc — đơn chuyển sang đang xử lý.")).toBeVisible();
    await expect(page.getByTestId("ktv-accept-SO-0006")).toHaveCount(0);
    await expect(page.getByTestId("ktv-complete-SO-0006")).toBeVisible();
  });

  test("S3 · Complete SO-0006 → DELIVERED + timeline entry DELIVERED", async ({ page }) => {
    await page.goto("/");
    // Reload → fetch lại từ BE: SO-0006 đã PROCESSING sau S2 → nút Hoàn tất.
    await expect(page.getByTestId("ktv-complete-SO-0006")).toBeVisible();
    await page.getByTestId("ktv-complete-SO-0006").click();
    // Modal.confirm "Xác nhận hoàn tất?" → OK mới POST (pattern actions.test).
    await expect(page.getByText("Xác nhận hoàn tất?")).toBeVisible();
    await page.locator(".ant-modal-confirm-btns .ant-btn-primary").click();
    await expect(page.getByText("Đã hoàn tất lắp đặt — ghi giờ hoàn tất.")).toBeVisible();
    // Card sau mutate: hết khối actions (DELIVERED không còn flag).
    await expect(page.getByTestId("ktv-actions-SO-0006")).toHaveCount(0);
    // Detail: header pill + timeline entry DELIVERED (≥2 pill DELIVERED).
    await page.getByTestId("ktv-order-card-SO-0006").click();
    await expect(page.getByTestId("ktv-detail-code")).toHaveText("SO-0006");
    await expect(page.getByTestId("ktv-timeline")).toBeVisible();
    const delivered = await page
      .locator('[data-testid="ktv-status-DELIVERED"]')
      .count();
    expect(delivered).toBeGreaterThanOrEqual(2); // 1 header + ≥1 timeline
  });

  test("S4 · Reschedule SO-0004 (detail-only) → RESCHEDULED + note timeline + Accept quay lại", async ({ page }) => {
    // RescheduleButton KHÔNG render trên card (T4b) — chỉ trong ktv-detail-actions.
    await page.goto("/order/SO-0004");
    await expect(page.getByTestId("ktv-order-detail")).toBeVisible();
    await expect(page.getByTestId("ktv-reschedule-SO-0004")).toBeVisible();
    await page.getByTestId("ktv-reschedule-SO-0004").click();
    await expect(page.getByTestId("ktv-reschedule-modal")).toBeVisible();
    // Ngày mai + 23:30 (luônfuture) — antd4 picker input nhận gõ + Enter.
    await page.locator(".ant-modal .ant-picker input").nth(0).fill(tomorrowKt());
    await page.keyboard.press("Enter");
    await page.locator(".ant-modal .ant-picker input").nth(1).fill("23:30");
    await page.keyboard.press("Enter");
    await page.getByTestId("ktv-reschedule-note").fill("e2e dời lịch sang ngày mai");
    await page.locator(".ant-modal-footer .ant-btn-primary").click();
    await expect(page.getByText("Đã dời lịch — đơn chuyển sang trạng thái đổi lịch.")).toBeVisible();
    // Detail refresh từ response BE: pill RESCHEDULED + note trong timeline
    // + allowAccept bật lại (dead-end fix spec §4.2).
    await expect(page.getByTestId("ktv-status-RESCHEDULED").first()).toBeVisible();
    await expect(page.getByTestId("ktv-timeline")).toContainText("e2e dời lịch sang ngày mai");
    await expect(page.getByTestId("ktv-accept-SO-0004")).toBeVisible();
  });

  test("S5 · Detail: TD-0007 tel: + map deep-link; SO-0004 timeline render", async ({ page }) => {
    await abortTiles(page);
    // Delivery DTO có receiver (name/phone/location) → customer + tel: + map.
    await page.goto("/order/TD-0007");
    await expect(page.getByTestId("ktv-detail-customer")).toBeVisible();
    const tel = page.getByTestId("tech-phone-link");
    await expect(tel).toHaveAttribute("href", /^tel:0912000007$/);
    const map = page.getByTestId("ktv-map-open");
    await expect(map).toBeVisible();
    await expect(map).toHaveAttribute("href", /openstreetmap\.org\/\?mlat=10\.7398&mlon=106\.689/);
    await expect(page.getByTestId("ktv-address-text")).toContainText("TP. Hồ Chí Minh");
    await expect(page.getByTestId("ktv-map-pin-TD-0007")).toBeVisible();
    // Install SO-0004: timeline seeded render (sau S4 có thêm entry RESCHEDULED).
    await page.goto("/order/SO-0004");
    await expect(page.getByTestId("ktv-detail-timeline")).toBeVisible();
    await expect(page.getByTestId("ktv-timeline")).toBeVisible();
    await expect(page.getByTestId("ktv-status-NEW").first()).toBeVisible();
  });

  test("S6 · PWA: manifest 200 + service worker đăng ký", async ({ page, request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const m = (await res.json()) as { name?: string; icons?: Array<{ src: string }> };
    expect(m.name).toBe("HubStore KTV");
    expect(m.icons?.length).toBeGreaterThanOrEqual(2);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBeTruthy();
    // SW đăng ký lúc load (registerServiceWorker readyState fast-path — main.tsx).
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    await page.waitForFunction(
      () => navigator.serviceWorker.getRegistrations().then((r) => r.length > 0),
      undefined,
      { timeout: 15_000 },
    );
  });
});

test.describe("SF-25 ktv-mobile — CTV-001 (storageState riêng)", () => {
  test.use({
    storageState:
      process.env.E2E_CTV_STORAGE ?? resolve(__dirname, ".auth/ctv-001.json"),
  });

  test("S7 · CTV-001 chỉ thấy đơn của mình (SO-0007)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    await expect(page.getByTestId("ktv-order-card-SO-0007")).toBeVisible();
    // Đơn KTV không lộ cho CTV.
    await expect(page.getByTestId("ktv-order-card-SO-0004")).toHaveCount(0);
    await expect(page.getByTestId("ktv-order-card-SO-0006")).toHaveCount(0);
    await expect(page.getByTestId("ktv-order-card-SO-0005")).toHaveCount(0);
  });
});
