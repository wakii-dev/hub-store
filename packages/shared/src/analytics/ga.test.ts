// SF-23 T7 — GA dual-mode test. MEASUREMENT_ID đọc module-scope → mỗi case
// nạp module FRESH qua vi.resetModules() + dynamic import (stub env trước khi
// import — pattern readEnv comment của shell/src/auth/oidc.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GaModule = typeof import('./ga');

async function loadGa(): Promise<GaModule> {
  vi.resetModules();
  return import('./ga');
}

function cleanWindow(): void {
  delete (window as { gtag?: unknown }).gtag;
  delete (window as { dataLayer?: unknown }).dataLayer;
  delete (window as { __gaBuffer?: unknown }).__gaBuffer;
  document
    .querySelectorAll('script[src*="googletagmanager"]')
    .forEach((s) => s.remove());
}

describe('ga off-mode (VITE_GA_MEASUREMENT_ID trống)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    cleanWindow();
  });
  afterEach(cleanWindow);

  it('initAnalytics KHÔNG inject script + KHÔNG tạo gtag', async () => {
    const ga = await loadGa();
    ga.initAnalytics();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.gtag).toBeUndefined();
    expect(window.dataLayer).toBeUndefined();
  });

  it('pageview + trackEvent ghi vào window.__gaBuffer (không network)', async () => {
    const ga = await loadGa();
    ga.pageview('/hub-store-order/order');
    ga.trackEvent('order_created');
    ga.trackEvent('orders_imported', { count: 3 });
    expect(window.__gaBuffer).toEqual([
      { name: 'page_view', params: { path: '/hub-store-order/order' } },
      { name: 'order_created', params: undefined },
      { name: 'orders_imported', params: { count: 3 } },
    ]);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});

describe('ga on-mode (env có measurement id)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123456');
    cleanWindow();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanWindow();
  });

  it('initAnalytics inject gtag.js script + config anonymize_ip', async () => {
    const ga = await loadGa();
    ga.initAnalytics();
    const script = document.querySelector('script[src*="googletagmanager"]');
    expect(script?.getAttribute('src')).toContain('id=G-TEST123456');
    expect(window.gtag).toBeTypeOf('function');
    const configCall = window.dataLayer?.find(
      (entry) => Array.isArray(entry) && entry[0] === 'config',
    ) as unknown[] | undefined;
    expect(configCall?.[1]).toBe('G-TEST123456');
    expect(configCall?.[2]).toEqual({ anonymize_ip: true });
  });

  it('pageview + trackEvent push vào dataLayer (KHÔNG vào buffer)', async () => {
    const ga = await loadGa();
    ga.initAnalytics();
    ga.pageview('/hub-store-order/batch');
    ga.trackEvent('batch_completed', { code: 'B-1' });
    const events = window.dataLayer?.filter(
      (entry) => Array.isArray(entry) && entry[0] === 'event',
    );
    expect(events).toEqual([
      ['event', 'page_view', { page_path: '/hub-store-order/batch' }],
      ['event', 'batch_completed', { code: 'B-1' }],
    ]);
    expect(window.__gaBuffer).toEqual([]);
  });
});
