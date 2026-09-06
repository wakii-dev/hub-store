/**
 * Drift-guard scoped slice SF-2 (FI-326) — file paths của domain này ↔ routes
 * harness. Dùng helper SF-1 export (semantics g — không ai sửa file drift chung):
 * mỗi op trong fulfillment.yaml (16: Orders 13 + Master Data 3) phải có route
 * thật trên app; đảo chiều (mọi route phải thuộc SOME spec) chỉ chạy DRIFT_FULL=1
 * trong file chung (SF-9).
 */
import { describeOpenApiDrift } from './openapi.drift.helpers.js';

describeOpenApiDrift(['fulfillment.yaml']);
