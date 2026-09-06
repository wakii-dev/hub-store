/**
 * Drift-guard mặc định của SF-1 (FI-326): auto-discovery toàn bộ
 * paths/*.yaml + negative control + unit test parser + DRIFT_FULL gate.
 *
 * Helpers nằm ở `./openapi.drift.helpers.ts` (thuần — import không chạy
 * suite). SF-2..8 tạo test file RIÊNG `test/openapi.drift.<domain>.test.ts`
 * chỉ cần:
 *   import { describeOpenApiDrift } from './openapi.drift.helpers.js';
 *   describeOpenApiDrift(['fulfillment.yaml']);
 *
 * Semantics PIN đầy đủ (a-h): xem header `openapi.drift.helpers.ts`.
 */
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertAppRoutesAllInSpec,
  assertOpsExistInApp,
  describeOpenApiDrift,
  loadSpecFileOps,
  openDriftHarness,
  parsePrintRoutes,
  PATHS_DIR,
  skeletonRoutePath,
  type DriftHarness,
} from './openapi.drift.helpers.js';
import fs from 'node:fs';

// (a) auto-discovery — SF-1 xanh với đúng 3 ops system.yaml; tier-1 thêm file
// → tự vào suite này, KHÔNG cần sửa gì (per-file assertion, stub rỗng pass).
describeOpenApiDrift(fs.readdirSync(PATHS_DIR).filter((f) => f.endsWith('.yaml')));

describe('openapi drift-guard: negative control + DRIFT_FULL', () => {
  let harness: DriftHarness;
  beforeAll(async () => {
    harness = await openDriftHarness();
  });
  afterAll(() => harness.closeAll());

  // (h) negative control — chứng minh guard KHÔNG luôn-xanh: thêm 1 route giả
  // vào spec (IN-MEMORY, không đụng file disk) → comparator phải đỏ với
  // message method+path rõ.
  it('route giả thêm vào spec → comparator ĐỎ với message method+path', () => {
    const ops = loadSpecFileOps(path.join(PATHS_DIR, 'system.yaml'));
    expect(ops.length).toBeGreaterThan(0);
    ops.push({ method: 'GET', path: '/definitely-fake-route', operationId: 'fakeOp' });
    expect(() => assertOpsExistInApp(harness.app, ops, 'system.yaml (mutated)')).toThrowError(
      /GET \/definitely-fake-route/,
    );
  });

  // Bỏ mutation → xanh lại (không file disk nào bị đụng — comparator thuần).
  it('spec thật (không mutation) → comparator xanh', () => {
    const ops = loadSpecFileOps(path.join(PATHS_DIR, 'system.yaml'));
    expect(() => assertOpsExistInApp(harness.app, ops, 'system.yaml')).not.toThrow();
  });

  // (b) reverse check chỉ bật khi DRIFT_FULL=1 — SF-9 convergence dùng.
  it.skipIf(!process.env.DRIFT_FULL)(
    'DRIFT_FULL: mọi route harness phải thuộc SOME spec file',
    () => {
      expect(() => assertAppRoutesAllInSpec(harness.app)).not.toThrow();
    },
  );

  // Parser printRoutes phải reconstruct đúng fragment-nối-thẳng + param.
  it('parsePrintRoutes: alternation node CÓ con — suffix giữ nguyên từng variant (SF-9)', () => {
    // Cây thật DRIFT_FULL gặp: con của node alternation từng bị truncate
    // (head cắt tại param cuối) → phantom 'POST /fulfillment/:fulfillCode'.
    const parsed = parsePrintRoutes(
      [
        '├── /fulfillment/:fulfillCode|:code (GET, HEAD)',
        '│   ├── /assign-shop-hub (POST)',
        '│   └── /transfer-tickets (POST)',
      ].join('\n'),
    );
    const keys = parsed.map((r) => `${r.method} ${r.path}`);
    expect(keys).toContain('GET /fulfillment/:fulfillCode');
    expect(keys).toContain('GET /fulfillment/:code');
    expect(keys).toContain('POST /fulfillment/:fulfillCode/assign-shop-hub');
    expect(keys).toContain('POST /fulfillment/:code/assign-shop-hub');
    expect(keys).toContain('POST /fulfillment/:fulfillCode/transfer-tickets');
    expect(keys).toContain('POST /fulfillment/:code/transfer-tickets');
    expect(keys).not.toContain('POST /fulfillment/:fulfillCode');
  });

  it('skeletonRoutePath: param name → {*} — reverse-check so shape (SF-9)', () => {
    expect(skeletonRoutePath('/fulfillment/:code')).toBe('/fulfillment/{*}');
    expect(skeletonRoutePath('/fulfillment/{fulfillCode}')).toBe('/fulfillment/{*}');
    expect(skeletonRoutePath('/users/{userId}/set-password')).toBe('/users/{*}/set-password');
    expect(skeletonRoutePath('/healthz')).toBe('/healthz');
  });

  it('parsePrintRoutes: fragment nối thẳng + expand param alternation', () => {
    const parsed = parsePrintRoutes(
      [
        '├── /health (GET, HEAD)',
        '│   └── z (GET, HEAD)',
        '├── /fulfillment/print (POST)',
        '│   ├── -errors/counts (GET, HEAD)',
        '│   └── ers (GET, HEAD, POST)',
        '│       └── /:shopCode/:printerId (PUT)',
        '├── /fulfillment/:fulfillCode|:code (GET, HEAD)',
        '└── /webhooks/orders (POST)',
      ].join('\n'),
    );
    const keys = parsed.map((r) => `${r.method} ${r.path}`);
    expect(keys).toContain('GET /healthz');
    expect(keys).toContain('GET /fulfillment/print-errors/counts');
    expect(keys).toContain('POST /fulfillment/printers');
    expect(keys).toContain('PUT /fulfillment/printers/:shopCode/:printerId');
    expect(keys).toContain('GET /fulfillment/:fulfillCode');
    expect(keys).toContain('GET /fulfillment/:code');
    expect(keys).toContain('POST /webhooks/orders');
    expect(keys).not.toContain('HEAD /healthz');
  });
});
