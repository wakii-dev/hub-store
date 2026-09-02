import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * SF-9 Task 5 — E2E Dashboard (/hub-store-order/dashboard):
 *   1. Manager: landing + số liệu khớp canonical seed (pending = orderStatus 0).
 *   2. Manager: INSERT 1 đơn hôm nay qua psql → dashboard-refetch → stat-today
 *      +1 và bar hôm nay nhót lên (try/finally DELETE + refetch lại).
 *   3. Responsive: chart-orders-per-day nằm gọn trong viewport 1440×900.
 *   4. Coordinator: nav KHÔNG có dashboard, vào thẳng route → forbidden.
 *   5. Manager login thật (Keycloak) → landing /dashboard (firstPathForRole).
 *
 * Determinism: spec chạy SAU 01-main-flow (mutate DB) → beforeAll reset
 * DB-ONLY (TRUNCATE 2 DB + seed-db.sh — KHÔNG đụng keycloak volume như
 * reset-db.sh). Expected numbers derive từ canonical-seed.json, KHÔNG
 * hard-code. LƯU Ý window chart: java service aggregate 30 ngày KẾT THÚC
 * hôm nay (Asia/Ho_Chi_Minh) — seed đặt toàn bộ đơn ngày 2026-09-03
 * (ngày mai) → KHÔNG bar nào có data từ seed; bar-<hôm nay> vẫn render
 * (height 0) trong DOM.
 */

const ROOT = path.join(__dirname, "../..");
const seed = JSON.parse(
  readFileSync(path.join(__dirname, "../../api/seed/canonical-seed.json"), "utf8"),
) as { orders: Array<Record<string, unknown>> };

/** pendingApproval = COUNT(order_status = 0) — khớp SQL java repo. */
const pendingApproval = seed.orders.filter((o) => Number(o.orderStatus) === 0).length;
const seedTotal = seed.orders.length;

/** Hôm nay theo Asia/Ho_Chi_Minh (khớp ZoneId java service) — YYYY-MM-DD. */
function todayHCM(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

/** psql qua container postgres (docker compose, như scripts/seed-db.sh). */
function psql(db: string, sql: string): string {
  return execSync(
    `docker compose exec -T postgres psql -U hubstore -d ${db} -At -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`,
    { cwd: ROOT },
  )
    .toString()
    .trim();
}

/** Đọc số từ text Card antd Statistic ("Đơn hôm nay 0" → 0). */
function parseStatValue(text: string): number {
  const nums = text.match(/\d+/g);
  if (!nums) throw new Error(`Không parse được số từ statistic: "${text}"`);
  return Number(nums[nums.length - 1]);
}

test.beforeAll(() => {
  // DB-only reset (không keycloak): fulfillment cần CASCADE (service_employee_regions FK).
  psql(
    "fulfillment",
    "TRUNCATE orders, shop_assignment_history, regions, delivery_staff RESTART IDENTITY CASCADE",
  );
  psql("batching", "TRUNCATE batches, batch_items RESTART IDENTITY");
  execSync("bash scripts/seed-db.sh", { cwd: ROOT, stdio: "pipe" });
  // Verify reseed trước khi assert số liệu.
  const count = psql("fulfillment", "SELECT count(*) FROM orders");
  expect(Number(count)).toBe(seedTotal);
  const pending = psql("fulfillment", "SELECT count(*) FROM orders WHERE order_status = 0");
  expect(Number(pending)).toBe(pendingApproval);
});

test.describe("Manager (storageState)", () => {
  test.use({ storageState: ".auth/manager.json" });

  test("landing /dashboard + số liệu khớp seed", async ({ page }) => {
    await page.goto("/hub-store-order/dashboard");
    await expect(page).toHaveURL(/\/hub-store-order\/dashboard$/);
    await expect(page.getByTestId("dashboard-root")).toBeVisible();

    // stat-pending = seed-derived (orderStatus === 0)
    await expect(page.getByTestId("stat-pending")).toContainText(String(pendingApproval));

    // Chart: seed toàn bộ đơn NGÀY MAI → ngoài window 30 ngày tới hôm nay →
    // bar hôm nay có trong DOM (height 0), completion-rate hiển thị.
    await expect(page.getByTestId("chart-orders-per-day")).toBeVisible();
    await expect(page.getByTestId(`bar-${todayHCM()}`)).toHaveCount(1);
    await expect(page.getByTestId("stat-completion-rate")).toBeVisible();

    // Workload: ≥1 dòng (staff seed, kể cả orderCount 0)
    await expect(page.getByTestId("workload-list")).toBeVisible();
    const rows = await page.locator('[data-testid^="workload-row-"]').count();
    expect(rows).toBeGreaterThanOrEqual(1);
  });

  test("tạo thêm đơn hôm nay → refetch cập nhật stat + bar", async ({ page }) => {
    await page.goto("/hub-store-order/dashboard");
    const statToday = page.getByTestId("stat-today");
    await expect(statToday).toBeVisible();
    const initialValue = parseStatValue(await statToday.innerText());
    const today = todayHCM();
    const day = `${today}T10:00:00+07:00`;
    const night = `${today}T11:00:00+07:00`;
    // Cột NOT NULL khớp schema orders (id tự seq; còn lại nullable/default).
    const insertSql =
      "INSERT INTO orders (fulfill_code, order_code, status_code, batch_status, batch_code, " +
      "shop_code, shop_name, shop_address, original_time_from, original_time_to, " +
      "delivery_time_from, delivery_time_to, order_status, items, cod_amount, total_quantity, " +
      "is_debt_splitting_order, customer_address) VALUES (" +
      "'ORD-E2E-DASH', 'E2E-DASH-1', 1, 0, NULL, '30201', 'FPT Shop Cầu Giấy', " +
      "'124 Xuân Thủy, Cầu Giấy, Hà Nội', " +
      `'${day}', '${night}', '${day}', '${night}', ` +
      "1, '[]'::jsonb, 0, 1, false, 'E2E Test Addr')";
    try {
      psql("fulfillment", insertSql);
      await page.getByTestId("dashboard-refetch").click();
      await expect(statToday).toContainText(String(initialValue + 1));
      // Bar hôm nay nhót lên từ 0 → có height.
      const bar = page.getByTestId(`bar-${today}`);
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(0);
    } finally {
      // Dọn DB + refetch về trạng thái ban đầu (DB dùng chung, KHÔNG reset-db).
      psql("fulfillment", "DELETE FROM orders WHERE fulfill_code = 'ORD-E2E-DASH'");
      await page.getByTestId("dashboard-refetch").click();
      await expect(statToday).toContainText(String(initialValue));
    }
  });

  test("responsive: chart gọn trong viewport 1440×900", async ({ page }) => {
    await page.goto("/hub-store-order/dashboard");
    const chart = page.getByTestId("chart-orders-per-day");
    await expect(chart).toBeVisible();
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.width).toBeLessThanOrEqual(1440);
  });
});

test.describe("Coordinator (storageState)", () => {
  test.use({ storageState: ".auth/coordinator.json" });

  test("nav KHÔNG có dashboard, vào thẳng route → forbidden", async ({ page }) => {
    await page.goto("/hub-store-order/order");
    await expect(page.getByTestId("nav-dashboard")).toHaveCount(0);
    await page.goto("/hub-store-order/dashboard");
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });
});

test.describe("Manager landing thật (login flow — KHÔNG storageState)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /** Login thật qua Keycloak hosted UI (như 02-role-matrix). */
  async function realLogin(page: import("@playwright/test").Page, username: string) {
    await page.goto("/hub-store-order/order");
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/protocol/openid-connect/auth**");
    await page.locator("#username").fill(username);
    await page.locator("#password").fill("Password123!");
    await page.locator("#kc-login").click();
    await page.waitForURL("**/hub-store-order/**");
  }

  test("Manager: login thật → landing /dashboard (firstPathForRole)", async ({ page }) => {
    await realLogin(page, "manager");
    await expect(page).toHaveURL(/\/hub-store-order\/dashboard$/);
  });
});
