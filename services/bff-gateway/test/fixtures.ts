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
import { DeliveryStatus } from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';
import type {
  AssignTechnicianResponse,
  DeliveryOrder as ProtoDeliveryOrder,
  FilterDeliveryOrdersResponse,
  FilterInstallationOrdersResponse,
  InstallationOrder as ProtoInstallationOrder,
  SuggestTechniciansResponse,
} from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';

/** SF-19 fixtures — giá trị mirror api/seed/tech-sample.json (TD-0001/SO-0001). */
export const fixtureTechDeliveryOrder: ProtoDeliveryOrder = {
  code: 'TD-0001',
  status: DeliveryStatus.DELIVERY_STATUS_SHIPPING,
  driverName: 'Trần Giao Hàng',
  driverPhone: '0901000001',
  receiver: {
    name: 'Nguyễn Văn A',
    phone: '0902000001',
    location: { lat: 10.77, long: 106.69 },
  },
  sender: { name: 'FPT Shop', phone: '19006800', location: { lat: 10.78, long: 106.7 } },
  fee: 25000,
  tip: 5000,
  items: [
    {
      code: 'PRD-001',
      name: 'Modem WiFi 6 FPT',
      quantity: 1,
      categoryL1: 'Internet',
      categoryL2: 'Modem',
    },
  ],
  regionCode: 'R1',
  province: 'TP.HCM',
  coordinationJson: '{"note":"Gọi trước khi giao"}',
  deliveryDate: '2026-09-02',
  createdAt: '2026-09-01T09:00:00+07:00',
  buttons: {
    allowCancel: true,
    allowAssign: false,
    allowReassign: false,
    allowAccept: false,
    allowReschedule: false,
  },
};

export const fixtureTechInstallationOrder: ProtoInstallationOrder = {
  serviceOrderCode: 'SO-0001',
  deliveryOrderCode: 'TD-0001',
  technicianCode: 'KTV-001',
  status: DeliveryStatus.DELIVERY_STATUS_CONFIRMED,
  expectedTime: '2026-09-03T08:00:00+07:00',
  timelineJson:
    '[{"at":"2026-09-01T10:00:00+07:00","action":"ASSIGNED","by":"KTV-001"},{"at":"2026-09-01T11:00:00+07:00","action":"CONFIRMED","by":"KTV-001"}]',
  serviceFee: 150000,
  feeAdjust: 0,
  items: [
    {
      code: 'PRD-001',
      name: 'Modem WiFi 6 FPT',
      quantity: 1,
      categoryL1: 'Internet',
      categoryL2: 'Modem',
    },
  ],
  regionCode: 'R1',
  province: 'TP.HCM',
  createdAt: '2026-09-01T09:00:00+07:00',
  buttons: {
    allowCancel: true,
    allowAssign: false,
    allowReassign: true,
    allowAccept: true,
    allowReschedule: true,
  },
};

export const techResponses = {
  filterDeliveryOrders: {
    items: [fixtureTechDeliveryOrder],
    total: 10,
    page: 1,
    pageSize: 10,
  } as FilterDeliveryOrdersResponse,
  filterInstallationOrders: {
    items: [fixtureTechInstallationOrder],
    total: 8,
    page: 1,
    pageSize: 10,
  } as FilterInstallationOrdersResponse,
  assignTechnician: {
    order: fixtureTechInstallationOrder,
  } as AssignTechnicianResponse,
  suggestTechnicians: {
    items: [
      { code: 'KTV-001', name: 'Lê Kỹ Thuật', type: 'KTV', activeCount: 1 },
      { code: 'KTV-002', name: 'Phạm Lắp Đặt', type: 'KTV', activeCount: 3 },
    ],
  } as SuggestTechniciansResponse,
};

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
