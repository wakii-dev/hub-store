/**
 * Contract tests SF-28 T6 criteria presets (plan Task 6, spec §3 Q3 — pattern
 * transfer.route.test.ts): GET shape 4 preset, POST happy + audit spy (pool
 * stub qua FULFILLMENT_DB_HOST gate), 422 sai presetId, 403 WarehouseOps.
 * Static list BFF-side — KHÔNG có upstream để mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { startHarness, signTestToken } from './harness.js';
import type { Harness } from './harness.js';
import { __setAuditPoolForTests } from '../src/lib/audit.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  __setAuditPoolForTests(null);
  delete process.env.FULFILLMENT_DB_HOST;
  await h.closeAll();
});

async function injectGet(
  url: string,
  role = 'Coordinator',
): Promise<{ statusCode: number; body: any }> {
  const res = await h.app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${await signTestToken(role)}` },
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = null;
  }
  return { statusCode: res.statusCode, body };
}

async function injectPost(
  url: string,
  payload: Record<string, unknown>,
  role = 'Coordinator',
): Promise<{ statusCode: number; body: any }> {
  const res = await h.app.inject({
    method: 'POST',
    url,
    payload,
    headers: { authorization: `Bearer ${await signTestToken(role)}` },
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = null;
  }
  return { statusCode: res.statusCode, body };
}

describe('SF-28 T6 — GET /batching/criteria-presets', () => {
  it('Coordinator — 200 { items } đủ 4 preset shape {id, name, description}', async () => {
    const { statusCode, body } = await injectGet('/batching/criteria-presets');
    expect(statusCode).toBe(200);
    expect(body.items).toEqual([
      { id: 'shortest', name: 'Ngắn nhất', description: 'Ưu tiên tổng quãng đường/stop ngắn nhất' },
      { id: 'cod_priority', name: 'Ưu tiên COD', description: 'Ưu tiên đơn thu COD trước' },
      { id: 'fewest_stops', name: 'Ưu tiên số dừng ít', description: 'Giảm số điểm dừng mỗi phiếu' },
      { id: 'balanced', name: 'Cân bằng', description: 'Cân bằng quãng đường và số dừng' },
    ]);
  });

  it('WarehouseOps (non-role) — 403 PERMISSION_DENIED', async () => {
    const { statusCode, body } = await injectGet('/batching/criteria-presets', 'WarehouseOps');
    expect(statusCode).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
  });
});

describe('SF-28 T6 — POST /batching/criteria-preset-select', () => {
  it('happy path — 200 {ok:true} + audit batching.criteria_preset_select', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    // getAuditPool gate theo FULFILLMENT_DB_HOST — set env để pool giả được dùng
    // (pattern transfer.route.test.ts).
    process.env.FULFILLMENT_DB_HOST = 'audit-test.invalid';
    __setAuditPoolForTests({
      query: (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    } as unknown as Pool);

    const { statusCode, body } = await injectPost('/batching/criteria-preset-select', {
      presetId: 'balanced',
      orderCount: 12,
    });
    expect(statusCode).toBe(200);
    expect(body).toEqual({ ok: true });

    // Audit fire-and-forget — pool stub nhận INSERT activity_log.
    await vi.waitFor(() => {
      expect(queries).toHaveLength(1);
    });
    expect(queries[0].sql).toContain('INSERT INTO activity_log');
    expect(queries[0].params[0]).toBe('tester');
    expect(queries[0].params[1]).toBe('batching.criteria_preset_select');
    expect(queries[0].params[3]).toBe('balanced');
  });

  it('presetId sai — 422 VALIDATION_ERROR, KHÔNG audit', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    process.env.FULFILLMENT_DB_HOST = 'audit-test.invalid';
    __setAuditPoolForTests({
      query: (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    } as unknown as Pool);

    const { statusCode, body } = await injectPost('/batching/criteria-preset-select', {
      presetId: 'khong-ton-tai',
    });
    expect(statusCode).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details[0].field).toBe('presetId');
    // Cho async fire-and-forget có cơ hội chạy — vẫn phải 0 query.
    await new Promise((r) => setTimeout(r, 20));
    expect(queries).toHaveLength(0);
  });

  it('WarehouseOps (non-role) — 403 PERMISSION_DENIED, KHÔNG audit', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    process.env.FULFILLMENT_DB_HOST = 'audit-test.invalid';
    __setAuditPoolForTests({
      query: (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    } as unknown as Pool);

    const { statusCode, body } = await injectPost(
      '/batching/criteria-preset-select',
      { presetId: 'balanced' },
      'WarehouseOps',
    );
    expect(statusCode).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
    await new Promise((r) => setTimeout(r, 20));
    expect(queries).toHaveLength(0);
  });
});
