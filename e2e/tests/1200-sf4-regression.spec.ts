import { execSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * SF-4 FI-284 — regression các bug đã fix trong sweep (chạy CUỐI, tiền tố 12xx).
 * Tự lập state qua psql (E2E_PG_SHIM redirect về postgres của stack đang chạy —
 * private-port seam hay stack chính đều chạy được). KHÔNG import sf11-helpers.
 *
 * Phủ 3 bug đã fix:
 * - [P1][AREA] BFF 403 role-gate envelope = PERMISSION_DENIED (không phải FORBIDDEN
 *   — services/bff-gateway/src/plugins/auth.ts + README §codes).
 * - [P1][TECH] SO-0006 CONFIRMED đã gán → nút "Gán lại KTV" (SF-25 matrix,
 *   BE-authoritative allowReassign) — KHÔNG phải vô nút.
 * - [P1][EXCEPTION]+[P1][INFRA] cascade exception: mark-fail/redeliver/audit
 *   (RPC IntakeService) reachable — regression cho GRPC_INTAKE seam.
 */

/** psql qua shim `docker compose exec -T postgres` — đa DB theo -d, trả stdout. */
function psql(db: string, sql: string): string {
  // Fail-fast: state-prep phá-data — chỉ hợp lệ trên private pg seam
  // (code-reviewer FI-284 P1; chạy mặc định sẽ đụng postgres compose chính).
  if (process.env.E2E_PG_SEAM !== "1") {
    throw new Error(
      "1200 state-prep phá-data — chạy với E2E_PG_SEAM=1 (private pg seam), không đụng postgres chính",
    );
  }
  return execSync(
    `docker compose exec -T postgres psql -U hubstore -d ${db} -At -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`,
    { stdio: "pipe", encoding: "utf-8" },
  );
}

test.describe("SF-4 regression — [P1][AREA] 403 envelope PERMISSION_DENIED", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("coordinator POST /service-employees → 403 + code PERMISSION_DENIED", async ({ request }) => {
    // Token từ storageState localStorage (oidc-client-ts persist user).
    const statePath = path.join(__dirname, "..", ".auth", "coordinator.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const oidcEntry = (state.origins ?? []).flatMap(
      (o: { localStorage?: Array<{ name: string; value: string }> }) => o.localStorage ?? [],
    ).find((e: { name: string }) => e.name.startsWith("oidc.user:"));
    expect(oidcEntry, "storageState thiếu oidc user localStorage").toBeTruthy();
    const token = JSON.parse(oidcEntry.value).access_token;

    const res = await request.post(`${process.env.E2E_BFF_URL ?? "http://localhost:8080"}/service-employees`, {
      data: {
        employeeCode: `NV-RG-${Math.floor(Math.random() * 90000) + 10000}`,
        fullName: "SF-4 Regression 403",
        titleCode: "SHIPPER",
        paymentAccount: "1234567890",
      },
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("PERMISSION_DENIED");
  });
});

test.describe("SF-4 regression — [P1][TECH] reassign matrix BE-authoritative", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("SO-0006 đã gán → 'Gán lại KTV' (không biến mất); SO-0001 reset → 'Gán KTV'", async ({ page }) => {
    // State-prep: SO-0001 về NEW-chưa-gán (mô phỏng rerun sạch).
    psql(
      "fulfillment",
      "UPDATE installation_orders SET technician_code = NULL, status = 'NEW' WHERE service_order_code = 'SO-0001';",
    );

    await page.goto("/hub-store-order/tech");
    await expect(page.getByTestId("tech-page-title")).toHaveText("Đơn dịch vụ kỹ thuật");
    await page.getByRole("tab", { name: "Lắp đặt" }).click();
    await expect(page).toHaveURL(/tab=installation/);

    await expect(page.getByTestId("tech-assign-SO-0001")).toContainText("Gán KTV");
    await expect(page.getByTestId("tech-assign-SO-0006")).toContainText("Gán lại KTV");
    await expect(page.getByTestId("tech-assign-SO-0006")).not.toContainText(/^Gán KTV/);
  });
});

test.describe("SF-4 regression — [P1][EXCEPTION] cascade mark-fail/redeliver reachable", () => {
  test.use({ storageState: ".auth/warehouse.json" });

  test("đơn FAILED trong phiếu → nút mark-fail/redeliver render + API audit 200 (không ECONNREFUSED)", async ({
    page,
    request,
  }) => {
    // D2 (batch list) chỉ render đơn THUỘC phiếu — seed FAILED không có batch
    // (ORD-3011 batch_code NULL) không hiện ở đây. State-prep: fail 1 đơn
    // 30202 + nhét vào scratch batch BATCH-RG01 (FE render redeliver theo
    // failReason — BatchListPage `failed = Boolean(order?.failReason)`).
    const SCRATCH = "BATCH-RG01";
    psql("batching", `DELETE FROM batch_items WHERE batch_code = '${SCRATCH}'; DELETE FROM batches WHERE batch_code = '${SCRATCH}';`);
    const failedCode = psql(
      "fulfillment",
      `UPDATE orders SET batch_status = 3, fail_reason = 'KHACH_VANG', fail_note = 'SF-4 regression', failed_at = now(), batch_code = '${SCRATCH}' WHERE id = (SELECT id FROM orders WHERE batch_status <> 3 AND shop_code = '30202' ORDER BY fulfill_code DESC LIMIT 1) RETURNING fulfill_code;`,
    )
      .split("\n")
      .find((l) => /^ORD-\d+$/.test(l.trim()))
      ?.trim();
    expect(failedCode, "phải còn đơn 30202 chưa FAILED để dùng làm state").toMatch(/^ORD-\d+$/);
    psql(
      "batching",
      `INSERT INTO batches (batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to, status, created_at) VALUES ('${SCRATCH}', '30202', 'STAFF-001', now(), now() + interval '4 hours', 1, now()); INSERT INTO batch_items (batch_code, stop_order, order_code) VALUES ('${SCRATCH}', 1, '${failedCode}');`,
    );

    try {
      await checkReachability(page, request, failedCode);
    } finally {
      // Tự sạch: trả đơn về Chưa soạn + xóa scratch batch.
      psql(
        "fulfillment",
        `UPDATE orders SET batch_status = 0, batch_code = NULL, fail_reason = NULL, fail_note = NULL, failed_at = NULL WHERE fulfill_code = '${failedCode}';`,
      );
      psql("batching", `DELETE FROM batch_items WHERE batch_code = '${SCRATCH}'; DELETE FROM batches WHERE batch_code = '${SCRATCH}';`);
    }
  });
});

/** Expand đơn FAILED trên D2 → mark-fail/redeliver button mount + GET /audit 200. */
async function checkReachability(page: Page, request: APIRequestContext, code: string) {
  await page.goto("/hub-store-order/batch");
  await expect(page.locator('[data-probe="fulfillment"]')).toBeVisible();
  const search = page.getByPlaceholder("Số phiếu / Số đơn");
  await search.fill(code);
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  const row = page.locator(`tr[data-row-key$="-${code}"]`);
  await expect(row).toBeVisible();
  await row.locator(".ant-table-row-expand-icon").click();
  await expect(page.getByTestId(`order-expand-${code}`)).toBeVisible();
  // Đơn FAILED → FE luôn render nút Giao lại (server là chốt cuối — SF-13 T8).
  await expect(page.getByTestId(`redeliver-button-${code}`)).toBeVisible();

  // GET /orders/:code/audit → 200 (regression [P1][INFRA] GRPC_INTAKE seam —
  // seam gãy trả 503 "intake-service is unavailable" thay vì 200).
  const statePath = path.join(__dirname, "..", ".auth", "warehouse.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  const oidcEntry = (state.origins ?? []).flatMap(
    (o: { localStorage?: Array<{ name: string; value: string }> }) => o.localStorage ?? [],
  ).find((e: { name: string }) => e.name.startsWith("oidc.user:"));
  const token = JSON.parse(oidcEntry!.value).access_token;
  const res = await request.get(`${process.env.E2E_BFF_URL ?? "http://localhost:8080"}/orders/${code}/audit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect(Array.isArray(((await res.json()) as { items: string[] }).items)).toBe(true);
}
