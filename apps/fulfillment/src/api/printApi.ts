import { api, getAxiosInstance } from '@hub-store/api-client';
import type { BatchDto, PrintErrorCountsResponse, PrintRequest, PrintersResponse } from '@hub-store/shared';

/**
 * SF-10 print endpoints — inject vào RTK Query SINGLETON của api-client
 * (pattern code-splitting chuẩn RTKQ, như batchesApi của SF-9).
 *
 * POST /fulfillment/print KHÔNG đi qua RTK Query: response là application/pdf
 * BYTES (spec §3.7, PrintResponseMeta) — axiosBaseQuery không hỗ trợ
 * `responseType: 'blob'` → helper printDocument() dùng axios instance trực tiếp
 * (token interceptor của singleton vẫn chạy trên mọi request).
 */
const printApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Detail phiếu — lấy shopCode của batch để fetch printers registry.
    getBatchDetail: builder.query<BatchDto, string>({
      query: (batchCode) => ({
        url: `/fulfillment/batches/${encodeURIComponent(batchCode)}`,
        method: 'GET',
      }),
      providesTags: (_result, _error, batchCode) => [{ type: 'Batches', id: batchCode }],
    }),

    // Danh sách máy in theo kho (print-service registry qua BFF).
    getPrinters: builder.query<PrintersResponse, string>({
      query: (shopCode) => ({
        url: '/fulfillment/print/printers',
        method: 'GET',
        params: { shopCode },
      }),
      providesTags: () => [{ type: 'Batches', id: 'PRINTERS' }],
    }),

    // SF-21 (spec D2): số lỗi in per đơn theo phiếu — badge + sort PrintPage.
    getPrintErrorCounts: builder.query<PrintErrorCountsResponse, string>({
      query: (batchCode) => ({
        url: '/fulfillment/print-errors/counts',
        method: 'GET',
        params: { batchCode },
      }),
      providesTags: (_result, _error, batchCode) => [
        { type: 'Batches', id: `PRINT_ERRORS-${batchCode}` },
      ],
    }),
  }),
});

export const {
  useGetBatchDetailQuery,
  useGetPrintersQuery,
  useGetPrintErrorCountsQuery,
} = printApi;

/**
 * In 1 phiếu → PDF bytes (Uint8Array cho react-pdf `file={{ data }}`).
 * BFF trả `application/pdf` không envelope; khi LỖI, axios gói body envelope
 * trong Blob (do responseType 'blob') → parse .text() để lấy message.
 */
export async function printDocument(req: PrintRequest): Promise<Uint8Array> {
  try {
    const resp = await getAxiosInstance().request<Blob>({
      url: '/fulfillment/print',
      method: 'POST',
      data: req,
      responseType: 'blob',
    });
    return new Uint8Array(await resp.data.arrayBuffer());
  } catch (err) {
    throw new Error(await extractErrorMessage(err));
  }
}

async function extractErrorMessage(err: unknown): Promise<string> {
  const axiosErr = err as {
    response?: { data?: unknown };
    message?: string;
  };
  const data: unknown = axiosErr?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Blob không phải JSON envelope — rơi xuống message gốc của axios.
    }
  }
  return axiosErr?.message ?? 'Print request failed';
}
