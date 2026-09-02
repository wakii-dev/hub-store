/**
 * SF-11 Task 1 — Backend-only integration verify (P0 plan-critic, spec §5 SF-11).
 * Boot Java (:50051) + Go (:50052) KHÔNG FE; gọi gRPC TRỰC TIẾP qua gen ts stubs:
 *   CreateBatch → MutateOrderStatus thật (batchStatus đổi trong Java store)
 *   GetOrdersByCodes hydration (Go lấy truth — Java là source of truth)
 *   CancelBatch → revert 0 · CompletePicking → 2.
 * Cả 2 loại code: fulfillCode ORD-* (mutation key) + orderCode RSA-* (items mapping).
 * Run: pnpm --filter @hub-store/e2e backend-integration
 * Exit 0 = PASS; exit 1 = FAIL (assert chi tiết in stdout).
 */
import { readFileSync } from "node:fs";
import { ChannelCredentials, Metadata } from "@grpc/grpc-js";
import type { CreateBatchRequest } from "../api/proto/gen/ts/hubstore/batching/v1/batching.js";
import type {
  FilterOrdersRequest,
  GetOrdersByCodesRequest,
} from "../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment.js";

// Gen ts stubs là CJS-transpiled (root package.json không có "type": "module") —
// static named import bị Node ESM interop từ chối → dynamic namespace import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batchingMod: any = await import("../api/proto/gen/ts/hubstore/batching/v1/batching.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fulfillmentMod: any = await import("../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment.js");
const BatchingServiceClient = batchingMod.BatchingServiceClient;
const FulfillmentServiceClient = fulfillmentMod.FulfillmentServiceClient;


const NOT_PREPARED = 0; // BatchStatus.BATCH_STATUS_NOT_PREPARED
const PREPARING = 1; // BatchStatus.BATCH_STATUS_PREPARING
const PREPARED = 2; // BatchStatus.BATCH_STATUS_PREPARED

const JAVA = process.env.GRPC_FULFILLMENT_ADDR ?? "localhost:50051";
const GO = process.env.GRPC_BATCHING_ADDR ?? "localhost:50052";
const ROLE = "Coordinator";
const DEADLINE = 5_000;

const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: unknown) {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`[${tag}] ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!cond) failures.push(label);
}

function call<TReq, TRes>(
  fn: (req: TReq, md: Metadata, opts: { deadline: number }, cb: (e: unknown, r: TRes) => void) => unknown,
  req: TReq,
): Promise<TRes> {
  const md = new Metadata();
  md.set("x-user-role", ROLE);
  return new Promise((resolve, reject) =>
    fn(req, md, { deadline: Date.now() + DEADLINE }, (err, res) =>
      err ? reject(err) : resolve(res),
    ),
  );
}

async function waitReady(name: string, addr: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await call(
        (req, md, opts, cb) => javaClient.filterOrders(req as never, md, opts, cb as never),
        {
          page: 1,
          pageSize: 1,
          batchStatuses: [],
          shopCodes: [],
          orderStatuses: [],
          regionCodes: [],
          excludeFulfillCodes: [],
        } as FilterOrdersRequest,
      );
      console.log(`>> ${name} ready tại ${addr}`);
      return;
    } catch (e) {
      const msg = String((e as { details?: string; message?: string })?.message ?? e);
      if (msg.includes("Deadline exceeded")) {
        console.log(`>> ${name} ready tại ${addr} (deadline = đã kết nối)`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  throw new Error(`${name} không sẵn sàng sau ${tries} lần thử — ${addr}`);
}

const javaClient = new FulfillmentServiceClient(JAVA, ChannelCredentials.createInsecure());
const goClient = new BatchingServiceClient(GO, ChannelCredentials.createInsecure());

// repeated fields bắt buộc tồn tại (ts-proto serialization) — merge defaults
function filterReq(req: Partial<FilterOrdersRequest>): FilterOrdersRequest {
  return {
    fulfillCode: "",
    batchStatuses: [],
    shopCodes: [],
    orderStatuses: [],
    regionCodes: [],
    excludeFulfillCodes: [],
    page: 1,
    pageSize: 20,
    ...req,
  } as FilterOrdersRequest;
}

async function filterOrders(req: Partial<FilterOrdersRequest>) {
  return call(javaClient.filterOrders.bind(javaClient) as never, filterReq(req)) as never as {
    items: Array<{ fulfillCode: string; orderCode: string; batchStatus: number; batchCode?: string | null }>;
    total: number;
  };
}
const getOrdersByCodes = (req: GetOrdersByCodesRequest) =>
  call(javaClient.getOrdersByCodes.bind(javaClient) as never, req as never) as never as {
    orders: Array<{ fulfillCode: string; orderCode: string; batchStatus: number }>;
  };

async function main() {
  await waitReady("fulfillment-service (Java)", JAVA);
  await waitReady("batching-service (Go)", GO);

  // --- Baseline: đơn 30201 Chưa soạn (batchStatus=0) từ Java truth ---
  const baseline = await filterOrders({
    shopCodes: ["30201"],
    batchStatuses: [NOT_PREPARED],
    page: 1,
    pageSize: 20,
  } as FilterOrdersRequest);
  assert(baseline.total >= 3, `D1 baseline: ≥3 đơn 30201 Chưa soạn (thấy ${baseline.total})`);
  const codes = baseline.items.map((o) => o.fulfillCode).slice(0, 3);
  assert(codes.every((c) => c.startsWith("ORD-")), "Mutation key là fulfillCode ORD-*", codes);
  // ORD→RSA map từ canonical seed (single source — filter response proto không có order_code).
  const seed = JSON.parse(readFileSync(new URL("../api/seed/canonical-seed.json", import.meta.url), "utf8")) as {
    orders: Array<{ fulfillCode: string; orderCode: string; shopAssignment: { shopCode: string }; batchStatus: number }>;
  };
  const rsaByOrd = new Map(seed.orders.map((o) => [o.fulfillCode, o.orderCode]));
  assert(codes.every((c) => (rsaByOrd.get(c) ?? "").startsWith("RSA-")), "ORD→RSA map từ seed đúng", codes.map((c) => rsaByOrd.get(c)));
  const shop = "30201";
  const shipperId = "STAFF-001"; // seed deliveryStaff — nếu sai Go sẽ reject (assert ở create)

  // --- 1. CreateBatch qua Go → hydration + MutateOrderStatus thật trong Java ---
  const createReq: CreateBatchRequest = {
    shopCode: shop,
    shipperId,
    deliveryTime: { from: "2026-09-05T08:00:00Z", to: "2026-09-05T12:00:00Z" },
    fulfillCodes: codes,
  };
  const created = await call(goClient.createBatch.bind(goClient) as never, createReq) as never as {
    batch: { batchCode: string; shopCode: string; shipperId: string; status: number; items: Array<{ orderCode: string; stopOrder: number }> };
  };
  assert(!!created?.batch?.batchCode, "CreateBatch sinh batchCode", created?.batch?.batchCode);
  assert(created.batch.shopCode === shop, "batch.shopCode derive từ orders (hydration)");
  assert(
    created.batch.items.length === 3 &&
      created.batch.items.every((i) => i.orderCode === codes[i.stopOrder - 1]),
    "batch items order_code GIỮ NGUYÊN code request (SF-4 comment pin — D2 hiện mã user đã chọn)",
    created.batch.items.map((i) => i.orderCode),
  );
  const batchCode = created.batch.batchCode;

  const hydrated = await getOrdersByCodes({ fulfillCodes: codes } as GetOrdersByCodesRequest);
  assert(
    hydrated.orders.length === 3 && hydrated.orders.every((o) => o.batchStatus === PREPARING),
    "GetOrdersByCodes hydration: Java truth batchStatus=1 (Đang soạn)",
    hydrated.orders.map((o) => [o.fulfillCode, o.batchStatus]),
  );

  // --- 2. Rule 1: tạo phiếu trộn kho → Go reject qua hydration ---
  const otherShop = await filterOrders({
    batchStatuses: [NOT_PREPARED],
    page: 1,
    pageSize: 20,
  } as FilterOrdersRequest);
  const foreign = otherShop.items.find((o) => o.fulfillCode.startsWith("ORD-") && !codes.includes(o.fulfillCode) && o.batchStatus === 0 && !rsaByOrd.has(o.fulfillCode));
  if (foreign) {
    try {
      await call(goClient.createBatch.bind(goClient) as never, {
        ...createReq,
        fulfillCodes: [...codes, foreign.fulfillCode],
      });
      assert(false, "Rule 1: trộn kho bị REJECT (nhưng create thành công — FAIL)");
    } catch (e) {
      const code = (e as { code?: number }).code;
      assert(code === 3, "Rule 1: trộn kho bị REJECT InvalidArgument", { grpcCode: code });
    }
  } else {
    console.log("[SKIP] Rule 1 trộn kho — không có đơn khác kho Chưa soạn để test");
  }

  // --- 3. CancelBatch → revert 0 trong Java ---
  await call(goClient.cancelBatch.bind(goClient) as never, {
    batchCode,
    reason: "SF-11 integration verify",
  });
  const afterCancel = await getOrdersByCodes({ fulfillCodes: codes } as GetOrdersByCodesRequest);
  assert(
    afterCancel.orders.every((o) => o.batchStatus === NOT_PREPARED),
    "CancelBatch → đơn revert batchStatus=0 (Java truth)",
    afterCancel.orders.map((o) => [o.fulfillCode, o.batchStatus]),
  );

  // --- 4. Tạo lại → CompletePicking → 2 ---
  const recreated = await call(goClient.createBatch.bind(goClient) as never, createReq) as never as { batch: { batchCode: string } };
  assert(!!recreated?.batch?.batchCode && recreated.batch.batchCode !== batchCode, "Tạo lại sau hủy → batchCode MỚI", recreated?.batch?.batchCode);
  await call(goClient.completePicking.bind(goClient) as never, { batchCode: recreated.batch.batchCode });
  const afterComplete = await getOrdersByCodes({ fulfillCodes: codes } as GetOrdersByCodesRequest);
  assert(
    afterComplete.orders.every((o) => o.batchStatus === PREPARED),
    "CompletePicking → đơn batchStatus=2 (Đã soạn, Java truth)",
    afterComplete.orders.map((o) => [o.fulfillCode, o.batchStatus]),
  );

  // --- 5. Regression FI-237: MutateOrderStatus resolve theo orderCode RSA ---
  // (state in-memory qua các lần chạy — dùng chính đơn đã thao tác, revert về 2)
  const rsa = rsaByOrd.get(baseline.items[0].fulfillCode);
  const mutateRes = await call(javaClient.mutateOrderStatus.bind(javaClient) as never, {
    fulfillCodes: [rsa],
    targetBatchStatus: PREPARING,
  }) as never as { results: Array<{ fulfillCode: string; success: boolean }> };
  assert(mutateRes.results[0]?.success === true, "MutateOrderStatus theo RSA-* resolve thành công (FI-237)", mutateRes.results);
  const rsaHydrated = await getOrdersByCodes({ fulfillCodes: [rsa] } as GetOrdersByCodesRequest);
  assert(rsaHydrated.orders.length === 1 && rsaHydrated.orders[0].batchStatus === PREPARING, "GetOrdersByCodes theo RSA-* trả truth batchStatus=1", rsaHydrated.orders);
  await call(javaClient.mutateOrderStatus.bind(javaClient) as never, {
    fulfillCodes: [rsa],
    targetBatchStatus: PREPARED,
  });
  const rsaReverted = await getOrdersByCodes({ fulfillCodes: [rsa] } as GetOrdersByCodesRequest);
  assert(rsaReverted.orders[0]?.batchStatus === PREPARED, "Mutate RSA revert về 2 — trạng thái cuối khớp trước test", rsaReverted.orders);

  javaClient.close();
  goClient.close();

  console.log("\n=== BACKEND INTEGRATION " + (failures.length ? `FAIL (${failures.length})` : "PASS — mọi assert xanh") + " ===");
  failures.forEach((f) => console.log("  FAIL: " + f));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
