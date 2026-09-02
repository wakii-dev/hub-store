/**
 * techApi — data layer màn "Đơn dịch vụ kỹ thuật" (SF-20, FI-265).
 *
 * Dùng axios singleton của @hub-store/api-client (getAxiosInstance):
 * token getter + 401 interceptor shell đã wire ở main.tsx → mọi request
 * tự mang Bearer. KHÔNG RTKQ — shell host không có Redux Provider và
 * packages/api-client nằm ngoài touch map của SF-20.
 *
 * DTO types mirror services/bff-gateway/src/mappers/tech.ts (contract
 * SF-19) — services/** READ-ONLY nên không import chéo.
 */
import { getAxiosInstance, type PaginationEnvelope } from '@hub-store/api-client';

/**
 * Flag hiển thị nút/link "Gọi điện" (tel:) — BE không expose flag này
 * (context pack: isShowPhoneCall). Desktop: hiển thị link; mobile: mở dialer.
 */
export const IS_SHOW_PHONE_CALL = true;

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

/** Entry timeline JSONB passthrough (seed SF-19: {at,status,note,actor}). */
export interface TimelineEntry {
  at?: string;
  status?: string;
  note?: string;
  actor?: string;
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

export interface SuggestedTechnicianDto {
  code: string;
  name: string;
  type: string; // KTV | CTV
  activeCount: number;
}

export interface TechDateRange {
  from: string;
  to: string;
}

export interface DeliveryFilter {
  statuses?: string[];
  driverName?: string;
  regionCode?: string;
  province?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface InstallationFilter {
  statuses?: string[];
  technicianCode?: string;
  regionCode?: string;
  province?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/** Bỏ field rỗng — BFF nhận undefined → default upstream (today cho giao). */
function compact(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export async function filterDeliveryOrders(
  filter: DeliveryFilter,
): Promise<PaginationEnvelope<DeliveryOrderDto>> {
  const { data } = await getAxiosInstance().post<PaginationEnvelope<DeliveryOrderDto>>(
    '/delivery-orders/filter',
    compact(filter as Record<string, unknown>),
  );
  return data;
}

export async function filterInstallationOrders(
  filter: InstallationFilter,
): Promise<PaginationEnvelope<InstallationOrderDto>> {
  const { data } = await getAxiosInstance().post<PaginationEnvelope<InstallationOrderDto>>(
    '/service-orders/filter',
    compact(filter as Record<string, unknown>),
  );
  return data;
}

/** Assign/re-assign KTV — sai trạng thái → 409 (FAILED_PRECONDITION mapping BFF). */
export async function assignTechnician(
  serviceOrderCode: string,
  technicianCode: string,
): Promise<{ order: InstallationOrderDto | null }> {
  const { data } = await getAxiosInstance().post<{ order: InstallationOrderDto | null }>(
    `/service-orders/${encodeURIComponent(serviceOrderCode)}/assign`,
    { technicianCode },
  );
  return data;
}

export async function suggestTechnicians(
  regionCode: string,
): Promise<SuggestedTechnicianDto[]> {
  const { data } = await getAxiosInstance().get<{ items: SuggestedTechnicianDto[] }>(
    '/technicians/suggest',
    { params: { regionCode } },
  );
  return data.items ?? [];
}
