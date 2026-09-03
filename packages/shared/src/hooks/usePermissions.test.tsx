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

/** Matrix kỳ vọng — transcribe TRỰC TIẾP từ REQUIREMENTS §2 (+ SF-17 areastaff, SF-18 d2c.view, SF-11 audit.view Manager-only, SF-14 settlement.view, SF-21 printers.manage Admin duy nhất). */
const EXPECTED: Record<Role, Record<Permission, boolean>> = {
  Coordinator: { 'orders.view': true, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': false, 'users.manage': false, 'areastaff.view': true, 'areastaff.manage': false, 'd2c.view': false, 'audit.view': false, 'settlement.view': false, 'printers.manage': false },
  WarehouseOps: { 'orders.view': false, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': false, 'users.manage': false, 'areastaff.view': true, 'areastaff.manage': false, 'd2c.view': true, 'audit.view': false, 'settlement.view': false, 'printers.manage': false },
  Manager: { 'orders.view': true, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': true, 'users.manage': true, 'areastaff.view': true, 'areastaff.manage': false, 'd2c.view': true, 'audit.view': true, 'settlement.view': true, 'printers.manage': false },
  Admin: { 'orders.view': true, 'fulfillment.view': true, 'fulfillment.print': true, 'dashboard.view': true, 'users.manage': true, 'areastaff.view': true, 'areastaff.manage': true, 'd2c.view': true, 'audit.view': false, 'settlement.view': true, 'printers.manage': true },
  // SF-18: WarehouseEmployee CHỈ có d2c.view — không D1/D2/Print.
  WarehouseEmployee: { 'orders.view': false, 'fulfillment.view': false, 'fulfillment.print': false, 'dashboard.view': false, 'users.manage': false, 'areastaff.view': false, 'areastaff.manage': false, 'd2c.view': true, 'audit.view': false, 'settlement.view': false, 'printers.manage': false },
};

describe('usePermissions — role matrix §2 (exhaustive)', () => {
  it('matrix const khớp bảng §2 cho đủ 5 roles × 11 permissions (SF-17 + SF-18 + SF-11 + SF-14 + SF-21)', () => {
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

  it('WarehouseEmployee (SF-18) CHỈ có d2c.view — không orders/fulfillment/print', () => {
    setRole('WarehouseEmployee');
    const { result } = renderHook(() => usePermissions());
    expect(result.current.can('d2c.view')).toBe(true);
    expect(result.current.can('orders.view')).toBe(false);
    expect(result.current.can('fulfillment.view')).toBe(false);
    expect(result.current.can('fulfillment.print')).toBe(false);
  });

  it('SF-11: audit.view CHỈ Manager — Coordinator/Admin/WarehouseOps/WarehouseEmployee false', () => {
    for (const role of ROLES) {
      setRole(role);
      const { result } = renderHook(() => usePermissions());
      expect(result.current.can('audit.view'), `audit.view × ${role}`).toBe(role === 'Manager');
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
