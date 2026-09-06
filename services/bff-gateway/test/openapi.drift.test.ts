/**
 * Drift-guard: spec OpenAPI ↔ routes thật của harness app (FI-326 SF-1).
 *
 * Semantics PIN (context pack sf-1.md):
 *  (a) auto-discovery openapi/paths/*.yaml — assertion PER-FILE (SF-1 xanh với
 *      đúng 3 ops system.yaml; stub rỗng pass; SF-2..8 thêm file → tự vào).
 *  (b) assertion NGƯỢC "mọi route harness phải thuộc SOME spec file" chỉ bật
 *      khi env DRIFT_FULL=1 (SF-9 convergence dùng).
 *  (c) normalize `:param` → `{param}` 2 chiều; find-my-way regex-param
 *      `:p(re)` lấy phần tên trước `(`.
 *  (d) boot startHarness({ devResetPassword: true }) — đủ route conditional.
 *  (e) BFF_ENABLE_API_DOCS unset khi extract — tránh bắt nhầm /documentation.
 *  (f) FAIL message chỉ rõ method+path (thiếu spec / thiếu route).
 *  (g) export describeOpenApiDrift(files) — SF-2..8 tạo test file RIÊNG
 *      `test/openapi.drift.<domain>.test.ts`, KHÔNG ai sửa file drift chung.
 *  (h) negative control: thêm route giả vào spec (in-memory) → comparator ĐỎ.
 *
 * Quyết định probe (FI-326 T9, ghi theo plan-critic P1): Fastify 5.2.1 KHÔNG
 * expose router table (`app.router` undefined, không symbol routes) →
 *   - hướng spec→code (gated, mọi SF): `app.hasRoute({method, url})` — public,
 *     chính xác.
 *   - hướng code→spec (DRIFT_FULL=1): parse `app.printRoutes({commonPrefix:
 *     false})` — tree format, parser reconstruct prefix theo indentation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parse } from 'yaml';
import { startHarness } from './harness.js';

const OPENAPI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openapi');
const PATHS_DIR = path.join(OPENAPI_DIR, 'paths');
const SPEC_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

export interface OpenApiOp {
  method: string; // uppercase
  path: string; // OpenAPI braces — '/users/{userId}'
  operationId?: string;
}

/**
 * Normalize route path về dạng find-my-way (`:param`) để so 2 chiều:
 *   '{userId}' → ':userId'; ':code(\d+)' → ':code' (regex-param chỉ lấy tên).
 */
export function normalizeRoutePath(p: string): string {
  return p.replace(/\{([^}]+)\}/g, ':$1').replace(/:([A-Za-z0-9_]+)(\([^)]*\))?/g, ':$1');
}

/** Load 1 paths file → ops (method+path). Stub `paths: {}` → []. */
export function loadSpecFileOps(absFile: string): OpenApiOp[] {
  const doc = parse(fs.readFileSync(absFile, 'utf8')) as {
    paths?: Record<string, Record<string, unknown>>;
  };
  const ops: OpenApiOp[] = [];
  for (const [routePath, item] of Object.entries(doc.paths ?? {})) {
    if (typeof item !== 'object' || item === null) continue;
    for (const method of SPEC_METHODS) {
      if (method in item) {
        const op = item[method] as { operationId?: string };
        ops.push({ method: method.toUpperCase(), path: routePath, operationId: op?.operationId });
      }
    }
  }
  return ops;
}

/**
 * Hướng spec→code: MỖI op trong `ops` phải có route thật trên app.
 * Throw với message chỉ rõ method+path khi lệch (semantics f).
 */
export function assertOpsExistInApp(app: FastifyInstance, ops: OpenApiOp[], label: string): void {
  for (const op of ops) {
    const url = normalizeRoutePath(op.path);
    const found = app.hasRoute({ method: op.method as 'GET', url });
    if (!found) {
      throw new Error(
        `[drift-guard] Spec khai ${op.method} ${op.path} (file ${label}) nhưng harness KHÔNG có route tương ứng — thêm/xóa route mà không sửa spec? (normalized: ${url})`,
      );
    }
  }
}

/** So 1 file paths/*.yaml ↔ app (per-file — semantics a). */
export function assertSpecFileMatchesApp(app: FastifyInstance, absFile: string): void {
  assertOpsExistInApp(app, loadSpecFileOps(absFile), path.basename(absFile));
}

interface ParsedRoute {
  method: string;
  path: string; // dạng ':param'
}

/**
 * Expand param alternation của find-my-way: '/fulfillment/:fulfillCode|:code'
 * → ['/fulfillment/:fulfillCode', '/fulfillment/:code']. Alternation chỉ nằm
 * trong 1 segment → prefix giữ tới '/' cuối trước '|' đầu.
 */
function expandParamAlternation(p: string): string[] {
  if (!p.includes('|')) return [p];
  const parts = p.split('|');
  const first = parts[0];
  const head = first.slice(0, first.lastIndexOf('/') + 1); // giữ '/' chung của segment
  return [first, ...parts.slice(1).map((rest) => head + rest)];
}

/**
 * Parse output `printRoutes({ commonPrefix: false })` — tree, mỗi level thụt
 * 4 ký tự ('│   ' / '    '), fragment nối THẲNG vào prefix cha (không thêm
 * dấu phân cách): '/fulfillment/print' + '-errors/counts' + 'ers' →
 * '/fulfillment/print-errors/counts' + '/fulfillment/printers'.
 * Param alternation ':fulfillCode|:code' — expand thành 2 route.
 */
export function parsePrintRoutes(output: string): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  // depth → prefix của node cha gần nhất ở depth đó (sibling ghi đè).
  const prefixes: string[] = [''];
  for (const rawLine of output.split('\n')) {
    const match = rawLine.match(/^(?:[│\s]*)(?:├──|└──)\s(\S+)(?:\s\(([^)]*)\))?\s*$/);
    if (!match) continue;
    const fragment = match[1];
    const methods = (match[2] ?? 'GET').split(',').map((m) => m.trim());
    // depth = số cột indent trước branch marker (mỗi level 4 ký tự: '│   '/'    ').
    const branchIdx = rawLine.search(/── /);
    const depth = Math.max(0, Math.round(branchIdx / 4));
    prefixes[depth] = (prefixes[depth - 1] ?? '') + fragment;
    prefixes.length = depth + 1; // cắt nhánh cũ sâu hơn
    const fullPath = prefixes[depth];
    for (const method of methods) {
      if (method === 'HEAD') continue; // fastify tự thêm HEAD cho GET — spec không khai
      for (const variant of expandParamAlternation(fullPath)) {
        routes.push({ method, path: variant });
      }
    }
  }
  return routes;
}

/** MỌI ops từ mọi paths/*.yaml (auto-discovery) — set đã normalize. */
export function loadAllSpecOps(): Set<string> {
  const all = new Set<string>();
  for (const file of fs.readdirSync(PATHS_DIR).filter((f) => f.endsWith('.yaml'))) {
    for (const op of loadSpecFileOps(path.join(PATHS_DIR, file))) {
      all.add(`${op.method} ${normalizeRoutePath(op.path)}`);
    }
  }
  return all;
}

/**
 * Hướng code→spec (semantics b — CHỈ DRIFT_FULL=1): mọi route harness phải
 * thuộc SOME spec file. Throw liệt kê route thiếu.
 */
export function assertAppRoutesAllInSpec(app: FastifyInstance): void {
  const printRoutes = (app as unknown as { printRoutes: (o: { commonPrefix: boolean }) => string })
    .printRoutes({ commonPrefix: false });
  const specOps = loadAllSpecOps();
  const missing = parsePrintRoutes(printRoutes).filter(
    (r) => !specOps.has(`${r.method} ${normalizeRoutePath(r.path)}`),
  );
  if (missing.length > 0) {
    throw new Error(
      `[drift-guard] ${missing.length} route chưa có trong spec nào (paths/*.yaml):\n` +
        missing.map((r) => `  - ${r.method} ${r.path}`).join('\n'),
    );
  }
}

export interface DriftHarness {
  app: FastifyInstance;
  closeAll: () => Promise<void>;
}

/** Boot harness chuẩn cho drift (semantics d+e) — dùng chung mọi SF. */
export async function openDriftHarness(): Promise<DriftHarness> {
  delete process.env.BFF_ENABLE_API_DOCS; // (e) — plugin đọc process.env trực tiếp
  const harness = await startHarness({ devResetPassword: true }); // (d)
  await harness.app.ready();
  return { app: harness.app, closeAll: () => harness.closeAll() };
}

/**
 * Helper cho SF-2..8 (semantics g) — test file domain chỉ cần:
 *   import { describeOpenApiDrift } from './openapi.drift.test.js';
 *   describeOpenApiDrift(['fulfillment.yaml']);
 */
export function describeOpenApiDrift(files: string[]): void {
  describe(`openapi drift-guard: ${files.map((f) => path.basename(f)).join(', ')}`, () => {
    let harness: DriftHarness;
    beforeAll(async () => {
      harness = await openDriftHarness();
    });
    afterAll(() => harness.closeAll());
    it('mỗi op trong spec phải có route thật trên harness app', () => {
      for (const file of files) {
        assertSpecFileMatchesApp(harness.app, path.join(PATHS_DIR, file));
      }
    });
  });
}

// ==== Test mặc định của SF-1 — auto-discovery toàn bộ paths/*.yaml (a) ====

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
