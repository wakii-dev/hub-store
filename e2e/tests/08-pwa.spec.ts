import { expect, test, type Page } from "@playwright/test";

/**
 * SF-23 (FI-268) Task T9 — PWA + push + GA e2e (off-mode mặc định).
 *
 * Stack mặc định không có VITE_GA_MEASUREMENT_ID / ONESIGNAL_* → dual-mode
 * "off": manifest/SW/offline vẫn phục vụ đầy đủ (installable), GA không inject
 * gtag, BFF notifications vẫn 200 (fail-open khi pool thiếu env).
 *
 * P0 plan-critic: mọi assert `/api/...` dùng BFF base tuyệt đối — shell dev
 * server KHÔNG có proxy /api (relative path SPA-fallback về index.html).
 *
 * Authed notifications assert (MANDATORY spec §4.5): token đọc từ localStorage
 * của shell (oidc-client-ts userStore) — copy pattern 07-realtime.spec.ts.
 *
 * Runbook: pnpm --filter @hub-store/e2e e2e (webServer boot-all.sh tự dựng).
 */

const BFF = "http://localhost:8080"; // pattern 07-realtime.spec.ts:32 — shell dev KHÔNG proxy /api
const APP = "http://localhost:3000";

/** Bearer token cho BFF — đọc từ localStorage của shell (pattern 07-realtime). */
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

test.describe("SF-23 PWA + push + GA (off-mode mặc định)", () => {
  test("manifest đăng ký + đầy đủ", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const m = (await res.json()) as {
      theme_color?: string;
      icons?: Array<{ src: string }>;
    };
    expect(m.theme_color).toBe("#EB6E09");
    expect(m.icons?.length).toBeGreaterThanOrEqual(2);
    const icon = await request.get(m.icons![0].src);
    expect(icon.ok()).toBeTruthy();
  });

  test("service worker đăng ký + phục vụ được", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 15_000,
    });
    const swRes = await page.request.get("/sw.js");
    expect(swRes.ok()).toBeTruthy();
  });

  test("offline.html fallback tồn tại", async ({ request }) => {
    const res = await request.get("/offline.html");
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toContain("Mất kết nối");
  });

  test("/api/notifications 401 không token + 200 có token (MANDATORY spec §4.5)", async ({
    page,
    request,
  }) => {
    // Không token → 401 envelope { statusCode: 401, code: 'UNAUTHENTICATED' }
    // (services/bff-gateway/src/plugins/auth.ts unauthorized()).
    const anon = await request.get(`${BFF}/api/notifications`);
    expect(anon.status()).toBe(401);

    // Authed → 200 { items, total } (routes/notifications.ts — fail-open
    // {items:[],total:0} khi pool thiếu env, vẫn 200).
    const token = await bearerToken(page);
    const authed = await request.get(`${BFF}/api/notifications`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authed.status()).toBe(200);
    const body = (await authed.json()) as { items?: unknown[]; total?: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  test("GA off: không gtag script + 0 console error (spec §4.5)", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    const hasGtm = await page.evaluate(() =>
      Boolean(document.querySelector('script[src*="googletagmanager"]')),
    );
    expect(hasGtm).toBeFalsy();
    expect(errors).toEqual([]);
  });
});
