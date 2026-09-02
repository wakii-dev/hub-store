/**
 * Fixtures cho contract harness — shape PROTO (hubstore.*.v1), KHÔNG DTO.
 * Giá trị mirror api/seed/canonical-seed.json (ORD-3001 / shop 30201) để
 * hợp lệ theo seed contract (spec §3.5) nhưng harness tự dựng, không load seed.
 */
import type {
  FilterOrdersResponse,
  GetAssignHistoryResponse,
  GetDashboardStatsResponse,
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
  ListServiceEmployeesResponse,
  ServiceEmployee,
} from '../../../api/proto/gen/ts/hubstore/staffarea/v1/staffarea';
import type {
  ConfirmImportOrdersResponse,
  CreateManualOrderResponse,
  GetOrderAuditResponse,
  MarkOrderFailedResponse,
  RedeliverOrderResponse,
  ValidateImportOrdersResponse,
} from '../../../api/proto/gen/ts/hubstore/intake/v1/intake';
import type {
  CancelDeliveryBatchResponse,
  CancelDeliveryOrderResponse,
  ConfirmPlanningResponse,
  CreateBookingResponse,
  GetQuotesResponse,
  ListAddonServicesResponse,
  SearchBookingDetailResponse,
} from '../../../api/proto/gen/ts/hubstore/batching/v1/delivery_batch';
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
    '[{"at":"2026-09-01T10:00:00+07:00","status":"NEW","note":"Tạo đơn lắp đặt SO-0001","actor":"system"},{"at":"2026-09-01T11:00:00+07:00","status":"CONFIRMED","note":"KTV-001 nhận việc","actor":"KTV-001"}]',
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

/** SF-17 — fixture NV phụ trách khu vực (shape PROTO staffarea/v1). */
export const fixtureServiceEmployee: ServiceEmployee = {
  employeeCode: 'NV-001',
  fullName: 'Nguyễn Nhân Viên',
  titleCode: 'SHIPPER',
  paymentAccount: '1234567890',
  isActive: true,
  regionCodes: ['HNI'],
  createdAt: '2026-09-01T09:00:00+07:00',
  updatedAt: '2026-09-01T09:00:00+07:00',
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
  // SF-9 — BAT-1001 (S-01) 2 đơn; khớp batchingResponses.filterBatches mặc định
  // (BAT-1001 status 0) → delivering=2, rates=0 khi không override.
  getDashboardStats: {
    ordersPerDay: [
      { date: '2026-09-01', count: 3 },
      { date: '2026-09-02', count: 2 },
    ],
    totalToday: 4,
    pendingApproval: 5,
    ordersPerBatch: [{ batchCode: 'BAT-1001', count: 2 }],
  } as GetDashboardStatsResponse,
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

/** SF-15 — DeliveryBatchService fixtures (shape PROTO delivery_batch.ts). */
export const deliveryBatchResponses = {
  getQuotes: {
    quotes: [
      {
        serviceId: 'SGCN',
        name: 'Xe máy',
        vehicleType: 'SGCN',
        baseFee: 20000,
        feePerKm: 13000,
        fee: 74600,
        etaMinutes: 60,
        isExceedFeeLimit: false,
        addonServices: [{ code: 'LOADING', name: 'Bốc xếp', grp: 'LOADING', fee: 50000 }],
      },
      {
        serviceId: '8T',
        name: 'Xe tải 8 tấn',
        vehicleType: '8T',
        baseFee: 120000,
        feePerKm: 13000,
        fee: 174600,
        etaMinutes: 90,
        isExceedFeeLimit: true,
        addonServices: [],
      },
    ],
    meta: { mock: true },
  } as GetQuotesResponse,
  confirmPlanning: {
    plannings: [
      {
        id: 101,
        planningId: '101',
        batchCode: 'BAT-1001',
        stopOrder: 1,
        orderCode: 'RSA-700101',
        vehicleType: 'SGCN',
        serviceId: 'SGCN',
        addons: ['LOADING'],
        status: 'CONFIRMED',
        codAmount: 1850000,
        totalBill: 2000000,
        fee: 74600,
      },
    ],
    meta: { mock: true },
  } as ConfirmPlanningResponse,
  createBooking: {
    bookings: [
      {
        planningId: '101',
        carrierBookingId: 'MOCK-BK-1',
        driverName: 'Nguyễn Văn A',
        driverPhone: '0901234567',
        licensePlate: '29H-123.45',
        status: 'BOOKED',
      },
    ],
    meta: { mock: true },
  } as CreateBookingResponse,
  cancelDeliveryOrder: {
    planningId: '101',
    status: 'CANCELLED',
    meta: { mock: true },
  } as CancelDeliveryOrderResponse,
  cancelDeliveryBatch: {
    results: [{ planningId: '101', status: 'CANCELLED' }],
    cancelledCount: 1,
    meta: { mock: true },
  } as CancelDeliveryBatchResponse,
  searchBookingDetail: {
    bookings: [
      {
        planningId: '101',
        booking: {
          carrierBookingId: 'MOCK-BK-1',
          driverName: 'Nguyễn Văn A',
          driverPhone: '0901234567',
          licensePlate: '29H-123.45',
          status: 'BOOKED',
          bookedAt: '2026-09-01T10:00:00Z',
          cancelledAt: '',
          cancelReason: '',
        },
        timeline: [
          { status: 'BOOKED', source: 'BE', occurredAt: '2026-09-01T10:00:00Z', note: '' },
          { status: 'DELIVERING', source: 'PARTNER', occurredAt: '2026-09-01T11:00:00Z', note: 'Đang giao' },
        ],
      },
      {
        planningId: '102',
        booking: undefined,
        timeline: [],
      },
    ],
    meta: { mock: true },
  } as SearchBookingDetailResponse,
  listAddonServices: {
    addons: [{ code: 'LOADING', name: 'Bốc xếp', grp: 'LOADING', fee: 50000, vehicleTypes: ['SGCN', '1T2'] }],
    meta: { mock: true },
  } as ListAddonServicesResponse,
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
        detailJson: '{"createdAt":"2026-09-02T10:00:00+07:00"}',
        createdAt: '2026-09-02T10:00:00+07:00',
      },
    ],
  } as GetOrderAuditResponse,
};

/** SF-17 StaffArea responses — mock default cho happy-path handlers. */
export const staffAreaResponses = {
  listServiceEmployees: {
    items: [fixtureServiceEmployee],
    total: 1,
  } as ListServiceEmployeesResponse,
  getServiceEmployee: { employee: fixtureServiceEmployee },
  createServiceEmployee: { employee: fixtureServiceEmployee },
  updateServiceEmployee: { employee: fixtureServiceEmployee },
  setServiceEmployeeActive: { employee: { ...fixtureServiceEmployee, isActive: false } },
  verifyPaymentAccount: { valid: true, source: 'MOCK', message: '[MOCK] Số TK hợp lệ.' },
};
