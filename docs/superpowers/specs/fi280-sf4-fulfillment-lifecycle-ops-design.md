# FI-280 SF-4 — Fulfillment lifecycle + Ops sweep — Design Spec

Status: Approved (spec slice từ context pack `docs/superpowers/contexts/fi280-sf-4.md`; epic-level questions đã trả lời trên FI-280 — không re-ask, không REQUIREMENT-GAP mới)

## 1. Problem
Fulfillment lifecycle (prep→assign staff→driver→deliver) là xương sống domain; 6 ops flows (audit/audit-viewer/area/settlement/tech-service/exception) phủ nửa dưới pipeline. Baseline FI-281 đã route 3 nhóm bug vào SF-4:
- `[P1][EXCEPTION]` 06-exception cascade 0/4 (prep-timeout/mark-fail/redeliver)
- `[P1][TECH]` SO-0001 NEW không có nút Gán KTV (05-tech-service 4/5)
- `[P1][AREA]` POST /service-employees 403 (05-area 1/2)

## 2. Scope
**In:** walkthrough 6 specs (03-audit, 08-audit-viewer, 05-area, 05-settlement, 05-tech-service, 06-exception) qua browser Rule 0 3 tầng (DOM→VISUAL→FLOW); audit-trail check cho mọi mutation đi qua UI; fix bug P0–P2 trong domain; lifecycle + cancel/edge cases; regression specs 12xx (tự lập state); verify-no-regression re-run domain.
**Out:** feature mới, đổi kiến trúc, sửa shared perm files (SF-2), sửa sf11-helpers.ts, thêm bảng DB, SF khác (orders CRUD→SF-3, batching/kafka→SF-5, mobile→SF-6, print/nvc/admin→SF-7).

## 3. Touch map
- `services/fulfillment-service` UI-facing contracts + `apps/*` orders/fulfillment UI (sở hữu)
- `e2e/tests/12xx-*.spec.ts` (mới, tự lập state, KHÔNG import sf11-helpers.ts)
- Cấm: `packages/shared/src/hooks/usePermissions.tsx`, nav config, `e2e/tests/sf11-helpers.ts`

## 4. Design
QA sweep, không có lựa chọn kiến trúc. Boot full stack riêng private-port (seam `E2E_SHELL_URL`/`E2E_BFF_URL`/`E2E_PROXY`/`E2E_PG_SEAM`, pattern run-nvc-private.sh; KHÔNG share Kafka/Keycloak). Mỗi flow: specs làm CHECKLIST, browser thật đi trọn, bug report template `[P<n>][<DOMAIN>]` lên FI-284, fix P0–P2 ngay, P3+latency chỉ log, >8 bug P2 → STOP + escalate epic.

## 5. Acceptance (từ context pack — Phase 5 kiểm từng dòng)
1. Từng walkthrough spec: flow đi trọn qua browser PASS (DOM+VISUAL+FLOW) hoặc bug đã fix
2. 0 bug P0–P2 mở trong domain (bug-log comment hoàn chỉnh từng bug trên FI-284)
3. Regression specs range 12xx PASS (tự lập state)
4. verify-no-regression: walkthrough specs domain re-run PASS sau fix

## 6. Risks
- Audit trail fire-and-forget (poll ~15s) — check phải đợi entry
- 06-exception cần ≥2 unbatched orders shop 30201 — tự lập state
- 05-settlement TRUNCATE + reseed — thứ tự chạy specs quan trọng
- Fix UI contracts có thể vỡ specs xanh khác → re-run regression domain sau fix
