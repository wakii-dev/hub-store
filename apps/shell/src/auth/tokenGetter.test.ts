// @vitest-environment node
// Node env — oidc-client-ts UserManager được mock; các helper auth thuần
// (mapRole/token mirror/401 interceptor) test được ở node. Redirect/callback
// flow thật là integration với Keycloak — phủ bởi E2E auth.setup (login UI).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAxiosInstance, setTokenGetter } from '@hub-store/api-client';
import {
  getAccessToken,
  installUnauthorizedInterceptor,
  loadCurrentUser,
  mapRole,
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

// Node test env không có VITE_OIDC_* — import.meta.env per-module nên set qua
// process.env (shared cross-module; oidc.readEnv merge với precedence meta).
beforeEach(() => {
  process.env.VITE_OIDC_AUTHORITY = 'https://keycloak.test';
  process.env.VITE_OIDC_CLIENT_ID = 'hubstore-web';
  process.env.VITE_OIDC_REDIRECT_URI = 'http://localhost:3000/callback';
});

afterEach(() => {
  (UserManager as unknown as { __clear: () => void }).__clear();
  setTokenGetter(() => null);
  vi.clearAllMocks();
  delete process.env.VITE_OIDC_AUTHORITY;
  delete process.env.VITE_OIDC_CLIENT_ID;
  delete process.env.VITE_OIDC_REDIRECT_URI;
});

describe('mapRole — realm_access.roles ∩ KNOWN ROLES', () => {
  it('lấy role đầu tiên khớp role matrix', () => {
    expect(mapRole({ realm_access: { roles: ['default-roles-hubstore', 'Manager', 'Coordinator'] } })).toBe('Manager');
    expect(mapRole({ realm_access: { roles: ['Coordinator'] } })).toBe('Coordinator');
    expect(mapRole({ realm_access: { roles: ['default-roles-hubstore'] } })).toBeNull();
    expect(mapRole(null)).toBeNull();
  });
});

describe('registerTokenGetter + getAccessToken (SF-4)', () => {
  it('getter trả access token sau loadCurrentUser, null khi chưa login', async () => {
    registerTokenGetter();
    expect(getAccessToken()).toBeNull();
    setUserManagerUser({ preferred_username: 'coordinator', realm_access: { roles: ['Coordinator'] } });
    const user = await loadCurrentUser();
    expect(user).not.toBeNull();
    expect(getAccessToken()).toBe('kc-access-token');
    expect(sessionFromUser(user!)).toEqual({ sub: 'coordinator', role: 'Coordinator' });
  });
});

describe('installUnauthorizedInterceptor — 401 → signinRedirect', () => {
  it('response 401 kích signinRedirect đúng 1 lần (chống lặp)', async () => {
    installUnauthorizedInterceptor();
    const axios = getAxiosInstance();
    let callCount = 0;
    const id = axios.interceptors.response.use(undefined, (error) => {
      callCount += 1;
      return Promise.reject(error);
    });
    try {
      await axios.request({
        url: 'http://localhost:9999/never',
        adapter: () => Promise.reject({ response: { status: 401 }, config: {} }),
      });
      expect.unreachable('expected rejection');
    } catch {
      // rejected như kỳ vọng
    }
    axios.interceptors.response.eject(id);
    expect(callCount).toBe(1);
    expect(mockSigninRedirect).toHaveBeenCalledTimes(1);
  });

  it('lỗi non-401 KHÔNG kích signinRedirect', async () => {
    installUnauthorizedInterceptor();
    const axios = getAxiosInstance();
    try {
      await axios.request({
        url: 'http://localhost:9999/never',
        adapter: () => Promise.reject({ response: { status: 500 }, config: {} }),
      });
      expect.unreachable('expected rejection');
    } catch {
      // rejected như kỳ vọng
    }
    expect(mockSigninRedirect).not.toHaveBeenCalled();
  });
});
