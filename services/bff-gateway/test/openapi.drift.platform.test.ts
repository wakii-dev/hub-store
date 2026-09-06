/**
 * Drift-guard scoped slice SF-8 (FI-334) — file paths của domain này ↔ routes
 * harness. Dùng helper SF-1 export (semantics g — không ai sửa file drift chung):
 * mỗi op trong platform.yaml (13: Administration 8 + Realtime & Transfers 5 —
 * notifications 2 paths alias đếm RIÊNG) phải có route thật trên app (guard boot
 * đủ route conditional /auth/reset-password nhờ harness option devResetPassword
 * của SF-1); đảo chiều (mọi route phải thuộc SOME spec) chỉ chạy DRIFT_FULL=1
 * trong file chung (SF-9).
 */
import { describeOpenApiDrift } from './openapi.drift.helpers.js';

describeOpenApiDrift(['platform.yaml']);
