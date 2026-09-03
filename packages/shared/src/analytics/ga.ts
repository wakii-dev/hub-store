/**
 * SF-23 T7 — GA4 dual-mode analytics (spec §4.3).
 *
 * - ON-mode: VITE_GA_MEASUREMENT_ID được set lúc BUILD-TIME → inject gtag.js +
 *   dataLayer, mọi event push lên Google (anonymize_ip).
 * - OFF-mode: env trống (default local/test) → KHÔNG network; event ghi vào
 *   in-memory buffer + console.debug, expose `window.__gaBuffer` cho test/e2e.
 *
 * MEASUREMENT_ID đọc MODULE-SCOPE (vite nhúng build-time) — test env-on phải
 * `vi.resetModules()` + dynamic import sau khi stub `import.meta.env`
 * (pattern readEnv của shell/src/auth/oidc.ts).
 */
type GtagFn = (...args: unknown[]) => void;
type ViteEnv = Record<string, string | undefined>;
/** readEnv theo pattern oidc.ts (shell): import.meta.env trong vitest là
 * per-module object — stub từ test file KHÔNG thấy ở module khác. Fallback
 * process.env cho node test; browser không có process → chỉ import.meta.env. */
function readEnv(): ViteEnv {
  const meta = (import.meta as unknown as { env?: ViteEnv }).env ?? {};
  const proc = (globalThis as { process?: { env?: ViteEnv } }).process;
  return proc?.env ? { ...proc.env, ...meta } : meta;
}
const MEASUREMENT_ID = readEnv().VITE_GA_MEASUREMENT_ID;
const buffer: Array<{ name: string; params?: Record<string, unknown> }> = [];
/** Off-mode: đọc được từ test/e2e (window.__gaBuffer). KHÔNG network. */
declare global {
  interface Window {
    __gaBuffer?: typeof buffer;
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}
export function initAnalytics(): void {
  if (!MEASUREMENT_ID || typeof window === "undefined") return;
  const s = document.createElement("script");
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  s.async = true;
  s.onerror = () => {};
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  } as GtagFn;
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { anonymize_ip: true });
}
export function pageview(path: string): void {
  if (!MEASUREMENT_ID || typeof window === "undefined") {
    pushBuffer("page_view", { path });
    return;
  }
  window.gtag?.("event", "page_view", { page_path: path });
}
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!MEASUREMENT_ID || typeof window === "undefined") {
    pushBuffer(name, params);
    return;
  }
  window.gtag?.("event", name, params);
}
function pushBuffer(name: string, params?: Record<string, unknown>): void {
  buffer.push({ name, params });
  if (typeof console !== "undefined") console.debug(`[ga:off] ${name}`, params ?? "");
}
if (typeof window !== "undefined") window.__gaBuffer = buffer;
