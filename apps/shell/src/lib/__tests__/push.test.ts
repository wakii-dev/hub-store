import { afterEach, describe, expect, it, vi } from "vitest";
import { initOneSignal, pushLogin, pushLogout } from "../push";

// SF-23 T6 — env-gated OneSignal init (acceptance: env trống → KHÔNG inject
// script, KHÔNG console lỗi). APP_ID đọc LAZY qua readEnv fallback process.env
// (pattern oidc.ts) → vi.stubEnv đủ, KHÔNG cần vi.resetModules.

afterEach(() => {
  vi.unstubAllEnvs();
  document.head.innerHTML = "";
  delete (window as { OneSignal?: unknown }).OneSignal;
});

describe("initOneSignal (SF-23 T6)", () => {
  it("env trống → không inject script, không throw (acceptance env sạch)", () => {
    vi.stubEnv("VITE_ONESIGNAL_APP_ID", "");
    const errSpy = vi.spyOn(console, "error");
    expect(() => initOneSignal()).not.toThrow();
    expect(document.querySelectorAll('script[src*="onesignal"]')).toHaveLength(0);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("env có appId → inject CDN script (defer + async)", () => {
    vi.stubEnv("VITE_ONESIGNAL_APP_ID", "test-app-id");
    initOneSignal();
    const s = document.querySelector('script[src*="onesignal"]');
    expect(s).not.toBeNull();
    expect(s!.getAttribute("src")).toContain("cdn.onesignal.com");
    expect(s!.getAttribute("defer")).not.toBeNull();
    expect((s as HTMLScriptElement).async).toBe(true);
  });

  it("idempotent — gọi 2 lần chỉ inject 1 script (fresh module state qua resetModules)", async () => {
    vi.resetModules(); // `started` là module-scope — test trước đã set true
    const { initOneSignal: freshInit } = await import("../push");
    vi.stubEnv("VITE_ONESIGNAL_APP_ID", "test-app-id");
    freshInit();
    freshInit();
    expect(document.querySelectorAll('script[src*="onesignal"]')).toHaveLength(1);
  });
});

describe("pushLogin / pushLogout (SF-23 T6)", () => {
  it("guard: không có window.OneSignal → no-op không throw (kể cả env có appId)", () => {
    vi.stubEnv("VITE_ONESIGNAL_APP_ID", "test-app-id");
    expect(() => pushLogin("alice")).not.toThrow();
    expect(() => pushLogout()).not.toThrow();
  });

  it("window.OneSignal có sẵn → login(sub) / logout() được gọi", () => {
    vi.stubEnv("VITE_ONESIGNAL_APP_ID", "test-app-id");
    const login = vi.fn();
    const logout = vi.fn();
    (window as { OneSignal?: unknown }).OneSignal = { login, logout, init: vi.fn() };
    pushLogin("alice");
    pushLogout();
    expect(login).toHaveBeenCalledWith("alice");
    expect(logout).toHaveBeenCalled();
  });

  it("username undefined → không gọi login", () => {
    vi.stubEnv("VITE_ONESIGNAL_APP_ID", "test-app-id");
    const login = vi.fn();
    (window as { OneSignal?: unknown }).OneSignal = { login, logout: vi.fn(), init: vi.fn() };
    pushLogin(undefined);
    expect(login).not.toHaveBeenCalled();
  });
});
