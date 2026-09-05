/**
 * SF-8 — contract tests users routes (Manager-only) qua harness thật:
 * JWT guard global + mock KC admin server + mock gRPC upstreams.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

describe('users routes (SF-8, Manager-only)', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await startHarness();
    harness.kc.setRoleIds({ Coordinator: 'r-co', WarehouseOps: 'r-wh', Manager: 'r-mg' });
    harness.kc.setUsers([
      { id: 'u-1', username: 'coordinator', enabled: true },
      { id: 'u-2', username: 'warehouse', enabled: true },
      { id: 'u-3', username: 'manager', enabled: true },
    ]);
    harness.kc.setRoleUsers('Coordinator', ['coordinator']);
    harness.kc.setRoleUsers('WarehouseOps', ['warehouse']);
    harness.kc.setRoleUsers('Manager', ['manager']);
  });
  afterAll(async () => { await harness.closeAll(); });

  it('Coordinator → GET /users 403 PERMISSION_DENIED', async () => {
    const res = await harness.app.inject({ method: 'GET', url: '/users', headers: { authorization: `Bearer ${await harness.identity.signToken('Coordinator')}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' });
  });

  it('WarehouseOps → GET /users 403', async () => {
    const res = await harness.app.inject({ method: 'GET', url: '/users', headers: { authorization: `Bearer ${await harness.identity.signToken('WarehouseOps')}` } });
    expect(res.statusCode).toBe(403);
  });

  it('Manager → GET /users list kèm roles join', async () => {
    const res = await harness.app.inject({ method: 'GET', url: '/users', headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ username: string; roles: string[] }>; total: number; page: number; pageSize: number };
    expect(body.total).toBe(3);
    expect(body.items.find((u) => u.username === 'coordinator')?.roles).toEqual(['Coordinator']);
    expect(body.items.find((u) => u.username === 'warehouse')?.roles).toEqual(['WarehouseOps']);
  });

  it('Manager → POST /users tạo + gán role; username ngắn → 422 details', async () => {
    const ok = await harness.app.inject({ method: 'POST', url: '/users', payload: { username: 'newuser', password: 'Password123!', role: 'WarehouseOps' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ username: 'newuser', roles: ['WarehouseOps'] });
    const bad = await harness.app.inject({ method: 'POST', url: '/users', payload: { username: 'x', password: '123', role: 'Nope' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().details).toHaveLength(3);
  });

  it('Manager → POST /users/:id/set-password + PUT enabled (self-lock 422)', async () => {
    const pw = await harness.app.inject({ method: 'POST', url: '/users/u-1/set-password', payload: { password: 'NewPassword1!' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(pw.statusCode).toBe(200);
    const lock = await harness.app.inject({ method: 'PUT', url: '/users/u-3/enabled', payload: { enabled: false }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager', 'manager')}` } });
    expect(lock.statusCode).toBe(422);
    expect(lock.json().code).toBe('SELF_LOCK_DENIED');
    const disable = await harness.app.inject({ method: 'PUT', url: '/users/u-1/enabled', payload: { enabled: false }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(disable.statusCode).toBe(200);
    const missing = await harness.app.inject({ method: 'PUT', url: '/users/u-404/enabled', payload: { enabled: false }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(missing.statusCode).toBe(404);
  });

  it('Manager → POST /users idempotent: 409 + user tồn tại → heal (set-password + gán role) 201', async () => {
    harness.kc.setCreateStatus(409); // simulate partial-create: user đã tồn tại, role chưa gán
    harness.kc.setUsers([
      { id: 'u-1', username: 'coordinator', enabled: true },
      { id: 'u-2', username: 'warehouse', enabled: true },
      { id: 'u-3', username: 'manager', enabled: true },
      { id: 'ghost-uid', username: 'ghost', enabled: true }, // "tồn tại" từ lần tạo đứt
    ]);
    try {
      const res = await harness.app.inject({ method: 'POST', url: '/users', payload: { username: 'ghost', password: 'Healed123!', role: 'Manager' }, headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ username: 'ghost', roles: ['Manager'] });
      // heal gọi reset-password + role-mappings cho user cũ
      const reset = harness.kc.requests.find((r) => r.url.includes('/users/ghost-uid/reset-password'));
      expect(reset).toBeDefined();
    } finally {
      harness.kc.setCreateStatus(201);
    }
  });

  it('Manager → DELETE /users/:id xóa user; self-delete 422; 404 user lạ; Coordinator 403 (SF-7 FI-287)', async () => {
    harness.kc.setUsers([
      { id: 'u-1', username: 'coordinator', enabled: true },
      { id: 'u-3', username: 'manager', enabled: true },
      { id: 'gone-uid', username: 'e2e-user-stale', enabled: false },
    ]);
    const denied = await harness.app.inject({ method: 'DELETE', url: '/users/gone-uid', headers: { authorization: `Bearer ${await harness.identity.signToken('Coordinator')}` } });
    expect(denied.statusCode).toBe(403);

    const self = await harness.app.inject({ method: 'DELETE', url: '/users/u-3', headers: { authorization: `Bearer ${await harness.identity.signToken('Manager', 'manager')}` } });
    expect(self.statusCode).toBe(422);
    expect(self.json().code).toBe('SELF_DELETE_DENIED');

    const ok = await harness.app.inject({ method: 'DELETE', url: '/users/gone-uid', headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(ok.statusCode).toBe(200);
    expect(harness.kc.requests.some((r) => r.method === 'DELETE' && r.url.includes('/users/gone-uid'))).toBe(true);

    // idempotent: user đã biến mất khỏi KC → 404 route-level
    harness.kc.setUsers([
      { id: 'u-1', username: 'coordinator', enabled: true },
      { id: 'u-3', username: 'manager', enabled: true },
    ]);
    const missing = await harness.app.inject({ method: 'DELETE', url: '/users/gone-uid', headers: { authorization: `Bearer ${await harness.identity.signToken('Manager')}` } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('NOT_FOUND');
  });
});
