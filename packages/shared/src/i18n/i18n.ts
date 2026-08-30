/**
 * i18n infra — ONE i18next instance per app, factory-created.
 *
 * KHÔNG auto-init khi import (side-effect-free module): apps init
 * explicitly qua `initI18n()` rồi đưa instance vào react-i18next
 * `<I18nextProvider>`. Shell owns init (SF-6); remotes nhận instance
 * qua context hoặc tự init với resources của mình.
 *
 * Namespace prefix convention: `shell.*` / `orders.*` / `fulfillment.*`
 * / `common.*` — key đầu tiên sau ns là namespace (ví dụ
 * `t('orders:D1.title')` hoặc defaultNS 'common' cho `common.*`).
 * SF-6 wires real translations — infra ở đây cố tình thin.
 */
import i18next, { type i18n as I18nInstance } from 'i18next';

export const I18N_NAMESPACES = ['shell', 'orders', 'fulfillment', 'common'] as const;
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export const DEFAULT_LANGUAGE = 'vi';
export const FALLBACK_LANGUAGE = 'en';

/** i18next resources shape: { [lng]: { [ns]: { key: string } } } */
export type I18nResources = Record<string, Record<string, Record<string, unknown>>>;

export interface InitI18nOptions {
  /** Ngôn ngữ khởi tạo. Default 'vi'. */
  lng?: string;
  /** Fallback. Default 'en'. */
  fallbackLng?: string;
  /** Resources (bộ dịch) do caller truyền vào — bundle không kèm dịch. */
  resources?: I18nResources;
  /** Namespace list. Default đủ 4 ns. */
  namespaces?: readonly I18nNamespace[];
  /** NS dùng khi key không có prefix. Default 'common'. */
  defaultNamespace?: I18nNamespace;
}

let singleton: I18nInstance | null = null;

/**
 * Tạo + init một i18next instance mới (factory — không side effect,
 * không đụng global i18next). Instance cuối cùng cũng được ghi nhận
 * làm singleton cho `getI18n()`.
 */
export function initI18n(options: InitI18nOptions = {}): I18nInstance {
  const instance = i18next.createInstance();
  void instance.init({
    lng: options.lng ?? DEFAULT_LANGUAGE,
    fallbackLng: options.fallbackLng ?? FALLBACK_LANGUAGE,
    ns: options.namespaces ? [...options.namespaces] : [...I18N_NAMESPACES],
    defaultNS: options.defaultNamespace ?? 'common',
    resources: options.resources ?? {},
    interpolation: { escapeValue: false },
  });
  singleton = instance;
  return instance;
}

/** Singleton getter — instance cuối được init qua factory. null nếu chưa init. */
export function getI18n(): I18nInstance | null {
  return singleton;
}

/**
 * Gộp nhiều resource packs (sau đè trước, theo lng → ns).
 * Dùng khi shell merge resources của remotes vào một instance.
 */
export function mergeResources(...sources: I18nResources[]): I18nResources {
  const out: I18nResources = {};
  for (const source of sources) {
    for (const [lng, namespaces] of Object.entries(source)) {
      const mergedLng: Record<string, Record<string, unknown>> = { ...out[lng] };
      for (const [ns, bundle] of Object.entries(namespaces)) {
        mergedLng[ns] = { ...mergedLng[ns], ...bundle };
      }
      out[lng] = mergedLng;
    }
  }
  return out;
}
