/**
 * usePermissions — role matrix REQUIREMENTS §2 (authoritative).
 *
 * Roles production (SSO claim): Coordinator / WarehouseOps / Manager /
 * WarehouseEmployee.
 * Permission keys ↔ screens (mapping D-screens):
 *   - 'orders.view'       → D1 Danh sách đơn hàng (/hub-store-order/order)
 *   - 'fulfillment.view'  → D2 Danh sách phiếu soạn (/hub-store-order/batch)
 *   - 'fulfillment.print' → D3 Print Shipment (/hub-store-order/batch/print)
 *   - 'd2c.view'          → D2C/Dropship (/hub-store-order/d2c) — SF-18
 *
 * Role source: module-level store (setRole) HOẶC RoleProvider (context
 * — context wins nếu có). SF-6 role switcher drive bằng 1 trong 2 cách.
 * Default role = null → can() false cho mọi permission (deny-by-default).
 */
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export const ROLES = ['Coordinator', 'WarehouseOps', 'Manager', 'WarehouseEmployee'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'orders.view',
  'fulfillment.view',
  'fulfillment.print',
  'd2c.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * §2: Coordinator → D1+D2+Print; WarehouseOps → D2+Print (KHÔNG D1);
 * Manager → all; WarehouseEmployee → chỉ d2c.view (SF-18 — KHÔNG D1/D2/Print).
 */
export const PERMISSION_MATRIX = {
  Coordinator: ['orders.view', 'fulfillment.view', 'fulfillment.print'],
  WarehouseOps: ['fulfillment.view', 'fulfillment.print', 'd2c.view'],
  Manager: ['orders.view', 'fulfillment.view', 'fulfillment.print', 'd2c.view'],
  WarehouseEmployee: ['d2c.view'],
} as const satisfies Record<Role, readonly Permission[]>;

// --- module-level role store (lite, không cần Redux) ---
let moduleRole: Role | null = null;
const listeners = new Set<() => void>();

export function setRole(role: Role | null): void {
  moduleRole = role;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

function getModuleRole(): Role | null {
  return moduleRole;
}

// --- optional context (lite provider — SF-6 có thể control từ trên) ---
const RoleContext = createContext<Role | null>(null);

export function RoleProvider(props: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={props.role}>{props.children}</RoleContext.Provider>;
}

export interface Permissions {
  /** Role hiện effective (context ?? module). null = chưa set. */
  role: Role | null;
  can: (permission: Permission) => boolean;
}

export function usePermissions(): Permissions {
  const contextRole = useContext(RoleContext);
  const storeRole = useSyncExternalStore(subscribe, getModuleRole);
  const role = contextRole ?? storeRole;
  return useMemo<Permissions>(
    () => ({
      role,
      can: (permission: Permission) =>
        role !== null && (PERMISSION_MATRIX[role] as readonly Permission[]).includes(permission),
    }),
    [role],
  );
}
