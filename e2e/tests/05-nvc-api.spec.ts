import fs from "node:fs";
import path from "node:path";
import { expect, request as newRequest, test, type APIRequestContext } from "@playwright/test";

/**
 * SF-15 Task 8 — NVC (Ahamove adapter) API-level E2E — REST qua BFF (:8080),
 * KHÔNG gọi gRPC trực tiếp. Mock mode (AHAMOVE_MODE unset → mock, meta.mock=true).
 *
 * Flow phủ acceptance mock mode:
 *   1. Quotes       — 6 tải trọng, fee tăng dần, đúng công thức @10km,
 *                     isExceedFeeLimit (limit 150000, strict >) + meta.mock.
 *   2. Confirm      — planning/confirm 1T: fee SERVER-TRUTH khớp distance
 *                     thực của đơn (hydrate batch_items), status CONFIRMED.
 *   3. Booking      — MOCK-* carrierBookingId, driver "name - phone", biển số.
 *   4. Fee-limit    — confirm 8T (fee > 150000) → 422 PRECONDITION_FAILED;
 *                     cancel-batch trả results rỗng = KHÔNG gì được persist.
 *   5. Tracking     — searchbookingdetail: timeline ORDER_CREATED + DRIVER_FOUND;
 *                     AHAMOVE_MOCK_FAST=1 → DELIVERING xuất hiện sau ~6s.
 *   6. Cancel+rebook— cancel-delivery-order → CANCELLED (booking=null khi
 *                     search); rebook = confirm lại (cùng planningId) + booking
 *                     row MỚI (carrierBookingId mới).
 *   7. Cancel-batch — cancelledCount ≥ 1; planning CONFIRMED chưa book → DRAFT.
 *
 * Dùng đơn ORD-3019/3020/3021 (shop 30203; ORD-3021 7.9km — fee-limit batch,
 * 8T @ 7.9km = 222.700 > 150.000) — KHÔNG đụng đơn 01-04 đã dùng +
 * shipper STAFF-004. Batch fulfillment được cancel trong afterAll (đơn revert
 * Chưa soạn) → spec chạy LẠI được trên DB persist (FI-245).
 *
 * AHAMOVE_MOCK_FAST=1: timeline advance (test 5) chỉ chạy khi env của tiến
 * trình test (= tiến trình boot batching-service qua run.sh sourcing .env)
 * có AHAMOVE_MOCK_FAST=1 — thêm vào root .env LOCAL (không commit .env) hoặc
 * export trước khi chạy. Thiếu → test 5 skip với message rõ, KHÔNG fail.
 */

const SHOP = "30203";
const SHIPPER = "STAFF-004"; // seed deliveryStaff shop 30203
const LIMIT = 150000; // fee_limits seed 30201..30205
// Private-port E2E seam: override qua env (playwright.nvc.config.ts — ports
// riêng tránh xung đột cross-worktree); mặc định khớp stack boot-all chuẩn.
const BFF = process.env.E2E_NVC_BFF ?? "http://localhost:8080";
const STORAGE_STATE = process.env.E2E_NVC_STORAGE ?? path.resolve(__dirname, "..", ".auth", "coordinator.json");

/** mockFleet (internal/ahamove/mock.go) — bảng giá deterministic VND/km. */
const FLEET = [
  { serviceId: "SGCN", baseFee: 10000, perKm: 3000 },
  { serviceId: "500KG", baseFee: 25000, perKm: 4500 },
  { serviceId: "1T", baseFee: 40000, perKm: 6000 },
  { serviceId: "2T", baseFee: 60000, perKm: 8000 },
  { serviceId: "3.5T", baseFee: 85000, perKm: 10000 },
  { serviceId: "8T", baseFee: 120000, perKm: 13000 },
] as const;

/** Quote.Fee (Go) — baseFee + round(perKm × km). JS Math.round cùng IEEE754. */
const feeOf = (serviceId: string, km: number) => {
  const q = FLEET.find((f) => f.serviceId === serviceId);
  if (!q) throw new Error(`serviceId ${serviceId} không có trong mockFleet`);
  return q.baseFee + Math.round(q.perKm * km);
};

// State chung — workers=1 + serial nên chia biến module là deterministic.
let api: APIRequestContext;
let batchCode: string; // batch chính (ORD-3019 + ORD-3020, shop 30203)
let item1: { stopOrder: number; orderCode: string; distance: number; codAmount: number };
let item2: { stopOrder: number; orderCode: string; distance: number; codAmount: number };
let batchCode2: string; // batch fee-limit (ORD-3021, 7.9km → 8T vượt limit)
let item3: { stopOrder: number; orderCode: string; distance: number; codAmount: number };
let planning1: string; // planningId stop 1 batch chính
let planning2: string; // planningId stop 2 batch chính
let carrierId1: string; // carrierBookingId lần book đầu

/** Access token Keycloak từ storageState (oidc-client-ts lưu localStorage). */
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
  throw new Error(`Không tìm thấy access_token trong ${STORAGE_STATE} — globalSetup chưa chạy?`);
}

/** Hủy các batch fulfillment ACTIVE đang chứa đơn (chạy lại an toàn trên DB persist). */
async function cancelActiveBatchesOf(orderCodes: string[]): Promise<void> {
  for (const code of orderCodes) {
    const res = await api.post("/fulfillment/batches/filter", {
      data: { searchText: code, page: 1, pageSize: 20 },
    });
    const body = (await res.json()) as { items?: Array<{ batchCode: string; status: number }> };
    for (const b of body.items ?? []) {
      if (b.status === 0) {
        await api.put(`/fulfillment/batches/${b.batchCode}/cancel`, {
          data: { reason: "e2e 05 cleanup — trước khi tạo lại" },
        });
      }
    }
  }
}

test.beforeAll(async () => {
  api = await newRequest.newContext({
    baseURL: BFF,
    extraHTTPHeaders: { Authorization: `Bearer ${readToken()}` },
  });

  // Đơn 30203 phải Chưa soạn — dọn batch ACTIVE của lần chạy trước nếu có.
  await cancelActiveBatchesOf(["ORD-3018", "ORD-3019", "ORD-3020", "ORD-3021"]);

  const deliveryTime = { from: "2026-09-05T08:00:00Z", to: "2026-09-05T12:00:00Z" };
  // ORD-3019+ORD-3020 = shop 30203 (cùng shop — rule 1 không cản trộn).
  const res1 = await api.post("/fulfillment/batches/create", {
    data: { orderCodes: ["ORD-3019", "ORD-3020"], shipperId: SHIPPER, deliveryTime },
  });
  expect(res1.status()).toBe(200);
  const batch1 = (await res1.json()) as {
    batchCode: string;
    items: Array<{ stopOrder: number; orderCode: string; distance: number; codAmount: number }>;
  };
  batchCode = batch1.batchCode;
  [item1, item2] = batch1.items;
  expect(item1.orderCode).toBe("ORD-3019");
  expect(item2.orderCode).toBe("ORD-3020");

  const res2 = await api.post("/fulfillment/batches/create", {
    data: { orderCodes: ["ORD-3021"], shipperId: SHIPPER, deliveryTime },
  });
  expect(res2.status()).toBe(200);
  const batch2 = (await res2.json()) as { batchCode: string; items: typeof batch1.items };
  batchCode2 = batch2.batchCode;
  item3 = batch2.items[0];
});

test.afterAll(async () => {
  // Revert đơn về Chưa soạn để spec (và 01-04) chạy lại được — best-effort.
  for (const code of [batchCode, batchCode2]) {
    if (!code) continue;
    try {
      await api.put(`/fulfillment/batches/${code}/cancel`, {
        data: { reason: "e2e 05 cleanup — sau test" },
      });
    } catch {
      // đã hủy / batch không tồn tại — bỏ qua.
    }
  }
  await api?.dispose();
});

test("§NVC 1: quotes — 6 tải trọng, fee tăng dần đúng công thức @10km, flag fee-limit, meta.mock", async () => {
  const res = await api.post("/delivery-batch/quotes", {
    data: {
      shopCode: SHOP,
      stopOrders: [
        { address: "Số 72, đường Lê Thánh Tôn, Quận 1, TP. Hồ Chí Minh", distance: 10, codAmount: 500000, totalBill: 2000000 },
      ],
    },
  });
  expect(res.status()).toBe(200);
  const { quotes, meta } = (await res.json()) as {
    quotes: Array<{
      serviceId: string; vehicleType: string; fee: number; baseFee: number;
      isExceedFeeLimit: boolean; addonServices: unknown[];
    }>;
    meta: { mock: boolean };
  };

  expect(meta).toEqual({ mock: true });
  expect(quotes).toHaveLength(6);
  expect(quotes.map((q) => q.serviceId)).toEqual(FLEET.map((f) => f.serviceId));

  // Fee @10km khớp đúng bảng giá mock — tăng dần theo tải trọng.
  expect(quotes.map((q) => q.fee)).toEqual([40000, 70000, 100000, 140000, 185000, 250000]);
  for (let i = 1; i < quotes.length; i++) {
    expect(quotes[i].fee).toBeGreaterThan(quotes[i - 1].fee);
  }

  // isExceedFeeLimit strict > 150000: 3.5T (185000) + 8T (250000) vượt;
  // SGCN..2T (40000..140000) không.
  for (const q of quotes) {
    expect(q.isExceedFeeLimit).toBe(q.fee > LIMIT);
  }
  expect(quotes.find((q) => q.serviceId === "8T")!.isExceedFeeLimit).toBe(true);
  expect(quotes.find((q) => q.serviceId === "2T")!.isExceedFeeLimit).toBe(false);

  // Catalog addon gắn theo quote (seed addon_services).
  expect(quotes[0].addonServices.length).toBeGreaterThan(0);
});

test("§NVC 2: confirm planning 1T — fee SERVER-TRUTH khớp distance thực, status CONFIRMED", async () => {
  const res = await api.post("/delivery-batch/planning/confirm", {
    data: {
      batchCode,
      plannings: [
        { stopOrder: item1.stopOrder, orderCode: item1.orderCode, vehicleType: "1T", serviceId: "1T", addons: ["DOCUMENT"] },
        { stopOrder: item2.stopOrder, orderCode: item2.orderCode, vehicleType: "1T", serviceId: "1T", addons: ["DOCUMENT"] },
      ],
    },
  });
  expect(res.status()).toBe(200);
  const { plannings, meta } = (await res.json()) as {
    plannings: Array<{
      planningId: string; batchCode: string; stopOrder: number; orderCode: string;
      serviceId: string; status: string; fee: number; codAmount: number; addons: string[];
    }>;
    meta: { mock: boolean };
  };

  expect(meta).toEqual({ mock: true });
  expect(plannings).toHaveLength(2);
  for (const [p, item] of [[plannings[0], item1], [plannings[1], item2]] as const) {
    expect(p.batchCode).toBe(batchCode);
    expect(p.stopOrder).toBe(item.stopOrder);
    expect(p.orderCode).toBe(item.orderCode);
    expect(p.serviceId).toBe("1T");
    expect(p.addons).toEqual(["DOCUMENT"]);
    expect(p.status).toBe("CONFIRMED");
    expect(p.codAmount).toBe(item.codAmount);
    // Fee do SERVER persist theo distance hydrate từ batch_items (§3.2).
    expect(p.fee).toBe(feeOf("1T", item.distance));
    // planningId = chuỗi decimal DB id (booking tham chiếu theo id này).
    expect(p.planningId).toMatch(/^\d+$/);
  }
  planning1 = plannings[0].planningId;
  planning2 = plannings[1].planningId;
});

test("§NVC 3: booking — carrierBookingId MOCK-*, driver + biển số, DRIVER_FOUND", async () => {
  const res = await api.post("/delivery-batch/booking", {
    data: {
      batchCode,
      shipmentPlannings: [
        { planningId: planning1, codAmount: item1.codAmount, totalBill: 1200000, stopOrder: item1.stopOrder },
        { planningId: planning2, codAmount: item2.codAmount, totalBill: 800000, stopOrder: item2.stopOrder },
      ],
    },
  });
  expect(res.status()).toBe(200);
  const { bookings, meta } = (await res.json()) as {
    bookings: Array<{ planningId: string; carrierBookingId: string; driver: string; licensePlate: string; status: string }>;
    meta: { mock: boolean };
  };

  expect(meta).toEqual({ mock: true });
  expect(bookings).toHaveLength(2);
  for (const b of bookings) {
    expect([planning1, planning2]).toContain(b.planningId);
    expect(b.carrierBookingId).toMatch(/^MOCK-\d+$/);
    expect(b.driver).toMatch(/ - \d+/); // "tên - số điện thoại" (join 2 field proto)
    expect(b.licensePlate).not.toBe("");
    expect(b.status).toBe("DRIVER_FOUND"); // mock gán tài xế ngay lúc đặt
  }
  carrierId1 = bookings.find((b) => b.planningId === planning1)!.carrierBookingId;
});

test("§NVC 4: fee-limit chặn — confirm 8T (fee > 150000) → 422 PRECONDITION_FAILED, không persist", async () => {
  // 8T @ 7.9km của ORD-3021 = 222.700 > 150.000 — guard else skip (seed đổi).
  const qRes = await api.post("/delivery-batch/quotes", {
    data: {
      shopCode: SHOP,
      stopOrders: [
        { address: "Số 230, đường Võ Văn Tần, Quận 1, TP. Hồ Chí Minh", distance: item3.distance, codAmount: 0, totalBill: 0 },
      ],
    },
  });
  expect(qRes.status()).toBe(200);
  const fee8T = ((await qRes.json()).quotes as Array<{ serviceId: string; fee: number }>).find(
    (q) => q.serviceId === "8T",
  )!.fee;
  test.skip(fee8T <= LIMIT, `8T fee ${fee8T} ≤ limit ${LIMIT} tại distance ${item3.distance}km — fee-limit không trigger được với seed hiện tại`);

  const res = await api.post("/delivery-batch/planning/confirm", {
    data: {
      batchCode: batchCode2,
      plannings: [
        { stopOrder: item3.stopOrder, orderCode: item3.orderCode, vehicleType: "8T", serviceId: "8T", addons: [] },
      ],
    },
  });
  expect(res.status()).toBe(422);
  const err = (await res.json()) as { statusCode: number; code?: string; details?: Array<{ message: string }> };
  expect(err.statusCode).toBe(422);
  expect(err.code).toBe("PRECONDITION_FAILED");
  expect(JSON.stringify(err.details ?? "")).toContain("fee limit");

  // Chứng minh KHÔNG gì được persist: cancel-batch trên batch này → results
  // rỗng (không planning row nào tồn tại để hủy), cancelledCount = 0.
  const cbRes = await api.post("/delivery-batch/cancel-batch", {
    data: { batchCode: batchCode2, reason: "e2e 05 — kiểm chứng không persist sau 422" },
  });
  expect(cbRes.status()).toBe(200);
  const cb = (await cbRes.json()) as { results: unknown[]; cancelledCount: number };
  expect(cb.results).toHaveLength(0);
  expect(cb.cancelledCount).toBe(0);
});

test("§NVC 5: tracking timeline — ORDER_CREATED + DRIVER_FOUND; MOCK_FAST=1 → DELIVERING sau ~6s", async () => {
  const search = () =>
    api.get("/delivery-batch/searchbookingdetail", { params: { planningIds: planning1 } });

  const res1 = await search();
  expect(res1.status()).toBe(200);
  const first = (await res1.json()) as {
    bookings: Array<{
      planningId: string;
      booking: { carrierBookingId: string; status: string } | null;
      timeline: Array<{ status: string; source: string; occurredAt: string }>;
    }>;
  };
  expect(first.bookings).toHaveLength(1);
  expect(first.bookings[0].planningId).toBe(planning1);
  expect(first.bookings[0].booking?.carrierBookingId).toBe(carrierId1);
  const statuses1 = first.bookings[0].timeline.map((t) => t.status);
  expect(statuses1).toContain("ORDER_CREATED");
  expect(statuses1).toContain("DRIVER_FOUND");
  // source: ORDER_CREATED do BE ghi, DRIVER_FOUND từ PARTNER (mock gán ngay).
  expect(first.bookings[0].timeline.find((t) => t.status === "ORDER_CREATED")!.source).toBe("BE");
  expect(first.bookings[0].timeline.find((t) => t.status === "DRIVER_FOUND")!.source).toBe("PARTNER");

  test.skip(
    process.env.AHAMOVE_MOCK_FAST !== "1",
    "AHAMOVE_MOCK_FAST=1 chưa bật (root .env local hoặc export trước khi boot) — bỏ qua test advance timeline",
  );

  // Milestones giây: DRIVER_FOUND +2s, DELIVERING +5s — đợi đủ rồi search lại.
  await new Promise((r) => setTimeout(r, 6_500));
  const res2 = await search();
  expect(res2.status()).toBe(200);
  const second = (await res2.json()) as typeof first;
  const statuses2 = second.bookings[0].timeline.map((t) => t.status);
  expect(statuses2).toContain("DELIVERING");
  // bookings.status sync forward-only theo mốc mới nhất.
  expect(second.bookings[0].booking!.status).toBe("DELIVERING");
});

test("§NVC 6: cancel-delivery-order → CANCELLED; rebook = confirm lại + bookings row MỚI", async () => {
  // 6a. Hủy đơn đã book.
  const cancelRes = await api.post("/delivery-batch/cancel-delivery-order", {
    data: { planningId: planning1, reason: "e2e 05 — khách đổi địa chỉ" },
  });
  expect(cancelRes.status()).toBe(200);
  const cancelled = (await cancelRes.json()) as { planningId: string; status: string };
  expect(cancelled.planningId).toBe(planning1);
  expect(cancelled.status).toBe("CANCELLED");

  // 6b. Search sau hủy: chỉ còn booking CANCELLED → current booking = null.
  const sRes = await api.get("/delivery-batch/searchbookingdetail", { params: { planningIds: planning1 } });
  const after = (await sRes.json()) as { bookings: Array<{ booking: unknown; timeline: unknown[] }> };
  expect(after.bookings[0].booking).toBeNull();
  expect(after.bookings[0].timeline).toHaveLength(0);

  // 6c. Rebook bước 1 — confirm lại (planning CANCELLED → CONFIRMED, cùng row).
  const cRes = await api.post("/delivery-batch/planning/confirm", {
    data: {
      batchCode,
      plannings: [
        { stopOrder: item1.stopOrder, orderCode: item1.orderCode, vehicleType: "1T", serviceId: "1T", addons: ["DOCUMENT"] },
      ],
    },
  });
  expect(cRes.status()).toBe(200);
  const reconfirmed = (await cRes.json()).plannings as Array<{ planningId: string; status: string; fee: number }>;
  expect(reconfirmed[0].planningId).toBe(planning1); // update row cũ, KHÔNG insert mới
  expect(reconfirmed[0].status).toBe("CONFIRMED");
  expect(reconfirmed[0].fee).toBe(feeOf("1T", item1.distance));

  // 6d. Rebook bước 2 — booking lại → bookings row MỚI (carrierBookingId mới).
  const bRes = await api.post("/delivery-batch/booking", {
    data: {
      batchCode,
      shipmentPlannings: [
        { planningId: planning1, codAmount: item1.codAmount, totalBill: 1200000, stopOrder: item1.stopOrder },
      ],
    },
  });
  expect(bRes.status()).toBe(200);
  const rebooked = (await bRes.json()).bookings as Array<{ planningId: string; carrierBookingId: string; status: string }>;
  expect(rebooked[0].planningId).toBe(planning1);
  expect(rebooked[0].carrierBookingId).toMatch(/^MOCK-\d+$/);
  expect(rebooked[0].carrierBookingId).not.toBe(carrierId1);
  expect(rebooked[0].status).toBe("DRIVER_FOUND");

  // 6e. Search → current booking = row MỚI với timeline riêng từ đầu.
  const s2Res = await api.get("/delivery-batch/searchbookingdetail", { params: { planningIds: planning1 } });
  const latest = (await s2Res.json()) as {
    bookings: Array<{ booking: { carrierBookingId: string } | null; timeline: Array<{ status: string }> }>;
  };
  expect(latest.bookings[0].booking!.carrierBookingId).toBe(rebooked[0].carrierBookingId);
  expect(latest.bookings[0].timeline.map((t) => t.status)).toEqual(
    expect.arrayContaining(["ORDER_CREATED", "DRIVER_FOUND"]),
  );
  carrierId1 = rebooked[0].carrierBookingId;
});

test("§NVC 7: cancel-batch — booking ACTIVE → CANCELLED (cancelledCount ≥ 1), CONFIRMED chưa book → DRAFT", async () => {
  // Đảm bảo planning2 ở CONFIRMED CHƯA book: test 3 đã book cả 2 stop (planning2
  // có booking ACTIVE) — hủy booking đó trước rồi confirm lại (chưa book).
  await api.post("/delivery-batch/cancel-delivery-order", {
    data: { planningId: planning2, reason: "e2e 05 — trả planning2 về CONFIRMED-chưa-book cho test 7" },
  });
  const cfRes = await api.post("/delivery-batch/planning/confirm", {
    data: {
      batchCode,
      plannings: [
        { stopOrder: item2.stopOrder, orderCode: item2.orderCode, vehicleType: "1T", serviceId: "1T", addons: [] },
      ],
    },
  });
  expect(cfRes.status()).toBe(200);

  const res = await api.post("/delivery-batch/cancel-batch", {
    data: { batchCode, reason: "e2e 05 — hủy cả phiếu giao" },
  });
  expect(res.status()).toBe(200);
  const { results, cancelledCount, meta } = (await res.json()) as {
    results: Array<{ planningId: string; status: string }>;
    cancelledCount: number;
    meta: { mock: boolean };
  };

  expect(meta).toEqual({ mock: true });
  expect(cancelledCount).toBeGreaterThanOrEqual(1);
  expect(results).toHaveLength(2);
  // Stop 1 đang BOOKED (rebook ở test 6) → hủy cả booking → CANCELLED.
  expect(results.find((r) => r.planningId === planning1)!.status).toBe("CANCELLED");
  // Stop 2 CONFIRMED chưa book → về DRAFT (chờ cấu hình lại).
  expect(results.find((r) => r.planningId === planning2)!.status).toBe("DRAFT");

  // Idempotent — lần 2 không hủy thêm gì.
  const res2 = await api.post("/delivery-batch/cancel-batch", {
    data: { batchCode, reason: "e2e 05 — lần 2" },
  });
  expect(res2.status()).toBe(200);
  expect((await res2.json()).cancelledCount).toBe(0);
});
