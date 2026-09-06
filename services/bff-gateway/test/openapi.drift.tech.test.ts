/**
 * Drift-guard scoped cho SF-5 (FI-331) — tech.yaml (Field Service, 13 ops).
 * Dùng helper dùng chung của SF-1 (semantics a-f pin sẵn — KHÔNG sửa file
 * drift chung): assertSpecFileMatchesApp so từng op spec ↔ route harness.
 * Count 13 = bảng pin root openapi.yaml tag "Field Service (13 ops)".
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeOpenApiDrift, loadSpecFileOps, PATHS_DIR } from './openapi.drift.helpers.js';

const TECH_FILE = path.join(PATHS_DIR, 'tech.yaml');

describe('openapi drift-guard tech.yaml: scoped 13 ops', () => {
  it('tech.yaml khai đúng 13 ops (Field Service — spec §4 pin)', () => {
    const ops = loadSpecFileOps(TECH_FILE);
    expect(ops).toHaveLength(13);
    // Mỗi op phải có operationId (docs UI + trace).
    for (const op of ops) expect(op.operationId, `${op.method} ${op.path}`).toBeTruthy();
  });
});

describeOpenApiDrift(['tech.yaml']);
