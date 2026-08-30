import { getI18n, type I18nResources } from "@hub-store/shared";

/**
 * Skeleton translations cho fulfillment remote. Đăng ký vào i18next SINGLETON
 * (init bởi shell khi chạy federated; tự init ở standalone boot).
 */
export const fulfillmentResources: I18nResources = {
  vi: {
    fulfillment: {
      "page.batch.title": "Phiếu soạn hàng (D2)",
      "page.batch.subtitle": "Skeleton — SF-9 thay bằng màn hình thật",
      "page.print.title": "In phiếu",
      "page.print.subtitle": "Skeleton — SF-9/SF-10 thay bằng màn hình thật",
    },
  },
  en: {
    fulfillment: {
      "page.batch.title": "Picking batches (D2)",
      "page.batch.subtitle": "Skeleton — replaced by the real screen in SF-9",
      "page.print.title": "Print documents",
      "page.print.subtitle": "Skeleton — replaced by the real screen in SF-9/SF-10",
    },
  },
};

/** Idempotent: merge fulfillment ns vào instance đang chạy (nếu đã init). */
export function registerFulfillmentResources(): void {
  const i18n = getI18n();
  if (!i18n) return;
  for (const [lng, namespaces] of Object.entries(fulfillmentResources)) {
    for (const [ns, bundle] of Object.entries(namespaces)) {
      i18n.addResourceBundle(lng, ns, bundle, true, true);
    }
  }
}
