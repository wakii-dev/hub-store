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
      "page.print.subtitle": "Xem trước và in 5 loại phiếu của lô soạn hàng",

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
      "action.replan": "Tạo lại phiếu",
      "action.rebook": "Book lại vận đơn",

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

      "empty.title": "Không có phiếu soạn hàng nào",
      "empty.sub": "Thử xóa bộ lọc hoặc chọn khoảng thời gian khác",
      "exception.markFail": "Mark thất bại",
      "exception.redeliver": "Giao lại",
      "exception.modalTitle": "Mark đơn {{code}} giao thất bại",
      "exception.reasonLabel": "Lý do giao thất bại",
      "exception.reasonPlaceholder": "Chọn lý do",
      "exception.noteLabel": "Ghi chú",
      "exception.notePlaceholder": "Ghi chú thêm (không bắt buộc)",
      "exception.submit": "Xác nhận",
      "exception.cancel": "Đóng",
      "exception.failSuccess": "Đã mark đơn {{code}} giao thất bại",
      "exception.redeliverSuccess": "Đã tạo đơn giao lại {{code}}",
      "exception.actionFailed": "Thao tác thất bại",

      "print.tab.bill": "Biên bản",
      "print.tab.delivery": "Vận đơn",
      "print.tab.handover_receipt": "Bàn giao",
      "print.tab.goods_handover": "Bàn giao hàng",
      "print.tab.installation_acceptance": "Lắp đặt",
      "print.batch.label": "Mã phiếu",
      "print.shop.label": "Kho",
      "print.printer.placeholder": "Chọn máy in",
      "print.printer.empty": "Không có máy in cho kho này",
      "print.printer.required": "Vui lòng chọn máy in trước khi in",
      "print.action.printAll": "In tất cả",
      "print.zoom.label": "Thu phóng",
      "print.preview.loading": "Đang tải bản xem trước...",
      "print.preview.error": "Không tải được bản xem trước PDF",
      "print.success": "Đã gửi lệnh in {{doc}}",
      "print.failed": "In thất bại",
      "print.missingBatch": "Thiếu mã phiếu (batchCode) trên đường dẫn",
      "print.all.progress": "Đang in {{done}}/{{total}}: {{doc}}",
      "print.all.done": "Hoàn tất in {{ok}}/{{total}} phiếu",

      "shipment.status.ORDER_CREATED": "Đã tạo vận đơn",
      "shipment.status.ASSIGNING": "Đang phân công",
      "shipment.status.ASSIGN_FAILED": "Phân công thất bại",
      "shipment.status.DRIVER_FOUND": "Đã tìm được tài xế",
      "shipment.status.DRIVER_REASSIGNING": "Đang đổi tài xế",
      "shipment.status.ARRIVED": "Tài xế đã đến",
      "shipment.status.WAITING_CONFIRM": "Chờ xác nhận",
      "shipment.status.DELIVERING": "Đang giao",
      "shipment.status.DELIVERED": "Đã giao",
      "shipment.status.COMPLETED": "Hoàn tất",
      "shipment.status.FAILED": "Giao thất bại",
      "shipment.status.CANCELLED": "Đã hủy",
      "shipment.status.RETURNING": "Đang trả hàng",
      "shipment.status.RETURNED": "Đã trả hàng",
      "shipment.status.LOST": "Thất lạc",
    },
  },
  en: {
    fulfillment: {
      "page.batch.title": "Picking request list",
      "page.print.title": "Print documents",
      "page.print.subtitle": "Preview and print the 5 document types of a picking batch",

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
      "action.replan": "Re-create batch",
      "action.rebook": "Re-book shipment",

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

      "empty.title": "No picking batches found",
      "empty.sub": "Try clearing filters or picking a different date",
      "exception.markFail": "Mark failed",
      "exception.redeliver": "Redeliver",
      "exception.modalTitle": "Mark order {{code}} as delivery failed",
      "exception.reasonLabel": "Delivery failure reason",
      "exception.reasonPlaceholder": "Select a reason",
      "exception.noteLabel": "Note",
      "exception.notePlaceholder": "Additional note (optional)",
      "exception.submit": "Confirm",
      "exception.cancel": "Close",
      "exception.failSuccess": "Order {{code}} marked as delivery failed",
      "exception.redeliverSuccess": "Created redelivery order {{code}}",
      "exception.actionFailed": "Action failed",

      "print.tab.bill": "Receipt note",
      "print.tab.delivery": "Delivery note",
      "print.tab.handover_receipt": "Handover receipt",
      "print.tab.goods_handover": "Goods handover",
      "print.tab.installation_acceptance": "Installation acceptance",
      "print.batch.label": "Batch no.",
      "print.shop.label": "Shop",
      "print.printer.placeholder": "Select a printer",
      "print.printer.empty": "No printers for this shop",
      "print.printer.required": "Select a printer before printing",
      "print.action.printAll": "Print all",
      "print.zoom.label": "Zoom",
      "print.preview.loading": "Loading preview...",
      "print.preview.error": "Failed to load PDF preview",
      "print.success": "Print job sent: {{doc}}",
      "print.failed": "Print failed",
      "print.missingBatch": "Missing batchCode query parameter",
      "print.all.progress": "Printing {{done}}/{{total}}: {{doc}}",
      "print.all.done": "Finished printing {{ok}}/{{total}} documents",

      "shipment.status.ORDER_CREATED": "Order created",
      "shipment.status.ASSIGNING": "Assigning",
      "shipment.status.ASSIGN_FAILED": "Assign failed",
      "shipment.status.DRIVER_FOUND": "Driver found",
      "shipment.status.DRIVER_REASSIGNING": "Reassigning driver",
      "shipment.status.ARRIVED": "Driver arrived",
      "shipment.status.WAITING_CONFIRM": "Awaiting confirmation",
      "shipment.status.DELIVERING": "Delivering",
      "shipment.status.DELIVERED": "Delivered",
      "shipment.status.COMPLETED": "Completed",
      "shipment.status.FAILED": "Delivery failed",
      "shipment.status.CANCELLED": "Cancelled",
      "shipment.status.RETURNING": "Returning",
      "shipment.status.RETURNED": "Returned",
      "shipment.status.LOST": "Lost",
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
