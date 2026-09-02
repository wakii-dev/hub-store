/**
 * DTO D2C item — khớp D2cOrderDto của BFF (services/bff-gateway/src/routes/d2c.ts):
 * dates ISO string, camelCase (§4 — không leak shape proto).
 */

export interface D2cOrderItem {
  orderCode: string;
  orderIdInter: string;
  deliveryId: string;
  carrier: string;
  shop: string;
  exportEmployee: string;
  exportTime?: string;
  pushTime?: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  serviceType: string;
  productCategory: string;
  productType: string;
  isDebtSplitting: boolean;
  note: string;
  status: string;
  createdAt?: string;
  id: number;
}

/** Timestamp → 'yyyy-MM-dd HH:mm' theo múi giờ VN (hiển thị bảng + expand). */
export function formatVnTime(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
