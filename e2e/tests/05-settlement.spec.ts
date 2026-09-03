import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, request as newRequest, test, type APIRequestContext } from "@playwright/test";

/**
 * SF-14 Task 6 — E2E COD đối soát (FI-259, spec §7):
 *   1. Setup: truncate orders + cod_confirmations (KHÔNG FK cascade — phải
 *      liệt kê tường minh) + reseed pattern 05-dashboard.
 *   2. Coordinator: tạo phiếu 2 đơn COD (shop 30201) qua API (pattern
 *      05-nvc-api — Bearer từ storageState) → hoàn tất soạn → 2 PENDING
 *      confirmations (eager insert D1).
 *   3. D2 (UI): badge "COD chờ thu (2)" → Xác nhận thu → confirm → badge mất.
 *   4. Case lệch: per-order confirm ORD-3001 collectedAmount DƯ 2.000.000 ≠
 *      expected 1.850.000 (D3 re-confirm last-write-wins) → mismatch_count = 1
 *      + diff TỔNG ÂM (expected − collected) → KPI đỏ + CSV formula-guard.
 *      re-confirm last-write-wins) → mismatch_count = 1.
 *   5. psql GROUP BY (spec §5) khớp số UI.
 *   6. Manager (storageState override theo 05-d2c): /settlement — KPI + row
 *      shop + segmented "Lệch tiền" + drill-down order cards.
 *   7. Export CSV: GET /cod/settlement.csv — BOM + header 8 cột + số khớp
 *      + section drill (lưu ý formula-guard: diff âm được prefix `'`).
 *
 * Chạy sau 05-nvc-api, trước 05-tech-service (thứ tự alphabet) — reseed ở
 * beforeAll như 05-dashboard; 06-exception (chạy sau) tự chọn đơn động nên
 * không vỡ. KHÔNG sửa spec cũ.
 */

const ROOT = path.join(__dirname, "../..");
// Private-port seam (SF-15 precedent) — default :8080 giữ behavior cũ.
const BFF_URL = process.env.E2E_BFF_URL ?? "http://localhost:8080";
const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../api/seed/canonical-seed.json"), "utf8"),
) as { orders: Array<{ fulfillCode: string; codAmount: number }> };

const ORD1 = "ORD-3001"; // fulfillCode seed — shop 30201, COD 1.850.000
const ORD2 = "ORD-3002"; // fulfillCode seed — shop 30201, COD 3.200.000
const SHOP_CODE = "30201";
const SHOP_NAME = "FPT Shop Cầu Giấy";
const SHIPPER = "STAFF-001"; // seed deliveryStaff shop 30201
const MISMATCH_COLLECTED = 2_000_000; // thu DƯ so với expected ORD-3001 (1.850.000)

function codOf(code: string): number {
  const o = seed.orders.find((x) => x.fulfillCode === code);
  if (!o) throw new Error(`Seed thiếu ${code}`);
  return Number(o.codAmount);
}
const EXPECTED_TOTAL = codOf(ORD1) + codOf(ORD2); // 5.050.000
const COLLECTED_TOTAL = codOf(ORD2) + MISMATCH_COLLECTED; // 5.200.000
// Backend contract (SettlementShopRow): diff = expected − COALESCE(collected, 0)
// — thu DƯ → diff ÂM → KPI đỏ + CSV cell prefix `'` (formula-guard).
const DIFF_TOTAL = EXPECTED_TOTAL - COLLECTED_TOTAL; // -150.000

/** Hôm nay theo Asia/Ho_Chi_Minh (khớp D9 wrap +07:00) — YYYY-MM-DD. */
function todayHCM(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

/** psql qua container postgres (pattern 05-dashboard.spec.ts:39). */
function psql(db: string, sql: string): string {
  return execSync(
    `docker compose exec -T postgres psql -U hubstore -d ${db} -At -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`,
    { cwd: ROOT },
  )
    .toString()
    .trim();
}

/** Access token Keycloak từ storageState (pattern 05-nvc-api.spec.ts:72). */
function readToken(stateFile: string): string {
  const state = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", stateFile), "utf8"),
  ) as { origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }> };
  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.startsWith("oidc.user:")) continue;
      const user = JSON.parse(entry.value) as { access_token?: string };
      if (user.access_token) return user.access_token;
    }
  }
  throw new Error(`Không tìm thấy access_token trong ${stateFile} — globalSetup chưa chạy?`);
}

// State chung — workers=1 + serial nên chia biến module là deterministic
// TRONG 1 worker; describe "Manager" đổi storageState (test.use) → Playwright
// tách worker MỚI (đã xác minh qua postgres statement log) → biến module
// KHÔNG chung qua worker. Manager tests đọc batchCode từ DB (dbBatchCode).
let api: APIRequestContext; // coordinator (tạo phiếu + confirm)
let mgrApi: APIRequestContext; // manager (settlement + CSV)
let batchCode = "";

/** batchCode từ DB — worker-agnostic (worker Manager không có var worker 1). */
function dbBatchCode(): string {
  return psql(
    "fulfillment",
    `SELECT DISTINCT batch_code FROM cod_confirmations WHERE fulfill_code = '${ORD1}' AND batch_code <> '' LIMIT 1`,
  );
}

test.beforeAll(async () => {
  // KHÔNG reset DB ở đây: beforeAll chạy LẠI ở worker 2 (worker split bởi
  // test.use storageState ở describe Manager) — reset ở đây sẽ xóa state mà
  // worker 1 vừa dựng. Reset thuộc về test đầu tiên (test 1).
  api = await newRequest.newContext({
    baseURL: BFF_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${readToken(".auth/coordinator.json")}` },
  });
  mgrApi = await newRequest.newContext({
    baseURL: BFF_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${readToken(".auth/manager.json")}` },
  });
});

test("coordinator: API tạo phiếu 2 đơn COD → hoàn tất soạn → 2 PENDING confirmations", async () => {
  // Reset sạch (pattern 05-dashboard) — cod_confirmations PHẢI liệt kê tường
  // minh (không FK cascade từ orders — spec §7).
  psql(
    "fulfillment",
    "TRUNCATE orders, cod_confirmations, shop_assignment_history, regions, delivery_staff RESTART IDENTITY CASCADE",
  );
  psql("batching", "TRUNCATE batches, batch_items RESTART IDENTITY");
  execSync("bash scripts/seed-db.sh", { cwd: ROOT, stdio: "pipe" });
  expect(Number(psql("fulfillment", "SELECT count(*) FROM orders"))).toBe(seed.orders.length);
  expect(Number(psql("fulfillment", "SELECT count(*) FROM cod_confirmations"))).toBe(0);

  const res = await api.post("/fulfillment/batches/create", {
    data: {
      orderCodes: [ORD1, ORD2],
      shipperId: SHIPPER,
      deliveryTime: { from: "2026-09-10T01:00:00Z", to: "2026-09-10T05:00:00Z" },
    },
  });
  expect(res.status()).toBe(200);
  batchCode = ((await res.json()) as { batchCode: string }).batchCode;
  expect(batchCode).toMatch(/^BATCH-\d+$/);

  const done = await api.put("/fulfillment/complete-picking", {
    data: { batchCode },
  });
  expect(done.status()).toBe(200);

  // D1 eager insert: 2 PENDING, expected = snapshot cod_amount, shop snapshot.
  const rows = psql(
    "fulfillment",
    `SELECT fulfill_code, expected_amount, shop_code, status FROM cod_confirmations ORDER BY fulfill_code`,
  );
  expect(rows).toBe(
    [
      `${ORD1}|${codOf(ORD1)}|${SHOP_CODE}|0`,
      `${ORD2}|${codOf(ORD2)}|${SHOP_CODE}|0`,
    ].join("\n"),
  );
});

test("D2: batch COMPLETED hiện 'COD chờ thu (2)' → Xác nhận thu → badge biến mất", async ({
  page,
}) => {
  await page.goto("/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill(ORD1);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();

  // Badge + nút xác nhận của T4 (testid cod-*)
  const badge = page.getByTestId(`cod-badge-${batchCode}`);
  await expect(badge).toHaveText("COD chờ thu (2)");
  const confirmResp = page.waitForResponse(
    (r) => r.url().includes("/cod/confirm-batch") && r.request().method() === "POST",
  );
  await page.getByTestId(`cod-actions-${batchCode}`).getByRole("button", { name: "Xác nhận thu" }).click();
  // Modal.confirm — okText cũng là "Xác nhận thu" → scope trong dialog
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận thu" }).click();
  const resp = await confirmResp;
  expect(resp.status()).toBe(200);
  const body = (await resp.json()) as { confirmedCount: number; totalAmount: number };
  expect(body.confirmedCount).toBe(2);
  expect(body.totalAmount).toBe(EXPECTED_TOTAL);

  // pendingCount về 0 → cả cụm badge + nút ẩn (CodBatchActions return null)
  await expect(page.getByTestId(`cod-badge-${batchCode}`)).toHaveCount(0);
  await expect(page.getByTestId(`cod-actions-${batchCode}`)).toHaveCount(0);
});

test("case lệch: per-order confirm ORD-3001 với số tiền sai (D3 re-confirm)", async () => {
  const res = await api.post("/cod/confirm", {
    data: { fulfillCode: ORD1, collectedAmount: MISMATCH_COLLECTED },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { results: Array<{ fulfillCode: string; success: boolean }> };
  expect(body.results).toHaveLength(1);
  expect(body.results[0].fulfillCode).toBe(ORD1);
  expect(body.results[0].success).toBe(true);

  // DB: re-confirm UPDATE last-write-wins — không duplicate row.
  const row = psql(
    "fulfillment",
    `SELECT count(*), min(collected_amount), min(status) FROM cod_confirmations WHERE fulfill_code = '${ORD1}'`,
  );
  expect(row).toBe(`1|${MISMATCH_COLLECTED}|1`);
});

test("psql GROUP BY (spec §5) khớp kỳ vọng: 2 đơn · 5.050.000 · 5.200.000 · lệch 1", async () => {
  const agg = psql(
    "fulfillment",
    "SELECT c.shop_code, c.shop_name, COUNT(*), SUM(c.expected_amount), " +
      "SUM(COALESCE(c.collected_amount,0)), " +
      "SUM(c.expected_amount - COALESCE(c.collected_amount,0)), " +
      "SUM(CASE WHEN c.status=0 THEN 1 ELSE 0 END), " +
      "SUM(CASE WHEN c.status=1 AND c.collected_amount <> c.expected_amount THEN 1 ELSE 0 END) " +
      "FROM cod_confirmations c JOIN orders o ON o.fulfill_code = c.fulfill_code " +
      "WHERE o.fail_reason IS NULL GROUP BY c.shop_code, c.shop_name ORDER BY c.shop_code",
  );
  expect(agg).toBe(
    `${SHOP_CODE}|${SHOP_NAME}|2|${EXPECTED_TOTAL}|${COLLECTED_TOTAL}|${DIFF_TOTAL}|0|1`,
  );
});

test.describe("Manager — màn Settlement + export CSV (storageState)", () => {
  test.use({ storageState: ".auth/manager.json" });

  test("/settlement: KPI + row shop + segmented 'Lệch tiền' + drill-down khớp DB", async ({
    page,
  }) => {
    await page.goto("/settlement");
    await expect(page.getByTestId("settlement-page")).toBeVisible();

    // KPI cards (formatVnd vi: dot thousands + đ) — diff âm (thu dư) → đỏ.
    // .first(): số "đã thu" cũng xuất hiện trong row shop → tránh strict violation.
    const kpi = page.getByTestId("settlement-page");
    await expect(kpi.getByText("5.050.000đ")).toBeVisible(); // kỳ vọng
    await expect(kpi.getByText("5.200.000đ").first()).toBeVisible(); // đã thu
    await expect(kpi.getByText("-150.000đ")).toBeVisible(); // chênh lệch (đỏ)
    await expect(kpi.getByText("1 cửa hàng · 0 đơn chờ thu · 1 đơn lệch tiền")).toBeVisible();

    // Row shop — số khớp psql GROUP BY ở test trước
    const table = page.getByTestId("settlement-shop-table");
    await expect(table).toContainText(SHOP_NAME);
    await expect(table).toContainText(SHOP_CODE);
    await expect(table).toContainText("5.050.000");
    await expect(table).toContainText("5.200.000đ");
    await expect(table).toContainText("-150.000");
    await expect(table).toContainText("Lệch tiền"); // pill health = mismatch

    // Segmented filter — counts đúng, shop lệch lọc đúng
    await expect(page.getByTestId("settlement-segment-all")).toContainText("1");
    await expect(page.getByTestId("settlement-segment-short")).toContainText("0");
    await expect(page.getByTestId("settlement-segment-mismatch")).toContainText("1");
    await expect(page.getByTestId("settlement-segment-ok")).toContainText("0");
    await page.getByTestId("settlement-segment-mismatch").click();
    await expect(table.getByText(SHOP_NAME)).toBeVisible();

    // Drill-down: ORD-3001 LỆCH (thu dư 2.000.000đ), ORD-3002 đã thu đủ
    await table.locator(".ant-table-row-expand-icon").click();
    await expect(page.getByTestId(`cod-order-card-${ORD1}`)).toContainText("Lệch số tiền");
    await expect(page.getByTestId(`cod-order-card-${ORD1}`)).toContainText("2.000.000đ");
    await expect(page.getByTestId(`cod-order-card-${ORD2}`)).toContainText("Đã thu đủ");
    await expect(page.getByTestId(`cod-order-card-${ORD2}`)).toContainText("3.200.000đ");
  });

  test("export CSV: BOM + header 8 cột + số khớp màn hình + section drill", async () => {
    const today = todayHCM();
    const res = await mgrApi.get(`/cod/settlement.csv?from=${today}&to=${today}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toContain(
      `filename="settlement_${today}_${today}.csv"`,
    );

    const buffer = await res.body();
    expect([buffer[0], buffer[1], buffer[2]]).toEqual([0xef, 0xbb, 0xbf]); // BOM
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const lines = text.split("\r\n").filter((l) => l.length > 0);

    // Header 8 cột (khớp màn hình) + row shop (diff âm bị formula-guard prefix ' — csv.ts)
    expect(lines[0]).toBe(
      "shop_code,shop_name,total_orders,total_expected,total_collected,diff_amount,pending_count,mismatch_count",
    );
    expect(lines[1]).toBe(
      `${SHOP_CODE},${SHOP_NAME},2,${EXPECTED_TOTAL},${COLLECTED_TOTAL},'${DIFF_TOTAL},0,1`,
    );

    // Section drill: ORD-3001 CONFIRMED lệch tiền
    expect(lines).toContain("# Drilled mismatch orders");
    expect(lines).toContain("fulfill_code,batch_code,expected,collected,status");
    const bc = dbBatchCode();
    expect(bc).toMatch(/^BATCH-\d+$/);
    const drillLine = lines.find((l) => l.startsWith(`${ORD1},${bc},`));
    expect(drillLine, `thiếu drill ORD-3001 trong: ${text}`).toBe(
      `${ORD1},${bc},${codOf(ORD1)},${MISMATCH_COLLECTED},COD_CONFIRMED`,
    );
  });
});
