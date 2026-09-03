/**
 * D2C filter state ↔ POST /d2c-orders/filter body (SF-18, spec §3.2/3.4).
 *
 * URL state FLAT qua useUrlState (array = comma-joined — cùng serialization
 * D1). Range datetime convert ISO-8601 qua utils/datetime (BFF `new Date(v)`
 * parse được ISO string — routes/d2c.ts mapFilterBody).
 *
 * ⚠ Options carrier/shop/category/type: BE chưa có master-data endpoint cho
 * D2C → option list mirror giá trị seed (api/seed/d2c-sample.json) tại FE.
 * Follow-up: BFF distinct endpoint rồi bỏ constants này.
 */
import { toIsoDatetime } from './datetime';

/** Status enum 4 giá trị — spec §3.1 (thiết kế mới, seed + E2E dùng đúng enum). */
export const D2C_STATUSES = ['pending', 'pushed', 'exported', 'cancelled'] as const;
export type D2cStatus = (typeof D2C_STATUSES)[number];

export const D2C_CARRIER_OPTIONS = ['GHN', 'GHTK', 'ViettelPost'];
export const D2C_SHOP_OPTIONS = [
  'Shop Mỹ Phẩm Beauty',
  'Shop Nhà Cửa Xanh',
  'Shop Thời Trang ABC',
  'Shop Điện Máy Value',
];
export const D2C_CATEGORY_OPTIONS = ['Gia dụng', 'Mỹ phẩm', 'Thời trang', 'Điện tử'];
export const D2C_TYPE_OPTIONS = [
  'Áo khoác jean',
  'Áo thun nam',
  'Bộ chén đĩa',
  'Kem chống nắng',
  'Loa bluetooth',
  'Máy lọc không khí',
  'Nồi chiên không dầu',
  'Quần jean nữ',
  'Serum dưỡng da',
  'Son môi',
  'Váy nữ',
  'Ổ cắm thông minh',
];

export interface D2cFilterUrlStateShape {
  [key: string]: string | string[];
  search: string;
  statuses: string[];
  carriers: string[];
  shops: string[];
  productCategory: string;
  productType: string;
  createdFrom: string;
  createdTo: string;
  pushFrom: string;
  pushTo: string;
  slotFrom: string;
  slotTo: string;
  page: string;
  pageSize: string;
}

export const D2C_FILTER_URL_DEFAULTS: D2cFilterUrlStateShape = {
  search: '',
  statuses: [],
  carriers: [],
  shops: [],
  productCategory: '',
  productType: '',
  createdFrom: '',
  createdTo: '',
  pushFrom: '',
  pushTo: '',
  slotFrom: '',
  slotTo: '',
  page: '1',
  pageSize: '10',
};

/** Request body POST /d2c-orders/filter — field rỗng → omit. */
export function buildD2cFilterRequest(state: D2cFilterUrlStateShape): Record<string, unknown> {
  const iso = (v: string | undefined): string | undefined => toIsoDatetime(v);
  const createdFrom = iso(state.createdFrom);
  const createdTo = iso(state.createdTo);
  const pushFrom = iso(state.pushFrom);
  const pushTo = iso(state.pushTo);

  return {
    search: state.search.trim() || undefined,
    statuses: state.statuses.length > 0 ? state.statuses : undefined,
    carriers: state.carriers.length > 0 ? state.carriers : undefined,
    shops: state.shops.length > 0 ? state.shops : undefined,
    productCategory: state.productCategory || undefined,
    productType: state.productType || undefined,
    createdFrom,
    createdTo,
    pushFrom,
    pushTo,
    pushSlotFrom: state.slotFrom || undefined,
    pushSlotTo: state.slotTo || undefined,
    page: Math.max(1, Number(state.page) || 1),
    pageSize: Math.max(1, Number(state.pageSize) || 10),
  };
}

/** Export guard client-side — CÙNG công thức BFF (routes/d2c.ts exportRangeDays). */
export function d2cExportRangeDays(from: string, to: string): number {
  const f = new Date(`${from}T00:00:00+07:00`);
  const t = new Date(`${to}T00:00:00+07:00`);
  return Math.round((t.getTime() - f.getTime()) / 86400000);
}

/** from/to hợp lệ: đủ YYYY-MM-DD + from ≤ to + ≤ 31 ngày. */
export function isValidD2cExportRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  if (from > to) return false;
  return d2cExportRangeDays(from, to) <= 31;
}
