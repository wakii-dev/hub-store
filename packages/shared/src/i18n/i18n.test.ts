import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  I18N_NAMESPACES,
  getI18n,
  initI18n,
  mergeResources,
} from './i18n';

describe('i18n infra', () => {
  it('module import KHÔNG auto-init (side-effect-free)', () => {
    // File này chạy trong module graph riêng (vitest isolate per-file)
    expect(getI18n()).toBeNull();
  });

  it('initI18n factory: defaults vi/en, đủ 4 ns, t() chạy với resources truyền vào', async () => {
    const instance = initI18n({
      resources: {
        vi: { common: { search: 'Tìm kiếm' } },
        en: { common: { search: 'Search' } },
      },
    });
    expect(getI18n()).toBe(instance);
    expect(instance.language).toBe(DEFAULT_LANGUAGE);
    // i18next normalize fallbackLng 'en' → ['en']
    const fallback = instance.options.fallbackLng;
    expect(Array.isArray(fallback) ? fallback[0] : fallback).toBe(FALLBACK_LANGUAGE);
    expect(instance.options.ns).toEqual([...I18N_NAMESPACES]);
    expect(instance.t('common:search')).toBe('Tìm kiếm');
    await instance.changeLanguage('en');
    expect(instance.t('common:search')).toBe('Search');
    // fallback: key thiếu ở en → về vi? KHÔNG — fallback lng là 'en',
    // key thiếu ở vi → về en.
    expect(instance.t('common:missing', { defaultValue: '(none)' })).toBe('(none)');
  });

  it('initI18n tạo instance MỚI mỗi lần (không tái dùng global)', () => {
    const a = initI18n();
    const b = initI18n();
    expect(a).not.toBe(b);
    expect(getI18n()).toBe(b);
  });

  it('getI18n fallback: chưa init nhưng window.__HUB_STORE_I18N__ đã có (cross-MF-bundle) → trả về instance đó', async () => {
    vi.resetModules();
    // Dynamic re-import sau resetModules → module-level `singleton` = null.
    const seeded = i18next.createInstance();
    window.__HUB_STORE_I18N__ = seeded;
    try {
      const fresh = await import('./i18n');
      expect(fresh.getI18n()).toBe(seeded);
    } finally {
      delete window.__HUB_STORE_I18N__;
    }
  });

  it('initI18n publish instance lên window.__HUB_STORE_I18N__ (bridge cho remote bundles)', async () => {
    vi.resetModules();
    delete window.__HUB_STORE_I18N__;
    const fresh = await import('./i18n');
    const instance = fresh.initI18n();
    expect(window.__HUB_STORE_I18N__).toBe(instance);
    expect(fresh.getI18n()).toBe(instance);
  });

  it('mergeResources: gộp theo lng → ns, sau đè trước', () => {
    const merged = mergeResources(
      { vi: { common: { a: '1' }, shell: { title: 'Shell' } } },
      { vi: { common: { b: '2' } }, en: { common: { a: 'one' } } },
    );
    expect(merged).toEqual({
      vi: { common: { a: '1', b: '2' }, shell: { title: 'Shell' } },
      en: { common: { a: 'one' } },
    });
  });
});
