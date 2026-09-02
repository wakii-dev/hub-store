/**
 * Fixtures cho contract harness — shape PROTO (hubstore.*.v1), KHÔNG DTO.
 * Giá trị mirror api/seed/canonical-seed.json (ORD-3001 / shop 30201) để
 * hợp lệ theo seed contract (spec §3.5) nhưng harness tự dựng, không load seed.
 */
import type {
  FilterOrdersResponse,
  GetAssignHistoryResponse,
  GetOrderDetailResponse,
  GetTimeDeliveryResponse,
  HubStoreOrderFilterItem,
  ListDeliveryStaffResponse,
  ListDistinctShopsResponse,
  ListRegionsResponse,
} from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type {
  Batch,
  CancelBatchResponse,
  CompletePickingResponse,
  CreateBatchResponse,
  FilterBatchesResponse,
  GetBatchCriteriaResponse,
  GetBatchDetailResponse,
  PackingSuggestResponse,
  RecalculateDistanceResponse,
} from '../../../api/proto/gen/ts/hubstore/batching/v1/batching';
import type {
  ListPrintersResponse,
  PrintResponse,
} from '../../../api/proto/gen/ts/hubstore/print/v1/print';
import type {
  ConfirmImportOrdersResponse,
  CreateManualOrderResponse,
  GetOrderAuditResponse,
  MarkOrderFailedResponse,
  RedeliverOrderResponse,
  ValidateImportOrdersResponse,
} from '../../../api/proto/gen/ts/hubstore/intake/v1/intake';

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 hub-store contract-test\n');

export const fixtureOrder: HubStoreOrderFilterItem = {
  fulfillCode: 'ORD-3001',
  statusCode: 0,
  batchStatus: 0,
  batchCode: undefined,
  shopAssignment: { shopCode: '30201', shopName: 'FPT Shop Cầu Giấy', address: '124 Xuân Thủy' },
  originalTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T12:00:00+07:00' },
  deliveryTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-04T12:00:00+07:00' },
  orderStatus: 1,
  items: [{ productCode: 'PRD-001', productName: 'Modem WiFi 6 FPT', quantity: 1 }],
  codAmount: 1850000,
  totalQuantity: 1,
  isDebtSplittingOrder: false,
  customerAddress: 'Số 1 Trịnh Văn Bô',
  distance: 4.2,
  note: '',
  // SF-13 additive fields (proto fields 16-20 — required strings).
  customerName: 'Nguyễn Văn A',
  customerPhone: '0912345678',
  failReason: '',
  failNote: '',
  oldFulfillCode: '',
};

export const fixtureBatch: Batch = {
  batchCode: 'BAT-1001',
  shopCode: '30201',
  shipperId: 'S-01',
  deliveryTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T12:00:00+07:00' },
  status: 0,
  items: [
    {
      batchCode: 'BAT-1001',
      stopOrder: 1,
      orderCode: 'RSA-700101',
      customerAddress: 'Số 1 Trịnh Văn Bô',
      distance: 4.2,
      fromDeliveryTime: '2026-09-03T08:00:00+07:00',
      toDeliveryTime: '2026-09-03T12:00:00+07:00',
      orderStatus: 1,
      orderType: 1,
      items: [{ productCode: 'PRD-001', productName: 'Modem WiFi 6 FPT', quantity: 1 }],
      totalQuantity: 1,
      codAmount: 1850000,
    },
  ],
  createdAt: '2026-09-01T09:00:00+07:00',
};

/** Response fixtures cho happy-path handlers. */
export const fulfillmentResponses = {
  filterOrders: {
    items: [fixtureOrder],
    total: 27,
    page: 1,
    pageSize: 20,
  } as FilterOrdersResponse,
  getOrderDetail: { order: fixtureOrder } as GetOrderDetailResponse,
  getAssignHistory: {
    entries: [
      {
        fulfillCode: 'ORD-3001',
        fromShop: { shopCode: '30201', shopName: 'FPT Shop Cầu Giấy', address: '' },
        toShop: { shopCode: '30202', shopName: 'FPT Shop Cầu Diễn', address: '' },
        changedAt: '2026-08-30T10:00:00+07:00',
        changedBy: 'admin',
      },
    ],
  } as GetAssignHistoryResponse,
  listRegions: {
    regions: [
      { code: 'HNI', name: 'Hà Nội', type: 0, parentCode: undefined },
      { code: 'CG', name: 'Cầu Giấy', type: 1, parentCode: 'HNI' },
    ],
  } as ListRegionsResponse,
  listDeliveryStaff: {
    items: [{ id: 'S-01', name: 'Nguyễn Ship', shopCode: '30201' }],
  } as ListDeliveryStaffResponse,
  listDistinctShops: {
    items: [{ code: '30201', name: 'FPT Shop Cầu Giấy', address: '124 Xuân Thủy' }],
  } as ListDistinctShopsResponse,
  getTimeDelivery: {
    suggestedTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T12:00:00+07:00' },
  } as GetTimeDeliveryResponse,
};

export const batchingResponses = {
  createBatch: { batch: fixtureBatch } as CreateBatchResponse,
  filterBatches: {
    items: [fixtureBatch],
    total: 5,
    page: 1,
    pageSize: 20,
  } as FilterBatchesResponse,
  getBatchDetail: { batch: fixtureBatch } as GetBatchDetailResponse,
  cancelBatch: { batch: { ...fixtureBatch, status: 2 } } as CancelBatchResponse,
  getBatchCriteria: { cancellableStatuses: [0] } as GetBatchCriteriaResponse,
  completePicking: { batch: { ...fixtureBatch, status: 1 } } as CompletePickingResponse,
  packingSuggest: {
    groups: [{ fulfillCodes: ['ORD-3001', 'ORD-3002'], totalDistanceKm: 9.5 }],
  } as PackingSuggestResponse,
  recalculateDistance: {
    distances: [{ fulfillCode: 'ORD-3001', distanceKm: 4.4 }],
  } as RecalculateDistanceResponse,
};

export const printResponses = {
  listPrinters: {
    printers: [{ id: 'P-30201-01', name: 'Printer Tầng 2', shopCode: '30201' }],
  } as ListPrintersResponse,
  print: { pdfContent: PDF_BYTES } as PrintResponse,
};

/** SF-13 intake — happy-path defaults (per-test override khi cần fail). */
export const intakeResponses = {
  validateImportOrders: { errors: [] } as ValidateImportOrdersResponse,
  confirmImportOrders: { fulfillCodes: ['ORD-4001', 'ORD-4002'] } as ConfirmImportOrdersResponse,
  createManualOrder: { fulfillCode: 'ORD-4001' } as CreateManualOrderResponse,
  markOrderFailed: {} as MarkOrderFailedResponse,
  redeliverOrder: { newFulfillCode: 'ORD-9001' } as RedeliverOrderResponse,
  getOrderAudit: {
    entries: [
      {
        actor: 'coordinator1',
        action: 'order.imported',
        target: 'ORD-4001',
        detailJson: '{"importedAt":"2026-09-02T10:00:00+07:00"}',
        createdAt: '2026-09-02T10:00:00+07:00',
      },
    ],
  } as GetOrderAuditResponse,
};
