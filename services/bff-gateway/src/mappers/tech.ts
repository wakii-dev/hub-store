/**
 * Mappers TechService proto (hubstore.fulfillment.v1) → REST DTO (SF-19).
 * Trạng thái: proto enum DELIVERY_STATUS_* ↔ string thường ("NEW"...) —
 * convention spec §4: BFF trả string THÔNG THƯỜNG cho FE, nhận string từ FE.
 * Buttons BE-authoritative — map 1:1 camelCase, không tự suy flag.
 * timeline/coordination JSONB passthrough: timeline parse guarded (fallback
 * raw string khi JSON lỗi — coordination passthrough nguyên văn).
 */
import {
  DeliveryStatus,
  type Contact as ProtoContact,
  type DeliveryOrder as ProtoDeliveryOrder,
  type InstallationOrder as ProtoInstallationOrder,
  type SuggestedTechnician as ProtoSuggestedTechnician,
  type TechButtons as ProtoTechButtons,
  type TechItem as ProtoTechItem,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';

const STATUS_PREFIX = 'DELIVERY_STATUS_';

/** Proto enum → string thường (DELIVERY_STATUS_SHIPPING → "SHIPPING"). */
export function deliveryStatusToString(s: DeliveryStatus): string {
  const name = DeliveryStatus[s];
  return name.startsWith(STATUS_PREFIX) ? name.slice(STATUS_PREFIX.length) : name;
}

/** String thường → proto enum ("SHIPPING" → DELIVERY_STATUS_SHIPPING). */
export function deliveryStatusFromString(s: string): DeliveryStatus | undefined {
  return (DeliveryStatus as unknown as Record<string, DeliveryStatus | undefined>)[
    STATUS_PREFIX + s
  ];
}

/** FE body statuses: string[] → proto enums; string lạ bỏ qua (không crash). */
export function statusStringsToProto(statuses: string[] | undefined): DeliveryStatus[] {
  return (statuses ?? [])
    .map((s) => deliveryStatusFromString(s))
    .filter((s): s is DeliveryStatus => s !== undefined);
}

export interface TechButtonsDto {
  allowCancel: boolean;
  allowAssign: boolean;
  allowReassign: boolean;
  allowAccept: boolean;
  allowReschedule: boolean;
}

export function mapTechButtons(b?: ProtoTechButtons): TechButtonsDto {
  return {
    allowCancel: b?.allowCancel ?? false,
    allowAssign: b?.allowAssign ?? false,
    allowReassign: b?.allowReassign ?? false,
    allowAccept: b?.allowAccept ?? false,
    allowReschedule: b?.allowReschedule ?? false,
  };
}

export interface TechItemDto {
  code: string;
  name: string;
  quantity: number;
  categoryL1: string;
  categoryL2: string;
}

function mapItems(items: ProtoTechItem[] | undefined): TechItemDto[] {
  return (items ?? []).map((it) => ({
    code: it.code,
    name: it.name,
    quantity: it.quantity,
    categoryL1: it.categoryL1,
    categoryL2: it.categoryL2,
  }));
}

export interface ContactDto {
  name: string;
  phone: string;
  location: { lat: number; long: number } | null;
}

function mapContact(c?: ProtoContact): ContactDto {
  return {
    name: c?.name ?? '',
    phone: c?.phone ?? '',
    location: c?.location ? { lat: c.location.lat, long: c.location.long } : null,
  };
}

/** Parse JSONB passthrough string; JSON lỗi → fallback nguyên văn raw string. */
export function parseJsonGuarded(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export interface DeliveryOrderDto {
  code: string;
  status: string;
  driverName: string;
  driverPhone: string;
  receiver: ContactDto;
  sender: ContactDto;
  fee: number;
  tip: number;
  items: TechItemDto[];
  regionCode: string;
  province: string;
  coordination: unknown;
  deliveryDate: string;
  createdAt: string;
  buttons: TechButtonsDto;
}

export function mapDeliveryOrder(o: ProtoDeliveryOrder): DeliveryOrderDto {
  return {
    code: o.code,
    status: deliveryStatusToString(o.status),
    driverName: o.driverName,
    driverPhone: o.driverPhone,
    receiver: mapContact(o.receiver),
    sender: mapContact(o.sender),
    fee: o.fee,
    tip: o.tip,
    items: mapItems(o.items),
    regionCode: o.regionCode,
    province: o.province,
    coordination: parseJsonGuarded(o.coordinationJson),
    deliveryDate: o.deliveryDate,
    createdAt: o.createdAt,
    buttons: mapTechButtons(o.buttons),
  };
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
  items: TechItemDto[];
  regionCode: string;
  province: string;
  createdAt: string;
  buttons: TechButtonsDto;
}

export function mapInstallationOrder(o: ProtoInstallationOrder): InstallationOrderDto {
  return {
    serviceOrderCode: o.serviceOrderCode,
    deliveryOrderCode: o.deliveryOrderCode,
    technicianCode: o.technicianCode,
    status: deliveryStatusToString(o.status),
    expectedTime: o.expectedTime,
    timeline: parseJsonGuarded(o.timelineJson),
    serviceFee: o.serviceFee,
    feeAdjust: o.feeAdjust,
    items: mapItems(o.items),
    regionCode: o.regionCode,
    province: o.province,
    createdAt: o.createdAt,
    buttons: mapTechButtons(o.buttons),
  };
}

export interface SuggestedTechnicianDto {
  code: string;
  name: string;
  type: string;
  activeCount: number;
}

export function mapSuggestedTechnician(t: ProtoSuggestedTechnician): SuggestedTechnicianDto {
  return { code: t.code, name: t.name, type: t.type, activeCount: t.activeCount };
}
