import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * SF-10 / FI-255 Task 6 — Realtime SSE E2E (2 page + fallback polling).
 *
 * Spec A (chuỗi SSE đầy đủ): 2 page CÙNG context trên D1 — page A gán shop
 * cho 1 đơn qua UI (tick row → bulk-transfer → modal → confirm); page B
 * KHÔNG reload mà row đơn đó đổi shop trong ~5s (SSE /events → invalidate
 * Fulfillment LIST → refetch).
 *
 * Spec B (fallback polling): page B bị chặn `/events` (page.route abort) —
 * hook rơi vào polling sau MAX_SSE_FAILURES+1 connect-fail (mỗi fatal fail
 * cách nhau RECONNECT_DELAY_MS=3s → polling ~9s). Poll 30s là quá chậm cho
 * CI → realtime.ts đọc `window.__REALTIME_POLL_INTERVAL_MS__` (seam Task 6)
 * và spec inject 1s qua addInitScript TRƯỚC khi app load. Hằng số mặc định
 * POLL_INTERVAL_MS=30_000 (packages/api-client/src/realtime.ts).
 *
 * Runbook (giống 01-06 — webServer boot-all.sh tự dựng stack):
 *   pnpm --filter e2e test 07-realtime
 * Chạy được cả 2 mode: KAFKA_ENABLED=false (BFF local emit — mặc định) lẫn
 * =true (Kafka consumer) — spec không phụ thuộc nguồn event.
 *
 * Skip rule (pattern 05-kafka.spec.ts): spec chạy trên stack mặc định
 * (không cần profile Kafka riêng) nên KHÔNG gate env — khi dev servers không
 * chạy, playwright webServer (playwright.config.ts) tự boot toàn hệ thống
 * trước khi spec chạy; không có cách "chạy spec không có stack" nào qua
 * config này. E2E_REALTIME=false tắt explicitly (nhánh hiếm — debug).
 */
test.skip(process.env.E2E_REALTIME === "false", "E2E_REALTIME=false — realtime spec skipped");

const APP = process.env.E2E_SHELL_URL ?? "http://localhost:3000"; // private-port seam
const BFF = process.env.E2E_BFF_URL ?? "http://localhost:8080"; // private-port seam (SF-15/SF-14 precedent)

/** Poll interval spec B inject (thay POLL_INTERVAL_MS=30_000 — xem header). */
const TEST_POLL_INTERVAL_MS = 1_000;

/**
 * Bearer token cho BFF — đọc từ localStorage của shell (oidc-client-ts
 * userStore, key `oidc.user:<authority>:<client>`). Copy pattern 05-kafka.
 */
async function bearerToken(page: Page): Promise<string> {
  await page.goto(`${APP}/hub-store-order/order`);
  for (let i = 0; i < 10; i++) {
    const token = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("oidc.user:")) {
          try {
            const user = JSON.parse(localStorage.getItem(key) ?? "{}") as { access_token?: string };
            if (user.access_token) return user.access_token;
          } catch {
            /* key khác dạng — bỏ qua */
          }
        }
      }
      return null;
    });
    if (token) return token;
    await page.waitForTimeout(1000);
  }
  throw new Error("Không đọc được access_token từ localStorage (coordinator chưa login?)");
}

/** APIRequestContext gọi BFF kèm Authorization (pattern 05-kafka). */
function bff(request: APIRequestContext, token: string) {
  return {
    post: (path: string, data: unknown) =>
      request.post(`${BFF}${path}`, {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        data,
      }),
    get: (path: string) =>
      request.get(`${BFF}${path}`, { headers: { authorization: `Bearer ${token}` } }),
  };
}

interface TransferCandidate {
  code: string;
  currentShopName: string;
  targetShopName: string;
}

/** Mở D1 + lọc "Chưa soạn" — đơn sau transfer vẫn Chưa soạn nên row không rời list. */
async function openD1FilteredNotPrepared(page: Page): Promise<void> {
  await page.goto("/hub-store-order/order");
  await expect(page.getByText("Danh sách đơn hàng kho chi nhánh")).toBeVisible();
  await page.locator(".ant-select").filter({ hasText: "Trạng thái soạn hàng" }).click();
  await page
    .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
    .filter({ hasText: "Chưa soạn" })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
}

/** Gán shop qua UI: tick đúng 1 row → bulk-transfer → modal → confirm. */
async function assignShopViaUI(page: Page, code: string, targetShopName: string): Promise<void> {
  await page.locator(`tr[data-row-key="${code}"] .ant-checkbox-input`).check();
  await expect(page.getByTestId("bulk-transfer")).toBeEnabled();
  await page.getByTestId("bulk-transfer").click();
  await expect(page.getByTestId("transfer-order-code")).toHaveText(code);

  // Select kho đích (antd portal — chỉ 1 dropdown KHÔNG hidden đang mở)
  await page.getByTestId("transfer-target-shop").locator(".ant-select-selector").click();
  await page
    .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
    .filter({ hasText: targetShopName })
    .first()
    .click();
  await page.getByTestId("transfer-confirm").click();
  await expect(page.locator(".ant-message")).toContainText("Chuyển kho thành công");
}

for (const spec of ["A", "B"] as const) {
  test(`spec ${spec}: page A gán shop → page B ${
    spec === "A" ? "thấy row đổi qua SSE (~5s)" : "vẫn update qua polling khi /events bị chặn"
  }`, async ({ page, request }) => {
    const token = await bearerToken(page);
    const api = bff(request, token);

    // --- chọn đơn + shop đích qua API (cùng rule 05-kafka) ---
    const filterRes = await api.post("/fulfillment/filter", {
      batchStatus: [0],
      page: 1,
      pageSize: 50,
    });
    expect(filterRes.ok(), `filter fail: ${filterRes.status()}`).toBeTruthy();
    const orders = (await filterRes.json()) as {
      items: Array<{
        fulfillCode: string;
        isDebtSplittingOrder?: boolean;
        shopAssignment?: { shopCode?: string; shopName?: string };
      }>;
    };
    const shopsRes = await api.get("/master-data/shops");
    expect(shopsRes.ok(), `shops fail: ${shopsRes.status()}`).toBeTruthy();
    const shops = (await shopsRes.json()) as { items?: Array<{ shopCode: string; shopName: string }> };
    const shopNameByCode = new Map((shops.items ?? []).map((s) => [s.shopCode, s.shopName]));

    let candidate: TransferCandidate | undefined;
    for (const o of orders.items) {
      const currentCode = o.shopAssignment?.shopCode;
      const currentName = o.shopAssignment?.shopName ?? shopNameByCode.get(currentCode ?? "");
      const target = (shops.items ?? []).find((s) => s.shopCode !== currentCode);
      if (!o.isDebtSplittingOrder && currentCode && currentName && target) {
        candidate = { code: o.fulfillCode, currentShopName: currentName, targetShopName: target.shopName };
        break;
      }
    }
    expect(candidate, "cần 1 đơn batchStatus=0 không chia nợ + ít nhất 1 shop khác").toBeTruthy();
    const { code, currentShopName, targetShopName } = candidate!;

    // --- 2 page CÙNG context (cùng storageState coordinator) ---
    const pageB = await page.context().newPage();
    if (spec === "B") {
      // Chặn SSE CHỈ trên page B + rút ngắn poll TRƯỚC khi app load
      // (seam realtime.ts: window.__REALTIME_POLL_INTERVAL_MS__).
      await pageB.route("**/events*", (route) => route.abort());
      await pageB.addInitScript(
        `window.__REALTIME_POLL_INTERVAL_MS__ = ${TEST_POLL_INTERVAL_MS};`,
      );
    }

    await openD1FilteredNotPrepared(page);
    await openD1FilteredNotPrepared(pageB);

    // Baseline page B: row hiện shop CŨ (chưa có gì update)
    const rowB = pageB.locator(`tr[data-row-key="${code}"]`);
    await expect(rowB).toBeVisible();
    await expect(rowB).toContainText(currentShopName);
    await expect(rowB).not.toContainText(targetShopName);

    // --- mutate trên page A qua UI ---
    await assignShopViaUI(page, code, targetShopName);

    // --- page B đổi row KHÔNG reload ---
    // Spec A: SSE push ~1-2s → expect 5s (plan Task 6 Step 1).
    // Spec B: polling sau ~9s (MAX_SSE_FAILURES+1 fatal-fail × RECONNECT 3s)
    // + tick 1s → expect 30s là dư.
    await expect(rowB).toContainText(targetShopName, {
      timeout: spec === "A" ? 5_000 : 30_000,
    });
    // Row vẫn là row của đơn đó (không phải row khác tình cờ chứa tên shop)
    await expect(rowB.getByTestId(`fulfill-code-${code}`)).toBeVisible();

    if (spec === "B") {
      // Page A (SSE sống) update NHANH hơn page B (polling) — chứng minh 2 kênh
      // khác nhau: A không phụ thuộc tick poll.
      await expect(page.locator(`tr[data-row-key="${code}"]`)).toContainText(targetShopName, {
        timeout: 5_000,
      });
    }
    await pageB.close();
  });
}
