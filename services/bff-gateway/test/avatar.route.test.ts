/**
 * SF-21 (FI-266) — avatar route tests: validate magic bytes + allowlist +
 * 5MB cap server-side (spec D3), upsert qua pg Pool giả (pattern __set…ForTests
 * của audit), serve nosniff + Cache-Control private, 404 envelope khi chưa có.
 * Harness pattern d2c.route.test.ts (app thật + fastify.inject).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import {
  AVATAR_MAX_BYTES,
  detectAvatarType,
  __setAvatarPoolForTests,
} from '../src/routes/avatar.js';
import { signTestToken, startHarness, type Harness } from './harness.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
  __setAvatarPoolForTests(null);
});

afterEach(async () => {
  __setAvatarPoolForTests(null);
  await h.closeAll();
});

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Multipart body dựng tay — 1 field `file` + boundary. */
function multipartFile(buf: Buffer, mimetype: string): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----sf21avatartest';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.jpg"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    payload: Buffer.concat([head, buf, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function injectRaw(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  opts: { payload?: Buffer; headers?: Record<string, string>; role?: string; sub?: string } = {},
) {
  const token = await signTestToken(opts.role ?? 'Manager', opts.sub ?? 'tester');
  return app.inject({
    method,
    url,
    ...(opts.payload !== undefined ? { payload: opts.payload } : {}),
    headers: { authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
}

interface FakePoolOpts {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
}
function fakePool(recorder: { sqls: string[]; params: unknown[][] }, opts: FakePoolOpts = {}): Pool {
  return {
    query: async (sql: unknown, params?: unknown[]) => {
      recorder.sqls.push(String(sql));
      recorder.params.push(params ?? []);
      return { rows: opts.rows ?? [], rowCount: opts.rowCount ?? 0 };
    },
  } as unknown as Pool;
}

describe('detectAvatarType (pure magic-byte check)', () => {
  it('JPEG FF D8 FF → image/jpeg; PNG 89 50 4E 47 → image/png', () => {
    expect(detectAvatarType(JPEG_HEAD)).toBe('image/jpeg');
    expect(detectAvatarType(PNG_HEAD)).toBe('image/png');
  });
  it('GIF / text / rỗng / quá ngắn → null', () => {
    expect(detectAvatarType(Buffer.from('GIF89a', 'utf8'))).toBeNull();
    expect(detectAvatarType(Buffer.from('<script>', 'utf8'))).toBeNull();
    expect(detectAvatarType(Buffer.alloc(0))).toBeNull();
    expect(detectAvatarType(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe('POST /avatar', () => {
  it('JPEG hợp lệ → 200 + upsert đúng userId từ token + content-type sniffed', async () => {
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(
      fakePool(rec, { rows: [{ updated_at: new Date('2026-09-03T00:00:00Z') }] }),
    );
    const buf = Buffer.concat([JPEG_HEAD, Buffer.alloc(16, 0x11)]);
    const mp = multipartFile(buf, 'image/jpeg');
    const res = await injectRaw(h.app, 'POST', '/avatar', mp);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { updatedAt: string };
    expect(body.updatedAt).toBe('2026-09-03T00:00:00.000Z');
    expect(rec.sqls[0]).toContain('INSERT INTO user_avatars');
    expect(rec.sqls[0]).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(rec.params[0][0]).toBe('tester');
    expect(rec.params[0][1]).toBe('image/jpeg');
    expect(rec.params[0][2]).toEqual(buf);
  });

  it('PNG hợp lệ → sniffed image/png (không tin mimetype client sai)', async () => {
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(fakePool(rec, { rows: [{ updated_at: new Date() }] }));
    const mp = multipartFile(PNG_HEAD, 'image/png');
    const res = await injectRaw(h.app, 'POST', '/avatar', mp);
    expect(res.statusCode).toBe(200);
    expect(rec.params[0][1]).toBe('image/png');
  });

  it('mimetype jpeg nhưng byte không phải JPEG → 400 (magic bytes bắt buộc)', async () => {
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(fakePool(rec));
    const mp = multipartFile(Buffer.from('<svg onload=alert(1)>', 'utf8'), 'image/jpeg');
    const res = await injectRaw(h.app, 'POST', '/avatar', mp);
    expect(res.statusCode).toBe(400);
    expect(rec.sqls).toHaveLength(0);
    const body = JSON.parse(res.payload) as { code: string };
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('mimetype không trong allowlist (gif) → 400 dù magic bytes khác', async () => {
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(fakePool(rec));
    const mp = multipartFile(JPEG_HEAD, 'image/gif');
    const res = await injectRaw(h.app, 'POST', '/avatar', mp);
    expect(res.statusCode).toBe(400);
  });

  it('>5MB → 400 TRƯỚC khi ghi DB', async () => {
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(fakePool(rec));
    const big = Buffer.concat([JPEG_HEAD, Buffer.alloc(AVATAR_MAX_BYTES, 0)]);
    const mp = multipartFile(big, 'image/jpeg');
    const res = await injectRaw(h.app, 'POST', '/avatar', mp);
    expect(res.statusCode).toBe(400);
    expect(rec.sqls).toHaveLength(0);
  });

  it('thiếu file field → 400; pool disabled → 503', async () => {
    const token = await signTestToken('Manager');
    const boundary = '----sf21avatartest';
    const noFile = await h.app.inject({
      method: 'POST',
      url: '/avatar',
      payload: `--${boundary}--\r\n`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });
    expect(noFile.statusCode).toBe(400);

    __setAvatarPoolForTests(null); // FULFILLMENT_DB_HOST không set trong test
    const mp = multipartFile(JPEG_HEAD, 'image/jpeg');
    const res = await injectRaw(h.app, 'POST', '/avatar', mp);
    expect(res.statusCode).toBe(503);
    expect((JSON.parse(res.payload) as { code: string }).code).toBe('UNAVAILABLE');
  });
});

describe('GET /avatar/:userId', () => {
  it('có avatar → 200 bytes + content-type lưu DB + nosniff + private cache', async () => {
    const stored = Buffer.concat([PNG_HEAD, Buffer.alloc(8, 0x22)]);
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(fakePool(rec, { rows: [{ content_type: 'image/png', data: stored }] }));
    const res = await injectRaw(h.app, 'GET', '/avatar/bob');
    expect(res.statusCode).toBe(200);
    expect(rec.params[0][0]).toBe('bob');
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(res.rawPayload.equals(stored)).toBe(true);
  });

  it('chưa có avatar → 404 envelope NOT_FOUND', async () => {
    const rec: { sqls: string[]; params: unknown[][] } = { sqls: [], params: [] };
    __setAvatarPoolForTests(fakePool(rec, { rows: [] }));
    const res = await injectRaw(h.app, 'GET', '/avatar/nobody');
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload) as { statusCode: number; code: string };
    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('chưa auth → 401 (guard toàn cục phủ cả avatar)', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/avatar/tester' });
    expect(res.statusCode).toBe(401);
  });
});
