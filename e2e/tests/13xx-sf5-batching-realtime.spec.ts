import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * SF-5 (FI-285) — regression 13xx: Batching/D1 + Realtime + Kafka + Map.
 *
 * Tự lập state: mỗi test tự filter/tự chọn đơn từ seed (batchStatus=0, bỏ
 * đơn chia nợ, cùng kho cho create-batch — rule §3.6) rồi tự mutate qua
 * BFF/UI; KHÔNG phụ thuộc mutation của spec khác. KHÔNG import
 * e2e/tests/sf11-helpers.ts (boundary SF-5).
 *
 * Private seam SF-5 (scripts/run-sf5-private.sh — KAFKA ON):
 *   E2E_SHELL_URL=http://localhost:4310 E2E_BFF_URL=http://localhost:4295
 *   E2E_KAFKA_UI_URL=http://localhost:8086 (kafka-ui RIÊNG của seam — spec
 *   05-kafka hardcode :8085 là kafka-ui stack chính, không dùng ở đây)
 *   E2E_REUSE=1
 *
 * Pattern bearer/localStorage + kafka-ui SSE parse: copy 05-kafka.spec.ts
 * (SF-27); pattern 2-page SSE: copy 07-realtime.spec.ts (SF-10); pattern
 * map seed localStorage: copy 08-map.spec.ts (SF-24).
 */

const APP = process.env.E2E_SHELL_URL ?? "http://localhost:4310";
const BFF = process.env.E2E_BFF_URL ?? "http://localhost:4295";
const KAFKA_UI = process.env.E2E_KAFKA_UI_URL ?? "http://localhost:8086";

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

async function lastMessages(topic: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics/${topic}/messages?limit=50`);
  if (!res.ok) return [];
  const sse = await res.text();
  const out: Array<Record<string, unknown>> = [];
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const evt = JSON.parse(line.slice(5).trim()) as {
        type?: string;
        message?: { content?: string } | null;
      };
      if (evt.type !== "MESSAGE" || !evt.message?.content) continue;
      out.push(JSON.parse(evt.message.content) as Record<string, unknown>);
    } catch {
      /* event điều khiển — bỏ qua */
    }
  }
  return out;
}

async function waitForType(topic: string, type: string): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    const msgs = await lastMessages(topic);
    if (msgs.some((m) => m["type"] === type)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

test.describe.serial("13xx — SF-5 batching/realtime/kafka/map regression", () => {
  test("1301 kafka canary: 3 topics trên kafka-ui của seam", async () => {
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics`);
        if (res.ok) {
          const body = (await res.json()) as { topics?: Array<{ name: string }> };
          const topics = (body.topics ?? []).map((t) => t.name);
          expect(topics).toEqual(
            expect.arrayContaining(["order-events", "batch-events", "notification-events"]),
          );
          return;
        }
      } catch {
        /* kafka-ui chưa lên — retry */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`kafka-ui ${KAFKA_UI} không sẵn sàng`);
  });

  test("1302 assign shop qua BFF → order-events có order.assigned", async ({ page, request }) => {
    const api = bff(request, await bearerToken(page));

    const filterRes = await api.post("/fulfillment/filter", { batchStatus: [0], page: 1, pageSize: 50 });
    expect(filterRes.ok(), `filter fail: ${filterRes.status()}`).toBeTruthy();
    const orders = (await filterRes.json()) as {
      items: Array<{ fulfillCode: string; isDebtSplittingOrder?: boolean; shopAssignment?: { shopCode?: string } }>;
    };
    const code = orders.items.find((o) => !o.isDebtSplittingOrder)?.fulfillCode;
    expect(code, "cần 1 đơn batchStatus=0 không chia nợ").toBeTruthy();

    const shopsRes = await api.get("/master-data/shops");
    const shopsBody = (await shopsRes.json()) as { items?: Array<{ shopCode: string }> };
    const currentShop = orders.items.find((o) => o.fulfillCode === code)?.shopAssignment?.shopCode;
    const target = (shopsBody.items ?? []).find((s) => s.shopCode && s.shopCode !== currentShop)
      ?.shopCode;
    expect(target, "cần ít nhất 1 shop khác").toBeTruthy();

    const assignRes = await api.post(`/fulfillment/${code}/assign-shop-hub`, { toShopCode: target });
    expect(assignRes.ok(), `assign fail: ${assignRes.status()} — ${await assignRes.text()}`).toBeTruthy();

    expect(await waitForType("order-events", "order.assigned"), "order.assigned trên order-events").toBe(true);
  });

  test("1303 create batch → batch-events có batch.created + đơn rời batchStatus=0", async ({ page, request }) => {
    const api = bff(request, await bearerToken(page));

    const filterRes = await api.post("/fulfillment/filter", { batchStatus: [0], page: 1, pageSize: 50 });
    expect(filterRes.ok(), `filter fail: ${filterRes.status()}`).toBeTruthy();
    const orders = (await filterRes.json()) as {
      items: Array<{ fulfillCode: string; isDebtSplittingOrder?: boolean; shopAssignment?: { shopCode?: string } }>;
    };
    const byShop = new Map<string, string[]>();
    for (const o of orders.items) {
      if (o.isDebtSplittingOrder) continue;
      const shop = o.shopAssignment?.shopCode ?? "?";
      byShop.set(shop, [...(byShop.get(shop) ?? []), o.fulfillCode]);
    }
    const codes = [...byShop.values()].sort((a, b) => b.length - a.length)[0]?.slice(0, 2) ?? [];
    expect(codes.length, "cần ≥1 đơn cùng kho để tạo batch").toBeGreaterThan(0);

    const createRes = await api.post("/fulfillment/batches/create", {
      orderCodes: codes,
      shipperId: "STAFF-001",
      deliveryTime: {
        from: "2026-09-10T08:00:00+07:00",
        to: "2026-09-10T12:00:00+07:00",
      },
    });
    expect(
      createRes.ok(),
      `create fail: ${createRes.status()} — ${await createRes.text()}`,
    ).toBeTruthy();

    expect(await waitForType("batch-events", "batch.created"), "batch.created trên batch-events").toBe(true);

    // đơn đã vào batch → không còn batchStatus=0
    const after = await api.post("/fulfillment/filter", { batchStatus: [0], page: 1, pageSize: 50 });
    const afterBody = (await after.json()) as { items: Array<{ fulfillCode: string }> };
    for (const c of codes) {
      expect(
        afterBody.items.some((o) => o.fulfillCode === c),
        `${c} phải rời danh sách Chưa soạn sau create-batch`,
      ).toBe(false);
    }

    // FI-285 bug #1 regression: target=1 phải persist batchCode từ request
    // (trước đây Java drop → đơn "Đang soạn" mất link phiếu, D1 không hiện batch-link)
    const preparing = await api.post("/fulfillment/filter", { batchStatus: [1], page: 1, pageSize: 50 });
    const preparingBody = (await preparing.json()) as {
      items: Array<{ fulfillCode: string; batchCode?: string }>;
    };
    for (const c of codes) {
      const row = preparingBody.items.find((o) => o.fulfillCode === c);
      expect(row, `${c} phải ở batchStatus=1 (Đang soạn) sau create-batch`).toBeTruthy();
      expect(
        row?.batchCode,
        `${c} phải có batch_code persist (FI-285 bug #1 — D1 batch-link)`,
      ).toBeTruthy();
    }
  });

  test("1304 realtime SSE: page A gán shop → page B row đổi KHÔNG reload", async ({ page, request }) => {
    const token = await bearerToken(page);
    const api = bff(request, token);

    const filterRes = await api.post("/fulfillment/filter", { batchStatus: [0], page: 1, pageSize: 50 });
    const orders = (await filterRes.json()) as {
      items: Array<{
        fulfillCode: string;
        isDebtSplittingOrder?: boolean;
        shopAssignment?: { shopCode?: string; shopName?: string };
      }>;
    };
    const shopsRes = await api.get("/master-data/shops");
    const shops = (await shopsRes.json()) as { items?: Array<{ shopCode: string; shopName: string }> };
    const shopNameByCode = new Map((shops.items ?? []).map((s) => [s.shopCode, s.shopName]));

    let code = "", currentName = "", targetName = "", targetCode = "";
    for (const o of orders.items) {
      const cur = o.shopAssignment?.shopCode;
      const name = o.shopAssignment?.shopName ?? shopNameByCode.get(cur ?? "");
      const target = (shops.items ?? []).find((s) => s.shopCode !== cur);
      if (!o.isDebtSplittingOrder && cur && name && target) {
        code = o.fulfillCode;
        currentName = name;
        targetName = target.shopName;
        targetCode = target.shopCode;
        break;
      }
    }
    expect(code, "cần 1 đơn batchStatus=0 + shop khác").toBeTruthy();

    const pageB = await page.context().newPage();
    // Lọc "Chưa soạn" cả 2 page — list mặc định nhiều trạng thái/pagination
    // nên row mục tiêu có thể không nằm ở trang 1 (pattern 07-realtime SF-10).
    for (const p of [page, pageB]) {
      await p.goto(`${APP}/hub-store-order/order`);
      await expect(p.getByText("Danh sách đơn hàng kho chi nhánh")).toBeVisible();
      await p.locator(".ant-select").filter({ hasText: "Trạng thái soạn hàng" }).click();
      await p
        .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
        .filter({ hasText: "Chưa soạn" })
        .first()
        .click();
      await p.keyboard.press("Escape");
      await p.getByRole("button", { name: "Tìm kiếm" }).click();
    }

    const rowB = pageB.locator(`tr[data-row-key="${code}"]`);
    await expect(rowB).toBeVisible();
    await expect(rowB).toContainText(currentName);

    const assignRes = await api.post(`/fulfillment/${code}/assign-shop-hub`, { toShopCode: targetCode });
    expect(assignRes.ok(), `assign fail: ${assignRes.status()}`).toBeTruthy();

    // SSE push → page B refetch, KHÔNG reload
    await expect(rowB).toContainText(targetName, { timeout: 10_000 });
    await expect(rowB.getByTestId(`fulfill-code-${code}`)).toBeVisible();
    await pageB.close();
  });

  test("1305 map tracking: batch seed → modal → tab bản đồ render markers", async ({ page }) => {
    const BATCH = "BATCH-0001"; // seed canonical-seed.json — ACTIVE
    await page.route("**://*.tile.openstreetmap.org/**", (r) => r.abort());
    await page.addInitScript((batch) => {
      localStorage.setItem(
        `nvc.plannings.${batch}`,
        JSON.stringify([
          { planningId: "pl-13xx-1", orderCode: "ORD-E2E-A", stopOrder: 1, serviceId: "1T", vehicleType: "TRUCK", addons: [] },
          { planningId: "pl-13xx-2", orderCode: "ORD-E2E-B", stopOrder: 2, serviceId: "1T", vehicleType: "TRUCK", addons: [] },
        ]),
      );
    }, BATCH);

    await page.goto(`${APP}/hub-store-order/batch`);
    await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
    await page.getByPlaceholder("Số phiếu / Số đơn").fill(BATCH);
    await page.getByRole("button", { name: "Tìm kiếm" }).click();
    await page.getByTestId(`batch-track-${BATCH}`).click();
    await page.getByTestId("tracking-map-tab").click();
    const map = page.getByTestId("tracking-route-map");
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    expect(box?.width).toBeGreaterThan(300);
    await expect(page.locator('[data-stop-order="1"]')).toBeVisible();
    await expect(page.locator('[data-stop-order="2"]')).toBeVisible();
    await expect(page.getByTestId("warehouse-marker")).toBeVisible();
    await page.locator('[data-stop-order="1"]').click();
    await expect(page.getByTestId("route-stop-popup-ORD-E2E-A")).toBeVisible();
  });

  test("1306 tech map: tab Bản đồ header đếm = số pins (FI-285 bug #2)", async ({ page }) => {
    // Regression bug #2: MapTab không truyền onTotal → header "0 đơn" dù pins render.
    await page.goto(`${APP}/hub-store-order/tech`);
    await expect(page.getByText("Đơn dịch vụ kỹ thuật")).toBeVisible();
    await page.getByRole("tab", { name: "Bản đồ" }).click();
    const mapView = page.getByTestId("tech-map-view");
    await expect(mapView).toBeVisible();
    // Header phải đếm > 0 và khớp số pin render (cùng nguồn fetch).
    await expect
      .poll(async () => {
        const header = await page.evaluate(() => {
          const m = document.body.innerText.match(/(\d+) đơn · đồng bộ/);
          return m ? Number(m[1]) : -1;
        });
        const pins = await page.evaluate(
          () => document.querySelectorAll('[data-testid^="tech-map-pin-"]').length,
        );
        return { header, pins, ok: pins > 0 && header === pins };
      })
      .toStrictEqual({ header: expect.any(Number), pins: expect.any(Number), ok: true });
  });
});
