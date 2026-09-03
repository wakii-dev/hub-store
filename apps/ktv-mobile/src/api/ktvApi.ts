/**
 * ktvApi — data layer mobile KTV/CTV (SF-25 T4 + T5 mutations).
 *
 * Dùng axios singleton của @hub-store/api-client (getAxiosInstance): token
 * getter + 401 interceptor đã wire ở main.tsx qua oidc.ts → mọi request tự
 * mang Bearer. KHÔNG RTKQ — standalone app không có Redux Provider.
 *
 * DTO types mirror services/bff-gateway/src/mappers/tech.ts (contract
 * SF-19/SF-25) — services/** READ-ONLY nên không import chéo.
 * allowComplete: mapper BFF đã map ra wire (SF-25 T2, commit f51fe2d) —
 * absent trên wire → false (an toàn, không tự suy).
 *
 * "Hôm nay" = Asia/Ho_Chi_Minh YYYY-MM-DD — khớp ::date BE (seed TODAY@
 * resolve theo CURRENT_DATE của DB, DB chạy +07).
 */
import { getAxiosInstance, type PaginationEnvelope } from '@hub-store/api-client';

/** 10 mã trạng thái giao — mirror proto DeliveryStatus (SF-19). */
export const TECH_STATUSES = [
  'NEW',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPING',
  'DELIVERED',
  'FAILED',
  'REDELIVERY',
  'RESCHEDULED',
  'CANCELLED',
  'RETURNED',
] as const;
export type TechStatus = (typeof TECH_STATUSES)[number];

export interface TechContact {
  name: string;
  phone: string;
  location: { lat: number; long: number } | null;
}

export interface TechItem {
  code: string;
  name: string;
  quantity: number;
  categoryL1: string;
  categoryL2: string;
}

/** Buttons BE-authoritative — FE chỉ render theo flag, không tự suy. */
export interface TechButtons {
  allowCancel: boolean;
  allowAssign: boolean;
  allowReassign: boolean;
  allowAccept: boolean;
  allowReschedule: boolean;
  allowComplete: boolean;
}

export interface InstallationOrderDto {
  serviceOrderCode: string;
  deliveryOrderCode: string;
  technicianCode: string;
  status: string;
  expectedTime: string;
  timeline: unknown;
  serviceFee: number;
  feeAdjust: number;
  items: TechItem[];
  regionCode: string;
  province: string;
  createdAt: string;
  buttons: TechButtons;
}

export interface DeliveryOrderDto {
  code: string;
  status: string;
  driverName: string;
  driverPhone: string;
  receiver: TechContact;
  sender: TechContact;
  fee: number;
  tip: number;
  items: TechItem[];
  regionCode: string;
  province: string;
  coordination: unknown;
  deliveryDate: string;
  createdAt: string;
  buttons: TechButtons;
}

/** Response mutate accept/complete/reschedule — {order} (MutateTechOrderResponse). */
export interface MutateTechOrderResponse {
  order: InstallationOrderDto | null;
}

/** Bỏ field rỗng — BFF nhận undefined → default upstream (pattern shell SF-20). */
function compact(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Ngày hôm nay theo Asia/Ho_Chi_Minh — YYYY-MM-DD (en-CA locale cho ISO
 * thứ tự). FE explicit gửi dateFrom/dateTo cho cả 2 filter (đơn của KTV
 * lắp đặt cần today — BE installation filter KHÔNG có default today).
 */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Đơn lắp đặt hôm nay của KTV — technicianCode = username Keycloak
 * (preferred_username, spec §4.3; BFF ép lại từ token cho role technician
 * nên giá trị body là defense-in-depth).
 */
export async function fetchMyInstallations(
  username: string,
  today?: string,
): Promise<InstallationOrderDto[]> {
  const { data } = await getAxiosInstance().post<PaginationEnvelope<InstallationOrderDto>>(
    '/service-orders/filter',
    compact({
      technicianCode: username,
      dateFrom: today,
      dateTo: today,
      page: 1,
      pageSize: 50,
    }),
  );
  return data.items ?? [];
}

/**
 * Đơn giao hàng hôm nay của KTV/CTV — filter driverName = display name
 * (user.profile.name — BFF không ép được driverName từ token, spec §4.2;
 * mapping driver↔tên là convention seed dev, flag Linear).
 */
export async function fetchMyDeliveries(
  driverName: string,
  today?: string,
): Promise<DeliveryOrderDto[]> {
  const { data } = await getAxiosInstance().post<PaginationEnvelope<DeliveryOrderDto>>(
    '/delivery-orders/filter',
    compact({
      driverName,
      dateFrom: today,
      dateTo: today,
    }),
  );
  return data.items ?? [];
}

/**
 * POST accept/complete (SF-25 T5) — body {technicianCode} (BE ownership
 * check: order.technicianCode != body → FAILED_PRECONDITION → 409).
 * Response {order} là đơn SAU mutate (status + buttons mới) — FE thay state
 * local bằng nó; order null (lạ) → throw thay vì âm thầm không cập nhật.
 */
async function mutateOrder(
  path: string,
  technicianCode: string,
): Promise<InstallationOrderDto> {
  const { data } = await getAxiosInstance().post<MutateTechOrderResponse>(path, {
    technicianCode,
  });
  if (!data.order) throw new Error(`mutateOrder ${path}: BE trả order null`);
  return data.order;
}

/** Nhận việc: CONFIRMED|RESCHEDULED → PROCESSING (flag allowAccept). */
export async function acceptOrder(
  serviceOrderCode: string,
  technicianCode: string,
): Promise<InstallationOrderDto> {
  return mutateOrder(
    `/service-orders/${encodeURIComponent(serviceOrderCode)}/accept`,
    technicianCode,
  );
}

/** Hoàn tất (ghi giờ hiện tại): PROCESSING → DELIVERED (flag allowComplete). */
export async function completeOrder(
  serviceOrderCode: string,
  technicianCode: string,
): Promise<InstallationOrderDto> {
  return mutateOrder(
    `/service-orders/${encodeURIComponent(serviceOrderCode)}/complete`,
    technicianCode,
  );
}

/**
 * Dời lịch (SF-25 T6) — body {technicianCode, expectedTime, note} (BFF
 * ép technicianCode từ token; expectedTime ISO +07:00 — FE chặn quá khứ,
 * BE tự validate lại). note optional → undefined → BFF default ''.
 * Response {order} là đơn SAU mutate: status RESCHEDULED + expectedTime mới
 * + buttons mới (allowAccept bật lại — dead-end fix spec §4.2).
 */
export async function rescheduleOrder(
  serviceOrderCode: string,
  technicianCode: string,
  expectedTime: string,
  note?: string,
): Promise<InstallationOrderDto> {
  const { data } = await getAxiosInstance().post<MutateTechOrderResponse>(
    `/service-orders/${encodeURIComponent(serviceOrderCode)}/reschedule`,
    {
      technicianCode,
      expectedTime,
      note,
    },
  );
  if (!data.order) throw new Error('rescheduleOrder: BE trả order null');
  return data.order;
}
