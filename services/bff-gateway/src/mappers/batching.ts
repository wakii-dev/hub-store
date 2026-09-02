/**
 * Mappers proto (hubstore.batching.v1) → REST DTO. BatchDto = Batch §4
 * (types/product.ts); BatchingItem §4 (types/batching.ts) — wire codes khớp.
 */
import type {
  Batch as ProtoBatch,
  BatchingItem as ProtoBatchingItem,
  PackingGroup as ProtoPackingGroup,
  OrderDistance as ProtoOrderDistance,
} from '../../../../api/proto/gen/ts/hubstore/batching/v1/batching';
import type {
  Batch,
  BatchEntityStatus,
  BatchingItem,
  OrderStatus,
  PackingGroup,
  OrderDistance,
} from '@hub-store/shared';
import { mapTimeRangeFromProto } from './shared.js';

export function mapBatchingItem(i: ProtoBatchingItem): BatchingItem {
  return {
    batchCode: i.batchCode,
    stopOrder: i.stopOrder,
    orderCode: i.orderCode,
    customerAddress: i.customerAddress,
    distance: i.distance,
    fromDeliveryTime: i.fromDeliveryTime,
    toDeliveryTime: i.toDeliveryTime,
    // proto TS-enum → shared literal-union (same wire codes) — Number bridge.
    orderStatus: Number(i.orderStatus) as OrderStatus,
    orderType: i.orderType,
    items: (i.items ?? []).map((p) => ({
      productCode: p.productCode,
      productName: p.productName,
      quantity: p.quantity,
    })),
    totalQuantity: i.totalQuantity,
    codAmount: Number(i.codAmount),
  };
}

export function mapBatch(b: ProtoBatch): Batch {
  return {
    batchCode: b.batchCode,
    shopCode: b.shopCode,
    shipperId: b.shipperId,
    deliveryTime: mapTimeRangeFromProto(b.deliveryTime),
    status: Number(b.status) as BatchEntityStatus,
    items: (b.items ?? []).map(mapBatchingItem),
    createdAt: b.createdAt,
  };
}

export function mapPackingGroup(g: ProtoPackingGroup): PackingGroup {
  return { orderCodes: g.fulfillCodes, totalDistance: g.totalDistanceKm };
}

export function mapOrderDistance(d: ProtoOrderDistance): OrderDistance {
  return { orderCode: d.fulfillCode, distance: d.distanceKm };
}
