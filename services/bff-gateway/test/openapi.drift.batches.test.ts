/**
 * Drift-guard scoped domain Batches (FI-326 SF-3) — helper chung từ SF-1
 * (semantics g: KHÔNG sửa file drift chung). Suite auto-discovery của
 * openapi.drift.test.ts (SF-1) cũng tự phủ batches.yaml — file này giữ
 * assertion per-file của domain để đỏ/xaanh đúng phạm vi 9 ops Batches.
 */
import { describeOpenApiDrift } from './openapi.drift.helpers.js';

describeOpenApiDrift(['batches.yaml']);
