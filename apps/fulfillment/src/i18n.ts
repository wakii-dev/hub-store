import { getI18n, type I18nResources } from "@hub-store/shared";

/**
 * Translations cho fulfillment remote (D2 — SF-9; PrintPage D3 thuộc SF-10).
 * Đăng ký vào i18next SINGLETON (init bởi shell khi chạy federated; tự init
 * ở standalone boot).
 */
export const fulfillmentResources: I18nResources = {
  vi: {
    fulfillment: {
      "page.batch.title": "Danh sách yêu cầu soạn hàng",
      "page.print.title": "In phiếu",
      "page.print.subtitle": "Skeleton — SF-10 thay bằng màn hình thật",

      "filter.search.placeholder": "Số phiếu / Số đơn",
      "filter.status.placeholder": "Trạng thái phiếu",
      "filter.createdAt.placeholder": "Thời gian tạo phiếu",
      "status.active": "Đang soạn",
      "status.completed": "Hoàn tất",
      "status.cancelled": "Đã hủy",
      "action.search": "Tìm kiếm",
      "action.reset": "Đặt lại",

      "col.stopOrder": "Thứ tự giao",
      "col.orderCode": "Mã đơn RSA",
      "col.address": "Địa chỉ khách hàng",
      "col.distance": "Khoảng cách",
      "col.deliveryTime": "Thời gian hẹn giao",
      "col.orderStatus": "Trạng thái đơn",
      "col.quantity": "SL sản phẩm",
      "col.cod": "Tiền COD",
      "col.actions": "Thao tác",

      "action.cancel": "Hủy phiếu",
      "action.complete": "Hoàn tất soạn",
      "action.print": "In",

      "batch.status": "Trạng thái phiếu",

      "cancel.title": "Hủy phiếu soạn hàng",
      "cancel.reasonLabel": "Lý do hủy",
      "cancel.reasonPlaceholder": "Nhập lý do hủy",
      "cancel.ok": "Xác nhận hủy",
      "cancel.success": "Đã hủy phiếu {{code}}",
      "cancel.failed": "Hủy phiếu thất bại",

      "complete.title": "Hoàn tất soạn hàng",
      "complete.content": "Hoàn tất phiếu {{code}}? Đơn hàng sẽ chuyển sang Đã soạn.",
      "complete.ok": "Xác nhận",
      "complete.success": "Đã hoàn tất phiếu {{code}}",
      "complete.failed": "Hoàn tất soạn thất bại",

      "expand.productCode": "Mã SP",
      "expand.productName": "Tên SP",
      "expand.quantity": "SL",
    },
  },
  en: {
    fulfillment: {
      "page.batch.title": "Picking request list",
      "page.print.title": "Print documents",
      "page.print.subtitle": "Skeleton — replaced by the real screen in SF-10",

      "filter.search.placeholder": "Batch no. / Order no.",
      "filter.status.placeholder": "Batch status",
      "filter.createdAt.placeholder": "Created date",
      "status.active": "Active",
      "status.completed": "Completed",
      "status.cancelled": "Cancelled",
      "action.search": "Search",
      "action.reset": "Reset",

      "col.stopOrder": "Delivery stop",
      "col.orderCode": "RSA order no.",
      "col.address": "Customer address",
      "col.distance": "Distance",
      "col.deliveryTime": "Scheduled delivery time",
      "col.orderStatus": "Order status",
      "col.quantity": "Product qty",
      "col.cod": "COD amount",
      "col.actions": "Actions",

      "action.cancel": "Cancel batch",
      "action.complete": "Complete picking",
      "action.print": "Print",

      "batch.status": "Batch status",

      "cancel.title": "Cancel picking batch",
      "cancel.reasonLabel": "Cancellation reason",
      "cancel.reasonPlaceholder": "Enter cancellation reason",
      "cancel.ok": "Confirm cancel",
      "cancel.success": "Batch {{code}} cancelled",
      "cancel.failed": "Failed to cancel batch",

      "complete.title": "Complete picking",
      "complete.content": "Complete batch {{code}}? Orders will move to Prepared.",
      "complete.ok": "Confirm",
      "complete.success": "Batch {{code}} completed",
      "complete.failed": "Failed to complete picking",

      "expand.productCode": "Product code",
      "expand.productName": "Product name",
      "expand.quantity": "Qty",
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
