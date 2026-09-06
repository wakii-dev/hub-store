/**
 * Drift-guard scoped domain COD Settlement + Print (FI-326 SF-7) — helper chung
 * từ SF-1 (semantics g: KHÔNG sửa file drift chung). Suite auto-discovery của
 * openapi.drift.test.ts (SF-1) cũng tự phủ cod-print.yaml — file này giữ
 * assertion per-file của domain để đỏ/xanh đúng phạm vi 12 ops.
 */
import { describeOpenApiDrift } from './openapi.drift.helpers.js';

describeOpenApiDrift(['cod-print.yaml']);
