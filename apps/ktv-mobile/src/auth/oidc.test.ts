// @vitest-environment node
// Node env — UserManager được mock; các helper auth thuần (config defaults,
// role map, session, token mirror) test được ở node. Redirect/callback flow
// thật là integration với Keycloak — phủ bởi E2E (T8, spec §4.5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTokenGetter } from '@hub-store/api-client';
import {
  getAccessToken,
  getTechnicianRole,
  loadCurrentUser,
  mapTechnicianRole,
  MOBILE_CLIENT_ID_DEFAULT,
  oidcConfig,
  registerTokenGetter,
  sessionFromUser,
} from './oidc';

const { mockSigninRedirect } = vi.hoisted(() => ({ mockSigninRedirect: vi.fn() }));

vi.mock('oidc-client-ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('oidc-client-ts')>();
  const users = new Map<string, unknown>();
  class FakeUserManager {
    events = {
      addUserLoaded(_cb: (u: unknown) => void) {},
      addUserUnloaded(_cb: () => void) {},
    };
    async getUser() {
      return users.get('current') ?? null;
    }
    async signinRedirect() {
      mockSigninRedirect();
    }
    static __setUser(profile: unknown) {
      users.set('current', { profile, access_token: 'kc-access-token' });
    }
    static __clear() {
      users.clear();
    }
  }
  return {
    ...actual,
    UserManager: FakeUserManager,
    // node realm không có localStorage — stub vô hại (FakeUserManager không dùng).
    WebStorageStateStore: class {},
  };
});

import { UserManager } from 'oidc-client-ts';

function setUserManagerUser(profile: unknown) {
  (UserManager as unknown as { __setUser: (p: unknown) => void }).__setUser(profile);
}

beforeEach(() => {
  delete process.env.VITE_OIDC_AUTHORITY;
  delete process.env.VITE_OIDC_CLIENT_ID;
  delete process.env.VITE_OIDC_REDIRECT_URI;
});

afterEach(() => {
  (UserManager as unknown as { __clear: () => void }).__clear();
  setTokenGetter(() => null);
  vi.clearAllMocks();
});

describe('oidcConfig — defaults hubstore-mobile (T3 contract)', () => {
  it('env trống → clientId hubstore-mobile + authority derive /realms/hubstore :8081', () => {
    const cfg = oidcConfig();
    expect(cfg.clientId).toBe(MOBILE_CLIENT_ID_DEFAULT);
    expect(cfg.clientId).toBe('hubstore-mobile');
    expect(cfg.authority).toBe('http://localhost:8081/realms/hubstore');
    // node realm (không window) → origin fallback :3010 (port app).
    expect(cfg.redirectUri).toBe('http://localhost:3010/callback');
  });

  it('env set → override nguyên văn; authority đã có realm path không bị nối đôi', () => {
    process.env.VITE_OIDC_AUTHORITY = 'http://127.0.0.1:8082/realms/hubstore';
    process.env.VITE_OIDC_CLIENT_ID = 'other-client';
    process.env.VITE_OIDC_REDIRECT_URI = 'http://127.0.0.1:4220/callback';
    const cfg = oidcConfig();
    expect(cfg.authority).toBe('http://127.0.0.1:8082/realms/hubstore');
    expect(cfg.clientId).toBe('other-client');
    expect(cfg.redirectUri).toBe('http://127.0.0.1:4220/callback');
  });

  it('authority base chưa có realm path → tự nối /realms/hubstore', () => {
    process.env.VITE_OIDC_AUTHORITY = 'http://127.0.0.1:8082';
    expect(oidcConfig().authority).toBe('http://127.0.0.1:8082/realms/hubstore');
  });
});

describe('mapTechnicianRole — realm_access.roles ∩ technician roles', () => {
  it('lấy role technician đầu tiên; role khác → null', () => {
    expect(
      mapTechnicianRole({ realm_access: { roles: ['default-roles-hubstore', 'InsideTechnician'] } }),
    ).toBe('InsideTechnician');
    expect(mapTechnicianRole({ realm_access: { roles: ['OutsideTechnician'] } })).toBe(
      'OutsideTechnician',
    );
    // Role desktop (Manager/Coordinator) KHÔNG mở mobile — role gate 403.
    expect(
      mapTechnicianRole({ realm_access: { roles: ['default-roles-hubstore', 'Manager'] } }),
    ).toBeNull();
    expect(mapTechnicianRole(null)).toBeNull();
  });
});

describe('sessionFromUser + getTechnicianRole mirror', () => {
  it('session gồm sub (preferred_username), role, name; token getter trả token sau load', async () => {
    registerTokenGetter();
    expect(getAccessToken()).toBeNull();
    expect(getTechnicianRole()).toBeNull();
    setUserManagerUser({
      preferred_username: 'KTV-001',
      name: 'Nguyễn Văn An',
      realm_access: { roles: ['InsideTechnician'] },
    });
    const user = await loadCurrentUser();
    expect(user).not.toBeNull();
    expect(sessionFromUser(user!)).toEqual({
      sub: 'KTV-001',
      role: 'InsideTechnician',
      name: 'Nguyễn Văn An',
    });
    expect(getAccessToken()).toBe('kc-access-token');
    expect(getTechnicianRole()).toBe('InsideTechnician');
  });

  it('user không role technician → sessionFromUser null (route gate 403)', async () => {
    setUserManagerUser({
      preferred_username: 'manager',
      realm_access: { roles: ['Manager'] },
    });
    const user = await loadCurrentUser();
    expect(sessionFromUser(user!)).toBeNull();
    expect(getTechnicianRole()).toBeNull();
  });
});
