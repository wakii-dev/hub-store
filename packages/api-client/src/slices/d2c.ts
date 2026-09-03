import { api, createListQuery } from '../api';
import { getAxiosInstance, type ErrorEnvelope } from '../baseQuery';

/**
 * SF-18 D2C/Dropship slice (FI-263, spec §3.3/3.4):
 *   POST /d2c-orders/filter          → paginated envelope { items, total, page, pageSize }
 *   PUT  /d2c-orders/:orderCode/note → { item }
 *   GET  /d2c-orders/export?from&to  → CSV blob (guard ≤31 ngày — BFF là nguồn
 *                                      truth, FE vẫn guard client-side trước).
 * DTO shapes (D2cOrderDto) được author ở consumer (apps/orders) — slice giữ
 * untyped theo pattern slice/fulfillment.ts.
 */
const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    listD2cOrders: builder.query(
      createListQuery({
        query: (params: Record<string, unknown>) => ({
          url: '/d2c-orders/filter',
          method: 'POST',
          data: params,
        }),
        providesTags: () => [{ type: 'D2c' as const, id: 'LIST' }],
      }),
    ),
    updateD2cNote: builder.mutation<{ item: unknown }, { orderCode: string; note: string }>({
      query: ({ orderCode, note }) => ({
        url: `/d2c-orders/${encodeURIComponent(orderCode)}/note`,
        method: 'PUT',
        data: { note },
      }),
      // Refetch list sau khi lưu ghi chú (note hiện cả ở cell + expand).
      invalidatesTags: () => [{ type: 'D2c' as const, id: 'LIST' }],
    }),
  }),
});

export const { useListD2cOrdersQuery, useUpdateD2cNoteMutation } = enhanced;

// ---- Export download (fetch blob qua axios singleton — interceptor token) ---

export interface D2cExportResult {
  ok: boolean;
  /** CSV blob (đã gồm BOM) khi ok. */
  blob?: Blob;
  /** Message từ BFF error envelope khi !ok (vd guard >31 ngày). */
  message?: string;
}

/** GET /d2c-orders/export?from=&to= — caller tự tạo URL download từ blob. */
export async function fetchD2cOrdersExport(from: string, to: string): Promise<D2cExportResult> {
  try {
    const resp = await getAxiosInstance().get('/d2c-orders/export', {
      params: { from, to },
      responseType: 'blob',
    });
    return { ok: true, blob: resp.data as Blob };
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
