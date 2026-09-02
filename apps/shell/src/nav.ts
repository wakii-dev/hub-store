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
  { path: '/hub-store-order/order', labelKey: 'nav.orders', permission: 'orders.view' },
  { path: '/hub-store-order/batch', labelKey: 'nav.batch', permission: 'fulfillment.view' },
  { path: '/hub-store-order/batch/print', labelKey: 'nav.print', permission: 'fulfillment.print' },
  { path: '/users', labelKey: 'nav.users', permission: 'users.manage' }, // SF-8 — append CUỐI (NAV_ROUTES[2] là fallback hardcode)
];

/** Path đầu tiên mà role này được phép xem (dùng sau login). */
export function firstPathForRole(role: Role): string {
  const perms = PERMISSION_MATRIX[role] as readonly Permission[];
  const first = NAV_ROUTES.find((item) => perms.includes(item.permission));
  // Mọi role đều có fulfillment.print → không bao giờ rơi vào đây.
  return first?.path ?? NAV_ROUTES[2].path;
}

/** Path đầu tiên mà predicate can() cho qua (dùng khi role switch). */
export function firstPermittedPath(can: (p: Permission) => boolean): string {
  const first = NAV_ROUTES.find((item) => can(item.permission));
  return first?.path ?? NAV_ROUTES[2].path;
}
