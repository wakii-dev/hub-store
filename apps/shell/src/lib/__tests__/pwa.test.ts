import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DESIGN_TOKENS } from "@hub-store/shared";
import { registerServiceWorker } from "../pwa";

// SF-23 T1 — theme-token + fetch-guard contract tests (pattern: shared-theme.test.ts
// + shell static-file smoke). Static files đọc qua fs — jsdom env nhưng fs vẫn chạy node.

const shellDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("PWA manifest (SF-23 T1)", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(shellDir, "public/manifest.webmanifest"), "utf-8"),
  ) as Record<string, unknown>;

  it("theme_color literal === design-tokens primary (FPT Orange) — single source of truth", () => {
    expect(manifest.theme_color).toBe(DESIGN_TOKENS.color.primary);
  });

  it("manifest đầy đủ: name/start_url/display + 2 icons 192/512", () => {
    expect(manifest.name).toBe("HubStore");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    const icons = manifest.icons as Array<Record<string, string>>;
    expect(icons.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
  });
});

describe("service worker fetch-guard (SF-23 T1 — đúng thứ tự spec §4.1)", () => {
  const sw = readFileSync(resolve(shellDir, "public/sw.js"), "utf-8");

  it("guard 3 /api/ pass-through TUYỆT ĐỐI tồn tại (SSE sống ở /api — 07-realtime)", () => {
    expect(sw).toContain("startsWith('/api/')");
  });

  it("guard 1 non-GET pass-through trước tất cả", () => {
    expect(sw).toContain("req.method !== 'GET'");
  });

  it("guard 2 cross-origin pass-through (MF dev remotes, CDN)", () => {
    expect(sw).toContain("url.origin !== self.location.origin");
  });

  it("cache name hubstore-v1 + skipWaiting + clients.claim", () => {
    expect(sw).toContain("'hubstore-v1'");
    expect(sw).toContain("skipWaiting");
    expect(sw).toContain("clients.claim");
  });

  it("network-first navigation fallback → /offline.html", () => {
    expect(sw).toContain("caches.match('/offline.html')");
  });
});

describe("registerServiceWorker (SF-23 T1)", () => {
  it("không throw khi gọi trong env không hỗ trợ SW — silent no-op", () => {
    expect(() => registerServiceWorker()).not.toThrow();
  });
});

describe("index.html PWA wiring (SF-23 T1)", () => {
  const html = readFileSync(resolve(shellDir, "index.html"), "utf-8");

  it("chứa link manifest + theme-color meta + apple-touch-icon", () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("/manifest.webmanifest");
    expect(html).toContain('name="theme-color"');
    expect(html).toContain("#EB6E09");
    expect(html).toContain('rel="apple-touch-icon"');
  });
});
