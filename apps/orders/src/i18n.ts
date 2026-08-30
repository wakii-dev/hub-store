import { getI18n, type I18nResources } from "@hub-store/shared";

/**
 * Skeleton translations cho orders remote. Đăng ký vào i18next SINGLETON
 * (init bởi shell khi chạy federated; tự init ở standalone boot).
 */
export const ordersResources: I18nResources = {
  vi: {
    orders: {
      "page.title": "Đơn hàng (D1)",
      "page.subtitle": "Skeleton — SF-7 thay bằng màn hình thật",
    },
  },
  en: {
    orders: {
      "page.title": "Orders (D1)",
      "page.subtitle": "Skeleton — replaced by the real screen in SF-7",
    },
  },
};

/** Idempotent: merge orders ns vào instance đang chạy (nếu đã init). */
export function registerOrdersResources(): void {
  const i18n = getI18n();
  if (!i18n) return;
  for (const [lng, namespaces] of Object.entries(ordersResources)) {
    for (const [ns, bundle] of Object.entries(namespaces)) {
      i18n.addResourceBundle(lng, ns, bundle, true, true);
    }
  }
}
