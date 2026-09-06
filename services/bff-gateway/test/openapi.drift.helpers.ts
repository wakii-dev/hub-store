/**
 * Helpers cho drift-guard spec ↔ routes (FI-326 SF-1) — module THUẦN, không
 * tự chạy suite nào khi import (code-review P2: nếu SF domain import thẳng
 * test file thì module-level describe của SF-1 chạy lại → double harness boot).
 *
 * SF-2..8 dùng (semantics g — không ai sửa file drift chung):
 *   import { describeOpenApiDrift } from './openapi.drift.helpers.js';
 *   describeOpenApiDrift(['fulfillment.yaml']);
 *
 * Semantics PIN (context pack sf-1.md): (a) auto-discovery per-file ·
 * (b) reverse check chỉ DRIFT_FULL=1 · (c) normalize `:param` ↔ `{param}`,
 * regex-param `:p(re)` lấy tên trước `(` · (d) devResetPassword:true ·
 * (e) BFF_ENABLE_API_DOCS unset khi extract · (f) FAIL message method+path.
 *
 * SF-9 (FI-335) mở rộng (b): reverse-check so SKELETON shape (param → {*})
 * thay vì so tên — find-my-way gộp route trùng vị trí param khác tên thành
 * node `:a|:b`, tên thật không khôi phục được từ printRoutes; static
 * segments vẫn so exact nên route thừa/thiếu static vẫn đỏ. Forward-check
 * (spec→app qua hasRoute) giữ nguyên so tên.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parse } from 'yaml';
import { startHarness } from './harness.js';

export const OPENAPI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openapi');
export const PATHS_DIR = path.join(OPENAPI_DIR, 'paths');
const SPEC_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

export interface OpenApiOp {
  method: string; // uppercase
  path: string; // OpenAPI braces — '/users/{userId}'
  operationId?: string;
}

/** Normalize route path về dạng find-my-way (`:param`) để so 2 chiều. */
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
 * Hướng spec→code (gated): MỖI op phải có route thật trên app.
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
 * Expand param alternation find-my-way: '/x/:a|:b' → ['/x/:a', '/x/:b'].
 * SF-9 fix: alternation nằm TRONG 1 segment — node có con thì suffix sau
 * segment phải giữ nguyên từng variant ('/x/:a|:b/y' → ['/x/:a/y',
 * '/x/:b/y']). Bản cũ cắt head tại '/' cuối của variant đầu → mất suffix.
 */
function expandParamAlternation(p: string): string[] {
  if (!p.includes('|')) return [p];
  let variants: string[] = [''];
  for (const seg of p.split('/')) {
    if (!seg) continue; // leading '' từ split('/') — '/' do flatMap thêm
    const alts = seg.includes('|') ? seg.split('|') : [seg];
    variants = variants.flatMap((v) => alts.map((a) => `${v}/${a}`));
  }
  return variants;
}

/**
 * Skeleton path — mọi param (:name / {name}) → {*} để so SHAPE bỏ tên.
 * SF-9: find-my-way gộp 2 route trùng vị trí param khác tên thành node
 * in `:a|:b` — tên thật của từng route không khôi phục được từ printRoutes,
 * so theo tên sẽ false-positive phantom (GET /fulfillment/:code). Static
 * segments vẫn so chính xác → route khai báo thừa/thiếu vẫn bị bắt.
 */
export function skeletonRoutePath(p: string): string {
  return normalizeRoutePath(p).replace(/:[A-Za-z0-9_]+/g, '{*}');
}

/**
 * Parse output `printRoutes({ commonPrefix: false })` — tree, mỗi level thụt
 * 4 ký tự ('│   ' / '    '), fragment nối THẲNG vào prefix cha (không thêm
 * dấu phân cách): '/fulfillment/print' + '-errors/counts' →
 * '/fulfillment/print-errors/counts'.
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
    // depth = số cột indent trước branch marker (mỗi level 4 ký tự).
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

/** MỌI ops từ mọi paths/*.yaml (auto-discovery) — set dạng skeleton. */
export function loadAllSpecOps(): Set<string> {
  const all = new Set<string>();
  for (const file of fs.readdirSync(PATHS_DIR).filter((f) => f.endsWith('.yaml'))) {
    for (const op of loadSpecFileOps(path.join(PATHS_DIR, file))) {
      all.add(`${op.method} ${skeletonRoutePath(op.path)}`);
    }
  }
  return all;
}

/**
 * Hướng code→spec (semantics b — CHỈ DRIFT_FULL=1): mọi route harness phải
 * thuộc SOME spec file (so skeleton shape — xem skeletonRoutePath). Throw
 * liệt kê route thiếu.
 */
export function assertAppRoutesAllInSpec(app: FastifyInstance): void {
  const printRoutes = (app as unknown as { printRoutes: (o: { commonPrefix: boolean }) => string })
    .printRoutes({ commonPrefix: false });
  const specOps = loadAllSpecOps();
  const missing = parsePrintRoutes(printRoutes).filter((r) => {
    // OPTIONS * = preflight wildcard của @fastify/cors — không phải API
    // surface (OpenAPI docs per-path; không SF nào khai OPTIONS op).
    if (r.method === 'OPTIONS' && r.path === '*') return false;
    return !specOps.has(`${r.method} ${skeletonRoutePath(r.path)}`);
  });
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
 *   import { describeOpenApiDrift } from './openapi.drift.helpers.js';
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
