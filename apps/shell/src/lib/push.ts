// SF-23 T6 — OneSignal web push (spec §4.2). Env-gated: VITE_ONESIGNAL_APP_ID
// trống → TẤT CẢ hàm no-op, KHÔNG inject script, KHÔNG console lỗi (acceptance
// "env trống sạch"). Có appId → load SDK từ CDN (defer; onerror silent — CDN
// fail thì app vẫn chạy), init rồi login/logout theo session shell.
//
// Env đọc LAZY qua readEnv fallback (pattern oidc.ts:29-39): import.meta.env
// trong vitest là per-module object — fallback process.env để test stub được
// bằng vi.stubEnv mà không cần resetModules.

type ViteEnv = Record<string, string | undefined>;

function readEnv(): ViteEnv {
  const meta = (import.meta as unknown as { env?: ViteEnv }).env ?? {};
  const proc = (globalThis as { process?: { env?: ViteEnv } }).process;
  return proc?.env ? { ...proc.env, ...meta } : meta;
}

function appId(): string | undefined {
  return readEnv().VITE_ONESIGNAL_APP_ID;
}

interface OneSignalSdk {
  init(options: { appId: string }): Promise<void>;
  login(id: string): Promise<void>;
  logout(): Promise<void>;
}

declare global {
  interface Window {
    OneSignal?: OneSignalSdk;
  }
}

let started = false;

/** main.tsx gọi 1 lần lúc init — idempotent (started guard). */
export function initOneSignal(): void {
  const id = appId();
  if (!id || started || typeof document === "undefined") return;
  started = true;
  const s = document.createElement("script");
  s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  s.defer = true;
  s.async = true;
  s.onerror = () => {
    /* CDN fail — app vẫn chạy, KHÔNG console lỗi */
  };
  s.onload = () => {
    void window.OneSignal?.init({ appId: id });
  };
  document.head.appendChild(s);
}

/** external_id = preferred_username (session.sub) — guard window.OneSignal. */
export function pushLogin(username: string | undefined): void {
  if (!appId() || !username || !window.OneSignal) return;
  void window.OneSignal.login(username);
}

/** Session null → logout external_id — guard window.OneSignal. */
export function pushLogout(): void {
  if (!appId() || !window.OneSignal) return;
  void window.OneSignal.logout();
}
