/**
 * batching helpers — logic thuần tách ra để unit test (mock-free).
 * Contracts: packages/shared/api-contracts/batching.ts (PINNED) + ErrorEnvelope
 * của api-client (gRPC reject → 422 {statusCode, message, code, details[]}).
 */
import type { FilterOrdersRequest } from "@hub-store/shared";
import type { AxiosBaseQueryError } from "@hub-store/api-client";

/** ErrorEnvelope shape (baseQuery failure data). */
interface ErrorEnvelopeLike {
  statusCode?: number;
  message?: string;
  details?: Array<{ field?: string; message?: string }> | unknown[];
}

/**
 * buildAddOrderFilterRequest — payload "Thêm đơn" (context pack SF-8):
 * CHỈ đơn CÙNG kho + batchStatus=0 (Chưa soạn) + loại các đơn đã có trong modal.
 */
export function buildAddOrderFilterRequest(
  shopCode: string,
  excludeFulfillCodes: string[],
  searchText?: string,
): FilterOrdersRequest {
  return {
    shopCodes: [shopCode],
    batchStatus: [0],
    excludeFulfillCodes: excludeFulfillCodes,
    fulfillCode: searchText?.trim() ? searchText.trim() : undefined,
    page: 1,
    pageSize: 50,
  };
}

/**
 * extractRejectMessages — map error envelope → mảng message hiển thị (error UX
 * Task 9): lấy details[] ({field, message}) khi có, fallback message envelope.
 */
export function extractRejectMessages(
  error: unknown,
  fallback: string,
): string[] {
  const axiosError = error as AxiosBaseQueryError | undefined;
  if (!axiosError) return [fallback];
  const data = axiosError.data as ErrorEnvelopeLike | string | undefined;
  if (!data || typeof data === "string") return [typeof data === "string" && data ? data : fallback];
  const details = Array.isArray(data.details) ? data.details : [];
  const messages = details
    .map((d) => (typeof d === "object" && d !== null && "message" in d ? String((d as { message?: string }).message ?? "").trim() : ""))
    .filter((m) => m.length > 0);
  if (messages.length > 0) return messages;
  const message = (data.message ?? "").trim();
  return message ? [message] : [fallback];
}
