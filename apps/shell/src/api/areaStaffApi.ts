/**
 * areaStaffApi — fetch wrapper gọi BFF REST /service-employees/* (SF-17).
 * Dùng axios SINGLETON của @hub-store/api-client: baseURL VITE_API_BASE_URL +
 * Authorization Bearer tự gắn qua token-getter shell đã register (main.tsx).
 * Shell-local pages KHÔNG có RTKQ store riêng → wrapper promise thuần.
 */
import { getAxiosInstance } from '@hub-store/api-client';
import type { RegionDto, RegionsResponse } from '@hub-store/shared';

export interface ServiceEmployeeDto {
  employeeCode: string;
  fullName: string;
  titleCode: string;
  paymentAccount: string;
  isActive: boolean;
  regionCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceEmployeesResponse {
  items: ServiceEmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VerifyPaymentAccountDto {
  valid: boolean;
  source: string;
  message: string;
}

export interface ServiceEmployeePayload {
  employeeCode: string;
  fullName: string;
  titleCode: string;
  paymentAccount: string;
  isActive: boolean;
  regionCodes: string[];
}

export const TITLE_CODES = ['SHIPPER', 'WAREHOUSE', 'CSKH', 'KTV'] as const;
export type TitleCode = (typeof TITLE_CODES)[number];

export interface ListFilters {
  titleCode?: string;
  query?: string;
  regionCode?: string;
}

const http = () => getAxiosInstance();

export const areaStaffApi = {
  list(filters: ListFilters = {}): Promise<ServiceEmployeesResponse> {
    return http()
      .get('/service-employees', { params: filters })
      .then((r) => r.data);
  },
  get(code: string): Promise<ServiceEmployeeDto> {
    return http()
      .get(`/service-employees/${encodeURIComponent(code)}`)
      .then((r) => r.data);
  },
  create(payload: ServiceEmployeePayload): Promise<ServiceEmployeeDto> {
    return http().post('/service-employees', payload).then((r) => r.data);
  },
  update(code: string, payload: ServiceEmployeePayload): Promise<ServiceEmployeeDto> {
    return http().put(`/service-employees/${encodeURIComponent(code)}`, payload).then((r) => r.data);
  },
  setActive(code: string, active: boolean): Promise<ServiceEmployeeDto> {
    return http()
      .put(`/service-employees/${encodeURIComponent(code)}/active`, { active })
      .then((r) => r.data);
  },
  verifyPaymentAccount(paymentAccount: string): Promise<VerifyPaymentAccountDto> {
    return http()
      .post('/service-employees/payment-account/verify', { paymentAccount })
      .then((r) => r.data);
  },
  regions(): Promise<RegionDto[]> {
    return http()
      .get<RegionsResponse>('/master-data/regions')
      .then((r) => r.data.items ?? []);
  },
};

/**
 * Resolve wards cho expand row: tỉnh được chọn → liệt kê wards con; ward được
 * chọn → chính nó. Nếu cả tỉnh + ward con cùng được chọn, tỉnh thắng (mở rộng
 * đã phủ). Group theo tỉnh (thứ tự theo regionCodes của employee).
 */
export function resolveWardsByProvince(
  regionCodes: string[],
  regions: RegionDto[],
): Array<{ province: RegionDto | undefined; wards: RegionDto[] }> {
  const byCode = new Map(regions.map((r) => [r.code, r]));
  const selected = new Set(regionCodes);
  const provinces = new Map<string, Set<string>>(); // provinceCode → ward codes
  for (const code of regionCodes) {
    const r = byCode.get(code);
    if (!r) continue;
    if (r.type === 'province') {
      if (!provinces.has(r.code)) provinces.set(r.code, new Set());
    } else {
      const parent = r.parentCode ?? '';
      if (!provinces.has(parent)) provinces.set(parent, new Set());
      provinces.get(parent)!.add(r.code);
    }
  }
  const result: Array<{ province: RegionDto | undefined; wards: RegionDto[] }> = [];
  for (const [provinceCode, wardCodes] of provinces) {
    const province = byCode.get(provinceCode);
    if (province && selected.has(provinceCode)) {
      // Chọn node tỉnh → toàn bộ wards con (đã chọn ward lẻ cùng tỉnh thì gộp).
      result.push({ province, wards: regions.filter((r) => r.parentCode === provinceCode) });
    } else {
      result.push({
        province,
        wards: [...wardCodes].map((c) => byCode.get(c)).filter((r): r is RegionDto => !!r),
      });
    }
  }
  return result;
}
