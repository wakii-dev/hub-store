/**
 * Mappers proto (hubstore.fulfillment.v1) → REST DTO (@hub-store/shared
 * api-contracts + types §4). Enums numeric pass-through — wire codes khớp
 * 1:1 giữa proto và shared enums (proto comment: mirror packages/shared/src/enums.ts).
 */
import type {
  HubStoreOrderFilterItem as ProtoOrderItem,
  Region as ProtoRegion,
  DeliveryStaff as ProtoDeliveryStaff,
  Shop as ProtoShop,
  ShopAssignmentHistoryEntry as ProtoHistoryEntry,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type {
  DeliveryStaffDto,
  OrderDetail,
  OrderHistoryEntry,
  RegionDto,
  ShopDto,
} from '@hub-store/shared';
import type {
  BatchStatus,
  HubStoreOrderFilterItem,
  OrderStatus,
  ShopAssignment,
} from '@hub-store/shared';
import { mapTimeRangeFromProto as mapTimeRange } from './shared.js';

function mapShopAssignment(sa?: ProtoOrderItem['shopAssignment']): ShopAssignment {
  return {
    shopCode: sa?.shopCode ?? '',
    shopName: sa?.shopName ?? '',
    address: sa?.address ?? '',
  };
}

export function mapOrderItem(item: ProtoOrderItem): HubStoreOrderFilterItem {
  return {
    fulfillCode: item.fulfillCode,
    statusCode: item.statusCode,
    // proto TS-enum → shared literal-union: same wire codes (proto mirrors
    // packages/shared/src/enums.ts) — bridge qua Number cast.
    batchStatus: Number(item.batchStatus) as BatchStatus,
    batchCode: item.batchCode ?? undefined,
    shopAssignment: mapShopAssignment(item.shopAssignment),
    originalTime: mapTimeRange(item.originalTime),
    deliveryTime: mapTimeRange(item.deliveryTime),
    orderStatus: Number(item.orderStatus) as OrderStatus,
    items: (item.items ?? []).map((p) => ({
      productCode: p.productCode,
      productName: p.productName,
      quantity: p.quantity,
    })),
    codAmount: Number(item.codAmount),
    totalQuantity: item.totalQuantity,
    isDebtSplittingOrder: item.isDebtSplittingOrder,
    customerAddress: item.customerAddress,
    distance: item.distance ?? undefined,
    // SF-13 additive fields (proto 16-20): fail fields NULL → empty string → undefined.
    customerName: item.customerName || undefined,
    customerPhone: item.customerPhone || undefined,
    failReason: item.failReason || undefined,
    failNote: item.failNote || undefined,
    oldFulfillCode: item.oldFulfillCode || undefined,
  };
}

/**
 * GET /fulfillment/{fulfillCode} — OrderDetail DTO. GAP documented: proto
 * GetOrderDetailResponse KHÔNG mang orderCode (mã RSA) — emit chuỗi rỗng,
 * KHÔNG fallback fulfillCode (tránh dữ liệu referential sai). Endpoint bị FE
 * waive (spec §3.8) — nếu cần thật, mở rộng proto qua PM approval (§3.2).
 * history[] được BFF aggregate thêm từ GetAssignHistory (aggregation là vai
 * BFF — spec §3.3 "BFF owns: aggregation + auth").
 */
export function mapOrderDetail(
  item: ProtoOrderItem,
  history: OrderHistoryEntry[],
): OrderDetail {
  return {
    ...mapOrderItem(item),
    orderCode: '',
    note: item.note ?? '',
    history,
  };
}

/**
 * POST /fulfillment/{code}/history — READ semantics (spec §3.8): map entry
 * lịch sử chuyển kho, KHÔNG mutate gì phía upstream.
 */
export function mapHistoryEntry(entry: ProtoHistoryEntry): OrderHistoryEntry {
  return {
    timestamp: entry.changedAt,
    action: 'ASSIGN_SHOP_HUB',
    fromShopCode: entry.fromShop?.shopCode,
    toShopCode: entry.toShop?.shopCode,
    actor: entry.changedBy,
  };
}

export function mapRegion(r: ProtoRegion): RegionDto {
  // REGION_TYPE_PROVINCE=0 | REGION_TYPE_WARD=1 (mirror shared D6 shape).
  return {
    code: r.code,
    name: r.name,
    type: r.type === 1 ? 'ward' : 'province',
    ...(r.parentCode !== undefined ? { parentCode: r.parentCode } : {}),
  };
}

export function mapDeliveryStaff(d: ProtoDeliveryStaff): DeliveryStaffDto {
  // proto DeliveryStaff không có phone — DTO phone optional, omit.
  return { staffId: d.id, name: d.name, shopCode: d.shopCode };
}

export function mapShop(s: ProtoShop): ShopDto {
  // Shape trùng ShopAssignment §4 (batching.ts contract: re-use, không lặp).
  return { shopCode: s.code, shopName: s.name, address: s.address };
}
