import { createHmac } from "node:crypto";
import fs from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * SF-26 (FI-271) — webhook nhận đơn từ sàn E2E (API-level, KHÔNG browser).
 * Chạy qua private seam sf-26-* (runner e2e/scripts/run-sf26-private.sh):
 *   BFF :19080 · Java :53051 · kafka host-listener :56492 · kafka-ui :56485 ·
 *   pg :56441 · Keycloak SHARE :8081 (bearer mint trước qua runner).
 *
 * Skip-gate: E2E_SF26 !== '1' → skip toàn bộ (runner đặt env).
 *
 * 6 scenarios (serial, 1 worker — chia state module):
 *   1. Valid  → 200 ORD-* replayed:false + list-orders thấy đơn (name/phone)
 *              + audit actor webhook:shopee
 *   2. Replay same externalId → 200 cùng fulfillCode replayed:true, count
 *              KHÔNG đổi (dedupe webhook_events)
 *   3. Sai signature / thiếu header → 401 (fail-closed HMAC)
 *   4. Sai phone + items rỗng → 422 details[] đúng field từng lỗi
 *   5. 422 → sửa payload cùng externalId → 200 code MỚI replayed:false
 *              (webhook_events FAILED → reprocess)
 *   6. Kafka order-events có order.created với fulfillCode scenario 1
 *              (kafka-ui SSE — pattern 05-kafka.spec.ts)
 */

test.skip(
  process.env.E2E_SF26 !== "1",
  "E2E_SF26 not enabled — webhook spec skipped (chạy qua run-sf26-private.sh)",
);

const BFF = process.env.E2E_BFF_URL ?? "http://localhost:19080"; // private-port seam
const KAFKA_UI = process.env.E2E_SF26_KAFKA_UI ?? "http://localhost:56485";
const SECRET = "e2e-sf26-secret"; // khớp WEBHOOK_HMAC_SECRET của runner
const STORAGE_STATE = process.env.E2E_SF26_STORAGE ?? "";

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

// externalId duy nhất mỗi lần chạy — dedupe (source, external_id) scope run này.
const RUN = Date.now();
const EXT_MAIN = `sf26-e2e-${RUN}`;
const EXT_RETRY = `sf26-e2e-${RUN}-retry`;

const VALID = {
  externalId: EXT_MAIN,
  customerName: "Khách Webhook E2E",
  customerPhone: "0901234567",
  customerAddress: "12 Nguyễn Huệ, Q1, TP.HCM",
  items: [{ productCode: "SKU-WH-1", productName: "Sản phẩm webhook", quantity: 2 }],
  codAmount: 250000,
};

// State chung — workers=1 + serial nên deterministic.
let bearer = "";
let code1 = ""; // fulfillCode scenario 1 — dùng lại ở 2 và 6
let code5 = ""; // fulfillCode scenario 5 (reprocess sau 422)

/** POST /webhooks/orders thô — HMAC sign đúng raw bytes (KHÔNG qua JWT). */
function postWebhook(
  request: APIRequestContext,
  raw: string,
  opts: { signature?: string | null; source?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers["x-source"] = opts.source ?? "shopee";
  if (opts.signature !== null) headers["x-signature"] = opts.signature ?? sign(raw);
  return request.post(`${BFF}/webhooks/orders`, { headers, data: raw });
}

/** Access token Keycloak từ storageState mint bởi runner (pattern 05-nvc-api). */
function readToken(): string {
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.startsWith("oidc.user:")) continue;
      const user = JSON.parse(entry.value) as { access_token?: string };
      if (user.access_token) return user.access_token;
    }
  }
  throw new Error(`Không tìm thấy access_token trong ${STORAGE_STATE} — runner mint chưa chạy?`);
}

/** APIRequestContext gọi BFF kèm Authorization (pattern 05-kafka bff()). */
function bff(request: APIRequestContext) {
  return {
    post: (p: string, data: unknown) =>
      request.post(`${BFF}${p}`, {
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        data,
      }),
    get: (p: string) =>
      request.get(`${BFF}${p}`, { headers: { authorization: `Bearer ${bearer}` } }),
  };
}

/**
 * kafka-ui messages endpoint trả SSE stream — parse `data:` lines
 * (đúng pattern 05-kafka.spec.ts); message thật type=MESSAGE,
 * message.content = JSON envelope {type, payload:{...}}.
 */
async function orderCreatedPayloads(): Promise<Array<Record<string, unknown>>> {
  // limit=1000: kafka-ui trả messages từ ĐẦU partition — topic order-events
  // lớn dần sau mỗi lần chạy (SF-7 QA: 134 offsets → limit=50 không bao giờ
  // thấy event mới ở tail → test 6 timeout 30s deterministic).
  const res = await fetch(`${KAFKA_UI}/api/clusters/local/topics/order-events/messages?limit=1000`);
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
      const envelope = JSON.parse(evt.message.content) as {
        type?: string;
        payload?: Record<string, unknown>;
      };
      if (envelope.type === "order.created" && envelope.payload) {
        out.push(envelope.payload);
      }
    } catch {
      /* event điều khiển (PHASE/DONE) hoặc JSON cắt — bỏ qua */
    }
  }
  return out;
}

test("1. valid → 200 ORD-* replayed:false + list-orders + audit actor webhook:shopee", async ({
  request,
}) => {
  bearer = readToken();
  const raw = JSON.stringify(VALID);
  const res = await postWebhook(request, raw);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { fulfillCode: string; replayed: boolean };
  expect(body.fulfillCode).toMatch(/^ORD-\d+$/);
  expect(body.replayed).toBe(false);
  code1 = body.fulfillCode;

  // D1 list-orders — đơn thấy qua BFF với đúng customer name/phone
  const api = bff(request);
  const filter = await api.post("/fulfillment/filter", {
    fulfillCode: code1,
    page: 1,
    pageSize: 10,
  });
  expect(filter.ok(), `filter fail: ${filter.status()}`).toBeTruthy();
  const list = (await filter.json()) as {
    items: Array<{ fulfillCode: string; customerName?: string; customerPhone?: string }>;
    total: number;
  };
  expect(list.total).toBe(1);
  expect(list.items[0]?.fulfillCode).toBe(code1);
  expect(list.items[0]?.customerName).toBe(VALID.customerName);
  expect(list.items[0]?.customerPhone).toBe(VALID.customerPhone);

  // Audit entry — actor webhook:shopee (không phải user JWT)
  const audit = await api.get(`/orders/${code1}/audit`);
  expect(audit.ok(), `audit fail: ${audit.status()} — ${await audit.text()}`).toBeTruthy();
  const entries = (await audit.json()) as { items: Array<{ actor: string; action: string }> };
  expect(
    entries.items.some((e) => e.actor === "webhook:shopee" && e.action === "order.created"),
    "audit entry order.created actor webhook:shopee",
  ).toBe(true);
});

test("2. replay same externalId → 200 cùng fulfillCode replayed:true, count không đổi", async ({
  request,
}) => {
  const raw = JSON.stringify(VALID);
  const res = await postWebhook(request, raw);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { fulfillCode: string; replayed: boolean };
  expect(body.fulfillCode).toBe(code1);
  expect(body.replayed).toBe(true);

  // Count đơn theo fulfillCode KHÔNG đổi — replay KHÔNG tạo đơn mới
  const api = bff(request);
  const filter = await api.post("/fulfillment/filter", {
    fulfillCode: code1,
    page: 1,
    pageSize: 10,
  });
  const list = (await filter.json()) as { total: number };
  expect(list.total).toBe(1);
});

test("3. sai signature → 401; thiếu header → 401", async ({ request }) => {
  const raw = JSON.stringify(VALID);
  const good = sign(raw);
  const tampered = (good[0] === "0" ? "1" : "0") + good.slice(1); // đổi 1 ký tự

  const badSig = await postWebhook(request, raw, { signature: tampered });
  expect(badSig.status()).toBe(401);

  const noSig = await postWebhook(request, raw, { signature: null });
  expect(noSig.status()).toBe(401);
});

test("4. sai phone + items rỗng → 422 details[] đúng field từng lỗi", async ({ request }) => {
  const bad = { ...VALID, externalId: EXT_RETRY, customerPhone: "123", items: [] };
  const res = await postWebhook(request, JSON.stringify(bad));
  expect(res.status()).toBe(422);
  const body = (await res.json()) as {
    details?: Array<{ field: string; message: string }>;
  };
  const fields = (body.details ?? []).map((d) => d.field);
  expect(fields).toContain("customerPhone");
  expect(fields).toContain("items");
});

test("5. 422 → sửa payload cùng externalId → 200 code MỚI replayed:false", async ({ request }) => {
  const fixed = { ...VALID, externalId: EXT_RETRY };
  const res = await postWebhook(request, JSON.stringify(fixed));
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { fulfillCode: string; replayed: boolean };
  expect(body.fulfillCode).toMatch(/^ORD-\d+$/);
  expect(body.replayed).toBe(false);
  expect(body.fulfillCode).not.toBe(code1); // lần FAILED trước KHÔNG cấp code
  code5 = body.fulfillCode;
});

test("6. kafka order-events có order.created với fulfillCode scenario 1", async () => {
  expect(code1, "scenario 1 phải chạy trước (serial)").toBeTruthy();
  let found = false;
  for (let i = 0; i < 30 && !found; i++) {
    const payloads = await orderCreatedPayloads();
    found = payloads.some((p) => p["fulfillCode"] === code1);
    if (!found) await new Promise((r) => setTimeout(r, 1000));
  }
  expect(found, `order.created payload fulfillCode=${code1} trên order-events (≤30s)`).toBe(true);
});
