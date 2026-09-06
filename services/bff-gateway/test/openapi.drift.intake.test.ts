/**
 * Drift-guard scoped SF-4 (FI-330): intake.yaml — 8 ops Intake + 1 op Webhooks.
 * Import helper THUẦN từ openapi.drift.helpers.ts (module không tự chạy suite
 * nào — tránh double harness boot, xem header helpers). KHÔNG sửa file drift
 * chung của SF-1.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeOpenApiDrift, loadSpecFileOps, PATHS_DIR } from './openapi.drift.helpers.js';

describeOpenApiDrift(['intake.yaml']);

describe('openapi drift-guard: intake.yaml scoped (SF-4)', () => {
  // Pin đúng 9 ops (context pack sf-4) — bao gồm webhook nested-scope
  // (route đăng ký trong app.register con phải vẫn visible cho hasRoute).
  it('đúng 9 ops — 8 Intake + 1 Webhooks, không thừa/thiếu', () => {
    const ops = loadSpecFileOps(path.join(PATHS_DIR, 'intake.yaml'));
    const keys = ops.map((op) => `${op.method} ${op.path}`).sort();
    expect(keys).toEqual([
      'GET /orders/by-batch/{batchCode}',
      'GET /orders/import/template',
      'GET /orders/{code}/audit',
      'POST /orders',
      'POST /orders/import/confirm',
      'POST /orders/import/preview',
      'POST /orders/{code}/fail',
      'POST /orders/{code}/redeliver',
      'POST /webhooks/orders',
    ]);
  });
});
