import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_MATRIX,
  ROLES,
  RoleProvider,
  setRole,
  usePermissions,
} from './usePermissions';
import type { Permission, Role } from './usePermissions';

afterEach(() => {
  cleanup();
  setRole(null); // reset module store giữa các test
});

/** Matrix kỳ vọng — transcribe TRỰC TIẾP từ REQUIREMENTS §2 (+ SF-17 areastaff). */
const EXPECTED: Record<Role, Record<Permission, boolean>> = {
  Coordinator: { 'orders.view': true, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': false, 'users.manage': false, 'areastaff.view': true, 'areastaff.manage': false },
  WarehouseOps: { 'orders.view': false, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': false, 'users.manage': false, 'areastaff.view': true, 'areastaff.manage': false },
  Manager: { 'orders.view': true, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': true, 'users.manage': true, 'areastaff.view': true, 'areastaff.manage': false },
  Admin: { 'orders.view': true, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': true, 'users.manage': true, 'areastaff.view': true, 'areastaff.manage': true },
};

describe('usePermissions — role matrix §2 (exhaustive)', () => {
  it('matrix const khớp bảng §2 cho đủ roles × permissions (gồm SF-17 areastaff)', () => {
    for (const role of ROLES) {
      expect([...PERMISSION_MATRIX[role]].sort()).toEqual(
        PERMISSIONS.filter((p) => EXPECTED[role][p]).sort(),
      );
    }
  });

  it('can() đúng cho từng role qua module store (setRole)', () => {
    for (const role of ROLES) {
      setRole(role);
      const { result } = renderHook(() => usePermissions());
      expect(result.current.role).toBe(role);
      for (const permission of PERMISSIONS) {
        expect(result.current.can(permission), `${role} × ${permission}`).toBe(
          EXPECTED[role][permission],
        );
      }
    }
  });

  it('deny-by-default: chưa set role → can() false mọi permission', () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.role).toBeNull();
    for (const permission of PERMISSIONS) {
      expect(result.current.can(permission)).toBe(false);
    }
  });

  it('RoleProvider context wins over module store; WarehouseOps KHÔNG có orders.view (D1)', () => {
    setRole('Manager');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RoleProvider role="WarehouseOps">{children}</RoleProvider>
    );
    const { result } = renderHook(() => usePermissions(), { wrapper });
    expect(result.current.role).toBe('WarehouseOps');
    expect(result.current.can('orders.view')).toBe(false); // §2: NO D1
    expect(result.current.can('fulfillment.view')).toBe(true);
  });

  it('setRole(null) notify listeners → hook re-render về null', () => {
    setRole('Coordinator');
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('orders.view')).toBe(true);
    act(() => setRole(null)); // act: flush useSyncExternalStore re-render
    expect(result.current.can('orders.view')).toBe(false);
  });
});
