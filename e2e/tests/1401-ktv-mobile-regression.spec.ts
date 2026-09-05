import { execSync, spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

/**
 * SF-6 FI-286 — regression ktv-mobile (tiền tố 14xx, chạy trên seam
 * run-sf6-ktv-private.sh qua playwright.ktv.config.ts với
 * E2E_TEST_MATCH=1401-ktv-mobile-regression.spec.ts).
 *
 * Tự lập state qua psql shim (E2E_PG_SEAM=1 — pattern 1200-sf4-regression):
 * insert đơn lắp đặt SO-REGxx gán KTV-001 trong ngày → S3 đi trọn
 * accept → complete. KHÔNG import sf11-helpers.
 *
 * Phủ các bug đã fix trong sweep:
 * - [P1][MOBILE] BUG-2: logout phải kết thúc session Keycloak (post-logout
 *   redirect 302, không 400 "Invalid redirect uri" — realm ## separator).
 * - SW hygiene: offline fallback offline.html cho nav chưa cache; /api/
 *   pass-through tuyệt đối (offline fail, KHÔNG serve stale); CACHE version
 *   bump — cache cũ bị dọn khi sw.js đổi CACHE.
 * - S5 CTV isolation (regression S7 spec 09).
 */

/** psql qua shim `docker compose exec -T postgres` — chỉ hợp lệ trên pg seam. */
function psql(db: string, sql: string): string {
  if (process.env.E2E_PG_SEAM !== "1") {
    throw new Error(
      "1401 state-prep phá-data — chạy với E2E_PG_SEAM=1 (private pg seam), không đụng postgres chính",
    );
  }
  // collapse newline/trailing spaces — JSON.stringify chỉ escape \n thành 2 ký
  // tự literal mà psql -c đọc là syntax error (S0 seed fail lần chạy đầu).
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return execSync(
    `docker compose exec -T postgres psql -U hubstore -d "${db}" -At -v ON_ERROR_STOP=1 -c ${JSON.stringify(oneLine)}`,
    { stdio: "pipe", encoding: "utf-8" },
  );
}

/** Đơn seed duy nhất cho S3 — code ngẫu nhiên tránh collision giữa các run. */
const REG_CODE = `SO-REG${Math.floor(Math.random() * 90000) + 10000}`;

test.describe.serial("SF-6 ktv-mobile regression — KTV-001", () => {
  test("S0 · seed SO-REGxx gán KTV-001 hôm nay (state tự lập)", async () => {
    psql(
      "fulfillment",
      `INSERT INTO installation_orders (service_order_code, technician_code, status, expected_time, region_code, province)
       VALUES ('${REG_CODE}', 'KTV-001', 'CONFIRMED', date_trunc('day', now()) + interval '23 hours', 'HN', 'Hà Nội')`,
    // SF-8 convergence: seed giờ neo VÀO HÔM NAY (23:00) — now()+2h vượt nửa đêm
    // khi run sau 22:00 → đơn rơi ngày mai → list "hôm nay" lọc mất (S3 fail).
    );
    const check = psql(
      "fulfillment",
      `SELECT technician_code || '|' || status FROM installation_orders WHERE service_order_code = '${REG_CODE}'`,
    ).trim();
    expect(check).toBe("KTV-001|CONFIRMED");
  });

  test("S3 · :375 accept → complete SO-REGxx (flow mutate trọn)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    const card = page.getByTestId(`ktv-order-card-${REG_CODE}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`ktv-accept-${REG_CODE}`)).toBeVisible();
    await page.getByTestId(`ktv-accept-${REG_CODE}`).click();
    await expect(page.getByText("Đã nhận việc")).toBeVisible();
    await expect(page.getByTestId(`ktv-complete-${REG_CODE}`)).toBeVisible();
    await page.getByTestId(`ktv-complete-${REG_CODE}`).click();
    await expect(page.getByText("Xác nhận hoàn tất?")).toBeVisible();
    await page.locator(".ant-modal-confirm-btns .ant-btn-primary").click();
    await expect(page.getByText("Đã hoàn tất lắp đặt")).toBeVisible();
    // BE-authoritative: status DELIVERED trong DB
    const st = psql(
      "fulfillment",
      `SELECT status FROM installation_orders WHERE service_order_code = '${REG_CODE}'`,
    ).trim();
    expect(st).toBe("DELIVERED");
  });

  test("S1 · SW: nav chưa cache khi offline → fallback offline.html", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    // đợi SW control (install PRECACHE xong — offline.html đã trong cache)
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    );
    // ⚠ Playwright setOffline KHÔNG áp dụng fetch() trong service worker
    // (SW fetch vẫn tới server còn sống → vite SPA fallback index.html 200).
    // context.route(...abort) cũng không chạm SW-internal fetch. Fallback chỉ
    // trigger khi server THẬT SỰ unreachable → kill listener :4220 trong test,
    // spawn lại vite sau (detached, env kế thừa) để S2/S4/S5 chạy tiếp.
    execSync("/usr/sbin/lsof -ti tcp:4220 | xargs kill -9", { stdio: "pipe" });
    let offlineNavPassed = false;
    try {
      await page.context().setOffline(true);
      // '/sw-uncached-nav' không trong PRECACHE → network-first miss → offline.html
      await page.goto("/sw-uncached-nav", { waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect(page.locator("body")).toContainText(/mất kết nối|ngoại tuyến|offline/i, {
        ignoreCase: true,
      });
      offlineNavPassed = true;
    } finally {
      await page.context().setOffline(false);
      // spawn lại vite dev :4220 (env VITE_* từ runner/run-1401.sh) — detached
      // để sống sau khi worker test thoát; poll chờ port lên. Lỗi restore chỉ
      // ném khi body test PASS — KHÔNG mask assertion failure gốc (P2 review).
      const appDir = resolve(__dirname, "../../apps/ktv-mobile");
      const child = spawn("pnpm", ["exec", "vite", "--port", "4220", "--strictPort"], {
        cwd: appDir,
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
      child.unref();
      let restored = false;
      try {
        execSync(
          `for i in $(seq 1 60); do /usr/bin/nc -z localhost 4220 >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
          { shell: "/bin/bash", stdio: "pipe" },
        );
        restored = true;
      } catch {
        restored = false;
      }
      if (offlineNavPassed && !restored) {
        // body test PASS — lỗi restore phải nổi rõ thay vì để S2/S4/S5 fail ảo
        throw new Error("S1 restore: vite :4220 không lên lại sau 60s — seam hỏng cho các test sau");
      }
    }
  });

  test("S2 · SW: /api/ pass-through tuyệt đối — offline fail KHÔNG serve stale", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    );
    await page.context().setOffline(true);
    try {
      const result = await page.evaluate(async () => {
        try {
          const res = await fetch("/api/ktv/orders?scope=install", { method: "GET" });
          return { ok: res.ok, status: res.status, fromCache: false };
        } catch {
          return { ok: false, status: 0, fromCache: false };
        }
      });
      // pass-through = network error offline (fetch reject). Nếu res.ok=true
      // mà offline → SW đã serve stale (vi phạm guard 3).
      expect(result.ok, "/api/ offline phải fail (pass-through), không stale").toBe(false);
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("S4 · SW: CACHE version — cache active khớp CACHE const trong sw.js", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 15_000 },
    );
    const declared = await page.evaluate(async () => {
      const src = await (await fetch("/sw.js")).text();
      const m = src.match(/const CACHE = '([^']+)'/);
      return m?.[1] ?? null;
    });
    expect(declared).toBeTruthy();
    const cachesNow = await page.evaluate(async () => caches.keys());
    // activate dọn cache cũ → chỉ còn CACHE hiện tại
    expect(cachesNow).toEqual([declared]);
  });
});

test.describe("SF-6 ktv-mobile regression — CTV-001", () => {
  test.use({
    storageState:
      process.env.E2E_CTV_STORAGE ?? resolve(__dirname, "../.auth/ctv-001.json"),
  });

  test("S5 · CTV-001 không thấy đơn KTV (kể cả SO-REGxx vừa seed)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ktv-my-orders")).toBeVisible();
    await expect(page.getByTestId("ktv-order-card-SO-0007")).toBeVisible();
    await expect(page.getByTestId(`ktv-order-card-${REG_CODE}`)).toHaveCount(0);
    await expect(page.getByTestId("ktv-order-card-SO-0004")).toHaveCount(0);
    await expect(page.getByTestId("ktv-order-card-SO-0006")).toHaveCount(0);
  });
});
