import { api, createListQuery } from '../api';
import { getAxiosInstance, type ErrorEnvelope } from '../baseQuery';
import type { DashboardStats } from '@hub-store/shared';

/**
 * Slice fulfillment — SF-7 (orders remote D1+D1c) dùng URLs/DTOs từ
 * packages/shared/api-contracts. List endpoints deliberately UNtyped (unknown):
 * response DTO shapes are authored by SF-2 — do NOT duplicate shared types.
 * Dashboard (SF-9) typed qua `import type` — TS-path alias, KHÔNG runtime edge.
 */
const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    // D1 — POST /fulfillment/filter (v1 pin, spec §3.1). BFF pagination envelope passes through.
    listOrders: builder.query(
      createListQuery({
        query: (params: Record<string, unknown>) => ({
          url: '/fulfillment/filter',
          method: 'POST',
          data: params,
        }),
        providesTags: () => [{ type: 'Fulfillment' as const, id: 'LIST' }],
      }),
    ),
    // Dashboard SF-9 — GET /fulfillment/dashboard-stats (BFF owns aggregation).
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => ({ url: '/fulfillment/dashboard-stats', method: 'GET' }),
      providesTags: [{ type: 'Fulfillment' as const, id: 'STATS' }],
    }),
  }),
});

export const { useListOrdersQuery, useGetDashboardStatsQuery } = enhanced;

// ---- Export CSV (SF-11, spec §4.2 + D5) -------------------------------------
// GET /fulfillment/orders/export.csv chỉ nhận querystring: fulfillCode,
// batchStatus (comma ints), regionCodes/shopCodes (comma strings), orderStatus
// (comma ints), createdAt (single YYYY-MM-DD → BFF wrap full UTC day).
// KHÔNG nhận deliveryTime/originalTime; createdAt phải single-day.

/** Structural subset của OrdersFilterUrlState (apps/orders) — tránh import ngược app→package. */
export interface OrdersExportFilterState {
  fulfillCode?: string;
  batchStatus?: string[];
  regionCodes?: string[];
  shopCodes?: string[];
  orderStatus?: string[];
  createdFrom?: string;
  createdTo?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  originalFrom?: string;
  originalTo?: string;
}

/** Querystring GET export.csv — mọi giá trị string (comma-list theo wire BFF). */
export interface OrdersExportQueryParams {
  fulfillCode?: string;
  batchStatus?: string;
  regionCodes?: string;
  shopCodes?: string;
  orderStatus?: string;
  createdAt?: string;
}

export type ExportUnsupportedReason = 'unsupportedFields' | 'createdRange';

export interface ExportDeriveResult {
  params: OrdersExportQueryParams;
  /** true → filter không hỗ trợ đang active, button disabled + Tooltip. */
  disabled: boolean;
  /** Set khi disabled (D5): 'unsupportedFields' = delivery/original active; 'createdRange' = createdFrom ≠ createdTo. */
  reason?: ExportUnsupportedReason;
}

function toCsvList(values: string[] | undefined): string | undefined {
  const joined = (values ?? []).map((v) => v.trim()).filter((v) => v !== '').join(',');
  return joined !== '' ? joined : undefined;
}

/**
 * Filter state D1 → export querystring (pure — unit test riêng). Chỉ map các
 * filter BE hỗ trợ; createdAt CHỈ khi createdFrom === createdTo (D5). Một phía
 * created set cũng coi như không set (khớp hành vi list: cần cả hai mới active).
 */
export function buildExportParams(state: OrdersExportFilterState): ExportDeriveResult {
  const deliveryActive = Boolean(state.deliveryFrom || state.deliveryTo);
  const originalActive = Boolean(state.originalFrom || state.originalTo);
  const createdFrom = (state.createdFrom ?? '').trim();
  const createdTo = (state.createdTo ?? '').trim();
  const createdRangeActive = Boolean(createdFrom && createdTo && createdFrom !== createdTo);

  if (deliveryActive || originalActive || createdRangeActive) {
    return {
      params: {},
      disabled: true,
      reason: deliveryActive || originalActive ? 'unsupportedFields' : 'createdRange',
    };
  }

  const fulfillCode = (state.fulfillCode ?? '').trim();
  return {
    params: {
      fulfillCode: fulfillCode !== '' ? fulfillCode : undefined,
      batchStatus: toCsvList(state.batchStatus),
      regionCodes: toCsvList(state.regionCodes),
      shopCodes: toCsvList(state.shopCodes),
      orderStatus: toCsvList(state.orderStatus),
      // Single-day — hai phía bằng nhau (cả hai rỗng → undefined).
      createdAt: createdFrom !== '' && createdFrom === createdTo ? createdFrom : undefined,
    },
    disabled: false,
  };
}

/**
 * Header-only check (spec §4.2 — byte-precise, KHÔNG split('\n').length):
 * mọi byte sau newline đầu tiên đều whitespace/EOF → rỗng. Không có newline
 * nào → toàn bộ file là một dòng (header) → rỗng.
 */
export function isCsvHeaderOnly(bytes: Uint8Array): boolean {
  const firstNewline = bytes.indexOf(0x0a);
  if (firstNewline === -1) return true; // một dòng duy nhất = header (BFF join luôn kết thúc mỗi row bằng \n)
  for (let i = firstNewline + 1; i < bytes.length; i += 1) {
    const b = bytes[i];
    // space, tab, LF, CR, FF, VT
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c && b !== 0x0b) {
      return false;
    }
  }
  return true;
}

/** `attachment; filename="orders-export-20260903-101500.csv"` → filename (không ngoặc). */
export function filenameFromContentDisposition(header: string): string | undefined {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  return name !== '' ? name : undefined;
}

export interface OrdersExportResult {
  ok: boolean;
  /** CSV blob (đã gồm BOM) khi ok. */
  blob?: Blob;
  /** Filename từ Content-Disposition nếu BFF gửi. */
  filename?: string;
  /** Message từ BFF error envelope khi !ok. */
  message?: string;
}

/** GET /fulfillment/orders/export.csv — caller tự tạo objectURL download từ blob (blob pattern fetchD2cOrdersExport). */
export async function fetchOrdersExport(params: OrdersExportQueryParams): Promise<OrdersExportResult> {
  try {
    const resp = await getAxiosInstance().get('/fulfillment/orders/export.csv', {
      params,
      responseType: 'blob',
    });
    const disposition = (resp.headers?.['content-disposition'] ?? '') as string;
    return {
      ok: true,
      blob: resp.data as Blob,
      filename: disposition ? filenameFromContentDisposition(disposition) : undefined,
    };
  } catch (err) {
    const axiosError = err as { response?: { data?: unknown }; message?: string };
    const data = axiosError.response?.data;
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text()) as ErrorEnvelope;
        return { ok: false, message: parsed.message };
      } catch {
        return { ok: false, message: axiosError.message };
      }
    }
    if (data && typeof data === 'object' && 'message' in data) {
      return { ok: false, message: (data as ErrorEnvelope).message };
    }
    return { ok: false, message: axiosError.message };
  }
}
