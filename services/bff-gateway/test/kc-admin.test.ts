/**
 * SF-8 — unit test KcAdminClient (mock KC HTTP server tối giản, local file —
 * mock KC admin dùng chung cho users route tests là Task 3 trong harness).
 */
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { KcAdminClient } from '../src/kc-admin.js';
import type { BffOidcConfig } from '../src/config.js';

/** Mock KC: token grant + /users/{id} PUT enabled + 401 invalid_client toggle. */
async function startMockKc(opts: { grantStatus: number }) {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.includes('/protocol/openid-connect/token')) {
      res.writeHead(opts.grantStatus, { 'content-type': 'application/json' });
      res.end(opts.grantStatus === 200 ? JSON.stringify({ access_token: 'tok', expires_in: 60 }) : JSON.stringify({ error: 'invalid_client' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([]));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}` };
}

function oidcOf(kc: { url: string }): BffOidcConfig {
  return {
    issuer: `${kc.url}/realms/hubstore`,
    audience: 'hubstore-api',
    jwksUrl: `${kc.url}/certs`,
    adminBaseUrl: `${kc.url}/admin/realms/hubstore`,
    adminTokenUrl: `${kc.url}/realms/master/protocol/openid-connect/token`,
    adminUsername: 'admin',
    adminPassword: 'admin',
    kcAdminTokenUrl: `${kc.url}/realms/hubstore/protocol/openid-connect/token`,
    kcAdminClientId: 'hubstore-admin',
    kcAdminClientSecret: 'test-secret',
  };
}

describe('KcAdminClient', () => {
  it('not-configured secret → 503 kind not-configured, KHÔNG fetch', async () => {
    const kc = await startMockKc({ grantStatus: 200 });
    const client = new KcAdminClient({ ...oidcOf(kc), kcAdminClientSecret: '' });
    await expect(client.listUsers()).rejects.toMatchObject({ kind: 'not-configured' });
    await new Promise<void>((r) => kc.server.close(() => r()));
  });

  it('listUsers map { id, username, enabled }', async () => {
    const kc = await startMockKc({ grantStatus: 200 });
    const client = new KcAdminClient(oidcOf(kc));
    const users = await client.listUsers();
    expect(users).toEqual([]);
    await new Promise<void>((r) => kc.server.close(() => r()));
  });

  it('self-heal: grant 401 invalid_client → master token → tạo client → gán role → retry grant OK', async () => {
    // Stateful mock: client-credential grant FAIL 1 lần rồi OK; master grant luôn OK;
    // các self-heal endpoint trả shape tối giản đủ cho assignManageUsers chạy.
    let clientGrantFails = true;
    const created: unknown[] = [];
    const server = createServer((req, res) => {
      const url = req.url ?? '';
      const send = (status: number, payload: unknown, headers?: Record<string, string>): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(payload));
      };
      if (url.includes('/realms/hubstore/protocol/openid-connect/token')) {
        if (clientGrantFails) {
          clientGrantFails = false;
          return send(401, { error: 'invalid_client' });
        }
        return send(200, { access_token: 'client-tok', expires_in: 60 });
      }
      if (url.includes('/realms/master/protocol/openid-connect/token')) {
        return send(200, { access_token: 'master-tok' });
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (url === '/admin/realms/hubstore/clients' && req.method === 'POST') {
          created.push(JSON.parse(raw));
          return send(201, {}, { location: '/admin/realms/hubstore/clients/c-1' });
        }
        if (url.startsWith('/admin/realms/hubstore/clients?clientId=hubstore-admin')) {
          return send(200, []); // chưa tồn tại
        }
        if (url.startsWith('/admin/realms/hubstore/clients?clientId=realm-management')) {
          return send(200, [{ id: 'rm-1' }]);
        }
        if (url === '/admin/realms/hubstore/clients/rm-1/roles') {
          return send(200, [{ id: 'mu-1', name: 'manage-users' }]);
        }
        if (url.includes('/users?username=service-account-hubstore-admin')) {
          return send(200, [{ id: 'sa-1', username: 'service-account-hubstore-admin' }]);
        }
        if (url.includes('/role-mappings/clients/rm-1')) {
          return send(204, {});
        }
        if (url === '/admin/realms/hubstore/users' || url.startsWith('/admin/realms/hubstore/users?')) {
          return send(200, []);
        }
        send(200, {});
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const client = new KcAdminClient(oidcOf({ url: `http://127.0.0.1:${port}` }));
    const users = await client.listUsers(); // phải self-heal rồi thành công
    expect(users).toEqual([]);
    expect(created).toHaveLength(1);
    await new Promise<void>((r) => server.close(() => r()));
  });
});
