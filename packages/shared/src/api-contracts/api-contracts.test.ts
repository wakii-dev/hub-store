/**
 * Compile smoke — api-contracts (Task 3 gate).
 * Types chỉ tồn tại ở compile-time: test này (1) type-check toàn bộ surface
 * qua factory samples + expectTypeOf (assertion sai type = fail khi vitest
 * transpile với type-check qua `pnpm build` tsc --noEmit), (2) assert runtime
 * shape của sample object khớp contract (pagination envelope đủ 4 keys).
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  BATCH_STATUS,
  ORDER_STATUS,
  BATCH_ENTITY_STATUS,
  PRINT_TYPES,
} from '../enums';
import type { BatchStatus, BatchEntityStatus, PrintType } from '../enums';
import type { HubStoreOrderFilterItem } from '../types';
import type {
  // envelopes
  Paginated,
  ErrorDetail,
  ErrorEnvelope,
  // fulfillment
  FilterOrdersRequest,
  FilterOrdersResponse,
  OrderHistoryEntry,
  OrderDetail,
  CompletePickingRequest,
  AssignShopHubRequest,
  AssignHistoryResponse,
  UpdateNoteRequest,
  TimeDeliveryRequest,
  TimeDeliveryResponse,
  UpdateDeliveryTimeRequest,
  // batching + master-data
  BatchDto,
  PackingSuggestRequest,
  PackingSuggestResponse,
  PackingGroup,
  CreateBatchRequest,
  FilterBatchesRequest,
  FilterBatchesResponse,
  CancelBatchRequest,
  BatchCriteriaResponse,
  RecalculateDistanceRequest,
  RecalculateDistanceResponse,
  OrderDistance,
  RegionDto,
  RegionsResponse,
  DeliveryStaffDto,
  DeliveryStaffResponse,
  ShopDto,
  ShopsResponse,
  // print
  PrintersRequest,
  PrinterDto,
  PrintersResponse,
  PrintRequest,
  PrintResponseMeta,
} from './index';

// -- Factory samples: mỗi DTO 1 instance — thiếu/bient dạng field = compile error.
const sampleOrderDetail: OrderDetail = {
  fulfillCode: 'ORD-0001',
  orderCode: 'RSA-100001',
  statusCode: 0,
  batchStatus: BATCH_STATUS.NOT_PREPARED,
  batchCode: 'BATCH-0001',
  shopAssignment: { shopCode: '30201', shopName: 'FPT Shop Cầu Giấy', address: 'X' },
  originalTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T10:00:00+07:00' },
  deliveryTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T10:00:00+07:00' },
  orderStatus: ORDER_STATUS.APPROVED,
  items: [{ productCode: 'P1', productName: 'Router WiFi 6', quantity: 1 }],
  codAmount: 1_500_000,
  totalQuantity: 1,
  isDebtSplittingOrder: false,
  customerAddress: '01 Phúc Xá, Ba Đình, Hà Nội',
  distance: 4.5,
  note: 'Giao giờ hành chính',
  history: [{ timestamp: '2026-09-01T09:00:00+07:00', action: 'ASSIGN_SHOP_HUB' }],
};

const sampleFilterRes: FilterOrdersResponse = {
  items: [sampleOrderDetail],
  total: 1,
  page: 1,
  pageSize: 10,
};
const sampleBatch: BatchDto = {
  batchCode: 'BATCH-0001',
  shopCode: '30201',
  shipperId: 'STAFF-001',
  deliveryTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T10:00:00+07:00' },
  status: BATCH_ENTITY_STATUS.ACTIVE,
  items: [],
  createdAt: '2026-09-02T08:00:00+07:00',
};
const sampleRegion: RegionDto = { code: '0101', name: 'Cầu Giấy', type: 'ward', parentCode: '01' };
const sampleStaff: DeliveryStaffDto = { staffId: 'STAFF-001', name: 'Nguyễn Văn An', shopCode: '30201' };
const samplePrinter: PrinterDto = { printerId: 'PRN-30201-01', name: 'HP LaserJet', shopCode: '30201' };

describe('api-contracts compile smoke (20 endpoints)', () => {
  it('envelopes: Paginated đủ 4 keys; ErrorEnvelope shape spec §3.1', () => {
    expect(Object.keys(sampleFilterRes).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expectTypeOf<OrderDetail>().toExtend<HubStoreOrderFilterItem>();

    const err: ErrorEnvelope = {
      statusCode: 422,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: [{ field: 'orderCodes', message: 'khác kho' }],
    };
    expect(err.details?.[0].field).toBe('orderCodes');
    expectTypeOf<ErrorDetail>().toMatchObjectType<{ field: string; message: string }>();
  });

  it('fulfillment DTOs: type-level surface', () => {
    const req: FilterOrdersRequest = {
      fulfillCode: 'ORD',
      batchStatus: [BATCH_STATUS.NOT_PREPARED],
      orderStatus: [ORDER_STATUS.PENDING_APPROVAL],
      shopCodes: ['30201'],
      regionCodes: ['0101'],
      deliveryTime: { from: '', to: '' },
      createdAt: { from: '', to: '' },
      originalTime: { from: '', to: '' },
      excludeFulfillCodes: ['ORD-0001'],
      page: 1,
      pageSize: 10,
    };
    expect(req.excludeFulfillCodes).toEqual(['ORD-0001']);
    expectTypeOf(sampleFilterRes.items[0].batchStatus).toEqualTypeOf<BatchStatus>();

    expectTypeOf<CompletePickingRequest>().toMatchObjectType<{ batchCode: string }>();
    expectTypeOf<AssignShopHubRequest>().toMatchObjectType<{ toShopCode: string }>();
    const history: AssignHistoryResponse = sampleOrderDetail.history;
    expect(history[0].action).toBe('ASSIGN_SHOP_HUB');
    expectTypeOf<OrderHistoryEntry['timestamp']>().toEqualTypeOf<string>();
    expectTypeOf<OrderHistoryEntry['action']>().toEqualTypeOf<string>();
    expectTypeOf<UpdateNoteRequest>().toMatchObjectType<{ note: string }>();
    expectTypeOf<TimeDeliveryRequest>().toMatchObjectType<{ shopCode?: string }>();
    const timeDelivery: TimeDeliveryResponse = { timeSlots: [{ from: '', to: '' }] };
    expect(timeDelivery.timeSlots).toHaveLength(1);
    expectTypeOf<UpdateDeliveryTimeRequest>().toMatchObjectType<{ deliveryTime: { from: string; to: string } }>();
  });

  it('batching + master-data DTOs: type-level surface', () => {
    const suggest: PackingSuggestResponse = {
      groups: [{ orderCodes: ['RSA-1'], totalDistance: 3.2 }],
    };
    expect(suggest.groups[0].orderCodes).toEqual(['RSA-1']);
    expectTypeOf<PackingSuggestRequest>().toMatchObjectType<{ orderCodes: string[] }>();
    expectTypeOf<PackingGroup>().toMatchObjectType<{ orderCodes: string[]; totalDistance: number }>();

    const create: CreateBatchRequest = {
      orderCodes: ['RSA-1', 'RSA-2'],
      shipperId: 'STAFF-001',
      deliveryTime: { from: '', to: '' },
    };
    expect(create.orderCodes).toHaveLength(2);

    const batchFilter: FilterBatchesRequest = { searchText: 'BATCH', status: [BATCH_ENTITY_STATUS.ACTIVE], createdAt: '2026-09-02', page: 1, pageSize: 10 };
    expect(batchFilter.status).toEqual([0]);
    const batchFilterRes: FilterBatchesResponse = { items: [sampleBatch], total: 1, page: 1, pageSize: 10 };
    expect(batchFilterRes.items[0].status).toBe(BATCH_ENTITY_STATUS.ACTIVE);
    expectTypeOf<BatchDto['status']>().toEqualTypeOf<BatchEntityStatus>();

    expectTypeOf<CancelBatchRequest>().toMatchObjectType<{ reason: string }>();
    const criteria: BatchCriteriaResponse = { cancellableStatuses: [BATCH_ENTITY_STATUS.ACTIVE] };
    expect(criteria.cancellableStatuses).toEqual([0]);

    const recalc: RecalculateDistanceResponse = { items: [{ orderCode: 'RSA-1', distance: 2.5 }] };
    expect(recalc.items[0].distance).toBe(2.5);
    expectTypeOf<RecalculateDistanceRequest>().toMatchObjectType<{ orderCodes: string[] }>();
    expectTypeOf<OrderDistance>().toMatchObjectType<{ orderCode: string; distance: number }>();

    const regions: RegionsResponse = { items: [sampleRegion] };
    expect(regions.items[0].parentCode).toBe('01');
    expectTypeOf<RegionDto['type']>().toEqualTypeOf<'province' | 'ward'>();

    const staffRes: DeliveryStaffResponse = { items: [sampleStaff] };
    expect(staffRes.items[0].shopCode).toBe('30201');
    const shop: ShopDto = { shopCode: '30201', shopName: 'FPT Shop Cầu Giấy', address: 'X' };
    const shops: ShopsResponse = { items: [shop] };
    expect(shops.items).toHaveLength(1);
  });

  it('print DTOs: 5 printTypes + PDF blob meta', () => {
    const printers: PrintersResponse = { items: [samplePrinter] };
    expect(printers.items[0].shopCode).toBe('30201');
    expectTypeOf<PrintersRequest>().toMatchObjectType<{ shopCode: string }>();

    const print: PrintRequest = { batchCode: 'BATCH-0001', printType: 'bill', printerId: 'PRN-30201-01' };
    expect(PRINT_TYPES).toContain(print.printType);
    expectTypeOf<PrintRequest['printType']>().toEqualTypeOf<PrintType>();
    const meta: PrintResponseMeta = { responseType: 'blob', contentType: 'application/pdf' };
    expect(meta.contentType).toBe('application/pdf');
  });
});
