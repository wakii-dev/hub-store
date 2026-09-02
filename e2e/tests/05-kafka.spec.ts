import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * SF-27 — Kafka event bus E2E (enabled-mode only — side-channel nên spec
 * KHÔNG chạy trong mặc định stack). Verify bằng mắt qua kafka-ui REST:
 * topics đủ 3 + publish thật từ nghiệp vụ D1 (assign) + D1b (create batch).
 *
 * Runbook (spec §7):
 *   1) docker compose --profile kafka up -d kafka kafka-init kafka-ui
 *   2) KAFKA_ENABLED=true trên 3 service (BFF đọc root .env; Java/Go shell
 *      export hoặc run.sh) + boot-all.sh
 *   3) KAFKA_ENABLED=true pnpm --filter e2e test 05-kafka
 *
 * Skip rule thống nhất '1'|'true' (như Go/BFF).
 */
test.skip(
  !(process.env.KAFKA_ENABLED === "1" || process.env.KAFKA_ENABLED === "true"),
  "KAFKA_ENABLED not enabled — kafka spec skipped",
);

const BFF = "http://localhost:8080";
const KAFKA_UI = "http://localhost:8085";
const APP = "http://localhost:3000";

/**
 * Bearer token cho BFF — đọc từ localStorage của shell (oidc-client-ts
 * userStore, key `oidc.user:<authority>:<client>`). storageState coordinator
 * (playwright config) đã có session Keycloak thật; app mở là silent-renew
 * chạy nếu token hết hạn.
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

/** APIRequestContext gọi BFF kèm Authorization. */
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

async function pollTopics(): Promise<string[]> {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics`);
      if (res.ok) {
        // kafka-ui trả envelope { pageCount, topics: [{ name, ... }] }.
        const body = (await res.json()) as { topics?: Array<{ name: string }> };
        return (body.topics ?? []).map((t) => t.name);
      }
    } catch {
      /* kafka-ui chưa lên — retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return [];
}

/**
 * kafka-ui messages endpoint trả SSE stream — mỗi event một dòng `data:{...}`,
 * message thật có type=MESSAGE + message.content là JSON string của envelope.
 */
async function lastMessages(topic: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics/${topic}/messages?limit=20`);
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
      /* event điều khiển (PHASE/DONE) hoặc JSON cắt — bỏ qua */
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

test("kafka có đủ 3 topics", async () => {
  const topics = await pollTopics();
  expect(topics).toEqual(
    expect.arrayContaining(["order-events", "batch-events", "notification-events"]),
  );
});

test("assign shop-hub → order-events có order.assigned", async ({ page, request }) => {
  const api = bff(request, await bearerToken(page));

  // 1 đơn Chưa soạn (batchStatus=0) từ seed.
  const filterRes = await api.post("/fulfillment/filter", { batchStatus: [0], page: 1, pageSize: 1 });
  expect(filterRes.ok(), `filter fail: ${filterRes.status()}`).toBeTruthy();
  const code = ((await filterRes.json()) as { items: Array<{ fulfillCode: string }> }).items[0]
    ?.fulfillCode;
  expect(code, "cần 1 đơn batchStatus=0 từ seed").toBeTruthy();

  // Shop khác shop hiện tại của đơn — lấy shop đầu trong master-data.
  const shopsRes = await api.get("/master-data/shops");
  const shops = (await shopsRes.json()) as Array<{ shopCode: string }>;
  const target = shops.find((s) => s.shopCode)?.shopCode;
  expect(target, "cần ít nhất 1 shop trong master-data").toBeTruthy();

  const assignRes = await api.post(`/fulfillment/${code}/assign-shop-hub`, { toShopCode: target });
  expect(assignRes.ok(), `assign fail: ${assignRes.status()} — ${await assignRes.text()}`).toBeTruthy();

  expect(await waitForType("order-events", "order.assigned"), "order.assigned trên order-events").toBe(
    true,
  );
});

test("create batch → batch-events có batch.created", async ({ page, request }) => {
  const api = bff(request, await bearerToken(page));

  // Đơn Chưa soạn để tạo phiếu (Go derive shop từ hydration).
  const filterRes = await api.post("/fulfillment/filter", { batchStatus: [0], page: 1, pageSize: 10 });
  expect(filterRes.ok(), `filter fail: ${filterRes.status()}`).toBeTruthy();
  const orders = (await filterRes.json()) as { items: Array<{ fulfillCode: string }> };
  const codes = orders.items.map((o) => o.fulfillCode).slice(0, 2);
  expect(codes.length, "cần đơn để tạo batch").toBeGreaterThan(0);

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

  expect(await waitForType("batch-events", "batch.created"), "batch.created trên batch-events").toBe(
    true,
  );
});
