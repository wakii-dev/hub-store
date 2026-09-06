/**
 * Drift-guard scoped domain Delivery (FI-326 SF-6) — helper chung từ SF-1
 * (semantics g: KHÔNG sửa file drift chung). Suite auto-discovery của
 * openapi.drift.test.ts (SF-1) cũng tự phủ delivery.yaml — file này giữ
 * assertion per-file của domain để đỏ/xanh đúng phạm vi 9 ops Delivery.
 */
import { describeOpenApiDrift } from './openapi.drift.helpers.js';

describeOpenApiDrift(['delivery.yaml']);
