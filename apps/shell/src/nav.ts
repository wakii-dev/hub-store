/**
 * Nav routes — nguồn duy nhất cho route↔permission (role matrix §2) và
 * landing path theo quyền. Dùng chung bởi AppLayout (nav filter) + LoginPage
 * (navigate sau login) — KHÔNG hard-code route ở từng chỗ.
 */
import { PERMISSION_MATRIX, type Permission, type Role } from '@hub-store/shared';

export interface NavRoute {
  path: string;
  /** i18n key trong namespace `shell` (nav.*) */
  labelKey: string;
  permission: Permission;
}

export const NAV_ROUTES: NavRoute[] = [
  { path: '/hub-store-order/dashboard', labelKey: 'nav.dashboard', permission: 'dashboard.view' },
  { path: '/hub-store-order/order', labelKey: 'nav.orders', permission: 'orders.view' },
  { path: '/hub-store-order/batch', labelKey: 'nav.batch', permission: 'fulfillment.view' },
  { path: '/hub-store-order/batch/print', labelKey: 'nav.print', permission: 'fulfillment.print' },
  { path: '/hub-store-order/tech', labelKey: 'nav.tech', permission: 'orders.view' },
  { path: '/users', labelKey: 'nav.users', permission: 'users.manage' }, // SF-8 — append CUỐI (NAV_ROUTES[2] là fallback hardcode)
  { path: '/area-staff', labelKey: 'nav.areaStaff', permission: 'areastaff.view' },
  // SF-18 — đặt CUỐI mảng: firstPathForRole lấy entry ĐẦU TIÊN role được phép,
  // d2c cuối để không đổi landing path của Coordinator/Manager/WarehouseOps.
  { path: '/hub-store-order/d2c', labelKey: 'nav.d2c', permission: 'd2c.view' },
  // SF-14 — đối soát COD (Manager + Admin) — append CUỐI: landing path mọi role
  // giữ nguyên (Manager/Admin vẫn rơi vào dashboard.view đầu bảng).
  { path: '/settlement', labelKey: 'nav.settlement', permission: 'settlement.view' },
  // SF-21 — quản lý máy in (Admin duy nhất) — append CUỐI để không đổi landing.
  { path: '/printers', labelKey: 'nav.printers', permission: 'printers.manage' },
];

// Fallback theo permission (KHÔNG hard-code index — mảng có thể thêm entry đầu).
const FALLBACK_ROUTE = NAV_ROUTES.find((item) => item.permission === 'fulfillment.print') ?? NAV_ROUTES[0];

/** Path đầu tiên mà role này được phép xem (dùng sau login). */
export function firstPathForRole(role: Role): string {
  const perms = PERMISSION_MATRIX[role] as readonly Permission[];
  const first = NAV_ROUTES.find((item) => perms.includes(item.permission));
  // WarehouseEmployee → /hub-store-order/d2c; còn lại đều có fulfillment.print
  // → không bao giờ rơi vào FALLBACK.
  return first?.path ?? FALLBACK_ROUTE.path;
}

/** Path đầu tiên mà predicate can() cho qua (dùng khi role switch). */
export function firstPermittedPath(can: (p: Permission) => boolean): string {
  const first = NAV_ROUTES.find((item) => can(item.permission));
  return first?.path ?? FALLBACK_ROUTE.path;
}
