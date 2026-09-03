/**
 * settlementApi — fetch wrapper gọi BFF REST /cod/* (SF-14).
 * Dùng axios SINGLETON của @hub-store/api-client: baseURL VITE_API_BASE_URL +
 * Authorization Bearer tự gắn qua token-getter shell đã register (main.tsx).
 * Shell-local page KHÔNG có RTKQ store riêng → wrapper promise thuần
 * (pattern areaStaffApi.ts; settlement KHÔNG đưa vào RTKQ — plan T4 P2).
 */
import { getAxiosInstance } from '@hub-store/api-client';
import type {
  CodPendingDto,
  ConfirmCodBody,
  ConfirmCodResultDto,
  Paginated,
  SettlementDetailItem,
  SettlementDetailQuery,
  SettlementQuery,
  SettlementShopRow,
} from '@hub-store/shared';

const http = () => getAxiosInstance();

/**
 * Fetch-all pageSize (review P1-1): BFF paginate default 20 — FE lúc đầu bỏ qua
 * envelope.total nên shop thứ 21+ biến mất và KPI undercount. Màn đối soát là
 * báo cáo tổng hợp (số shop/đơn của 1 kỳ luôn ≤ vài trăm) → giải pháp đúng đơn
 * giản nhất là xin 1 page lớn thay vì dựng pagination UI; envelope vẫn Paginated
 * nên nếu sau này cần paging thật, callers chỉ đổi chỗ này.
 */
export const SETTLEMENT_FETCH_PAGE_SIZE = 500;

export const settlementApi = {
  /** GET /cod/settlement?from=&to=&page=&pageSize= — aggregate theo shop. */
  list(query: SettlementQuery): Promise<Paginated<SettlementShopRow>> {
    return http()
      .get('/cod/settlement', {
        params: { ...query, pageSize: SETTLEMENT_FETCH_PAGE_SIZE },
      })
      .then((r) => r.data);
  },

  /** GET /cod/settlement/detail?shopCode=&from=&to= — drill-down confirmations. */
  detail(query: SettlementDetailQuery): Promise<Paginated<SettlementDetailItem>> {
    return http()
      .get('/cod/settlement/detail', {
        params: { ...query, pageSize: SETTLEMENT_FETCH_PAGE_SIZE },
      })
      .then((r) => r.data);
  },

  /** POST /cod/confirm — collectedAmount optional (absence = lấy expected). */
  confirm(body: ConfirmCodBody): Promise<{ results: ConfirmCodResultDto[] }> {
    return http().post('/cod/confirm', body).then((r) => r.data);
  },

  /** GET /cod/pending?batchCode= — badge D2 (dùng chung từ shell nếu cần). */
  pending(batchCode: string): Promise<CodPendingDto> {
    return http()
      .get('/cod/pending', { params: { batchCode } })
      .then((r) => r.data);
  },

  /**
   * URL export CSV của kỳ (endpoint /cod/settlement.csv thuộc Task 5 — để sẵn).
   * Dùng baseURL của axios singleton để khớp môi trường; window.open tự mang
   * cookie/session của origin (endpoint Task 5 quyết định auth surface).
   */
  exportUrl(from: string, to: string): string {
    const base = http().defaults.baseURL ?? '';
    const qs = new URLSearchParams({ from, to }).toString();
    return `${base}/cod/settlement.csv?${qs}`;
  },
};
