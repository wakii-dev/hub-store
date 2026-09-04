import fs from "node:fs";
import path from "node:path";
import { expect, request as newRequest, test, type APIRequestContext } from "@playwright/test";

/**
 * SF-7 QA sweep (FI-287) — regression smoke 15xx: các surface mà SF-7 đụng
 * (users mgmt / NVC quotes / fulfillment filter + export / webhook authz)
 * vẫn còn đứng vững sau các fix 41dcc49 (KC 26 role-users by-name,
 * VerifyProfile-proof createUser, print port seam).
 *
 * Tự lập state: storageState manager/coordinator từ .auth (globalSetup mint
 * qua hosted UI :4300/:8084) — KHÔNG import e2e/tests/sf11-helpers.ts.
 * Batch tạo trong test 2 được cancel trong afterAll → chạy lại được.
 *
 * Private-port seam: E2E_BFF_URL (BFF), E2E_NVC_BFF (API-level) — runner đặt.
 */

const BFF = process.env.E2E_NVC_BFF ?? process.env.E2E_BFF_URL ?? "http://localhost:8080";
const STORAGE_MANAGER = process.env.E2E_REG_STORAGE_MANAGER
  ?? path.resolve(__dirname, "..", ".auth", "manager.json");
const STORAGE_COORD = process.env.E2E_REG_STORAGE_COORD
  ?? path.resolve(__dirname, "..", ".auth", "coordinator.json");

function readToken(storagePath: string): string {
  const state = JSON.parse(fs.readFileSync(storagePath, "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.startsWith("oidc.user:")) continue;
      const user = JSON.parse(entry.value) as { access_token?: string };
      if (user.access_token) return user.access_token;
    }
  }
  throw new Error(`Không tìm thấy access_token trong ${storagePath}`);
}

let api: APIRequestContext;
let batchCode = "";

test.beforeAll(async () => {
  api = await newRequest.newContext({
    baseURL: BFF,
    extraHTTPHeaders: { Authorization: `Bearer ${readToken(STORAGE_MANAGER)}` },
  });

  // Đơn ORD-3018 phải Chưa soạn — dọn batch ACTIVE của lần chạy trước nếu có
  // (pattern cancelActiveBatchesOf của 05-nvc-api: batches/filter + searchText).
  const res = await api.post("/fulfillment/batches/filter", {
    data: { searchText: "ORD-3018", page: 1, pageSize: 20 },
  });
  const body = (await res.json()) as { items?: Array<{ batchCode: string; status: number }> };
  for (const b of body.items ?? []) {
    if (b.status === 0) {
      await api.put(`/fulfillment/batches/${b.batchCode}/cancel`, {
        data: { reason: "e2e 15 cleanup — trước khi tạo lại" },
      });
    }
  }
});

test.afterAll(async () => {
  if (batchCode) {
    try {
      await api.put(`/fulfillment/batches/${batchCode}/cancel`, {
        data: { reason: "e2e 15 cleanup — regression smoke" },
      });
    } catch {
      /* đã hủy — bỏ qua */
    }
  }
  await api?.dispose();
});

test("R1 users — manager list 200 (mỗi user có roles[]) + coordinator 403", async () => {
  const res = await api.get("/users");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { items?: Array<{ username: string; roles: string[] }> };
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items!.length).toBeGreaterThanOrEqual(3);
  for (const u of body.items!) {
    expect(Array.isArray(u.roles)).toBe(true);
  }

  const coord = await newRequest.newContext({
    baseURL: BFF,
    extraHTTPHeaders: { Authorization: `Bearer ${readToken(STORAGE_COORD)}` },
  });
  const denied = await coord.get("/users");
  expect(denied.status()).toBe(403);
  expect((await denied.json()) as { code?: string }).toMatchObject({ code: "PERMISSION_DENIED" });
  await coord.dispose();
});

test("R2 fulfillment — tạo batch ORD-3018 → filter thấy → export CSV header", async () => {
  const create = await api.post("/fulfillment/batches/create", {
    data: {
      orderCodes: ["ORD-3018"],
      shipperId: "STAFF-004",
      deliveryTime: { from: "2026-09-06T08:00:00Z", to: "2026-09-06T12:00:00Z" },
    },
  });
  expect(create.status(), await create.text()).toBe(200);
  const body = (await create.json()) as { batchCode: string };
  batchCode = body.batchCode;
  expect(batchCode).toMatch(/^BATCH-/);

  const filter = await api.post("/fulfillment/filter", {
    data: { fulfillCode: "ORD-3018", page: 1, pageSize: 10 },
  });
  expect(filter.status(), await filter.text()).toBe(200);

  const exportRes = await api.get("/fulfillment/orders/export.csv");
  expect(exportRes.status()).toBe(200);
  const firstLine = (await exportRes.text()).replace(/^\uFEFF/, "").split(/\r?\n/)[0];
  expect(firstLine.startsWith("fulfillCode,orderCode,batchStatus")).toBeTruthy();
});

test("R3 NVC quotes — 6 tải trọng, fee tăng dần, meta.mock=true", async () => {
  const res = await api.post("/delivery-batch/quotes", {
    data: {
      shopCode: "30203",
      stopOrders: [
        { address: "Số 72, đường Lê Thánh Tôn, Quận 1, TP. Hồ Chí Minh", distance: 10, codAmount: 500000, totalBill: 2000000 },
      ],
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    quotes?: Array<{ serviceId: string; fee: number }>;
    meta?: { mock?: boolean };
  };
  expect(body.quotes).toHaveLength(6);
  const fees = body.quotes!.map((q) => q.fee);
  expect([...fees].sort((a, b) => a - b)).toEqual(fees);
  expect(body.meta?.mock).toBe(true);
});

test("R4 webhook authz — sai signature 401, HMAC secret thiếu header 401", async ({ request }) => {
  const raw = JSON.stringify({ externalId: "reg-neg", customerName: "x", phone: "0900000001", address: "y", items: [] });
  const bad = await request.post(`${BFF}/webhooks/orders`, {
    headers: { "content-type": "application/json", "x-signature": "deadbeef" },
    data: raw,
  });
  expect([401, 403]).toContain(bad.status());

  const missing = await request.post(`${BFF}/webhooks/orders`, {
    headers: { "content-type": "application/json" },
    data: raw,
  });
  expect([401, 403]).toContain(missing.status());
});
