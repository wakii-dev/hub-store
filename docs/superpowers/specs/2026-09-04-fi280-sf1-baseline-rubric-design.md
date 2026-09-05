# SF-1 SPEC: Baseline + Rubric (FI-281) — QA regression hub-store (epic FI-280)

Status: Approved (epic spec FI-280 đã APPROVE 2026-09-04; spec slice materialized trong
docs/superpowers/contexts/fi280-sf-1.md — file này là bản SF-scope, self-answered clarifying)

## Vấn đề
SF-2..7 cần ground truth: spec nào đang đỏ TRƯỚC khi sửa. Không có baseline → bug tìm
thấy sau không phân biệt được bug-app vs regression.

## Scope
IN: boot-verify 7/7 ports (E2E=1) · chạy 25 e2e specs serial → baseline đỏ/xanh từng spec ·
qa-rubric.md (rubric P0–P3 + coverage map + ownership rules, copy từ epic spec) ·
fix CHỈ bug infra/seed/boot/fixture · route bug app lên epic FI-280 · probe /tmp toolchains.
OUT: bug app fix (route) · spec mới · behavior change · main branch.

## Thiết kế thực thi (self-answered clarifying)
1. **Boot flow**: `E2E=1 BOOT_ONLY=1 bash scripts/boot-all.sh` (reset DB + keycloak volume
   rồi boot, thoát sau khi ready) → verify 7/7 ports + realm hubstore.
2. **Baseline run**: `E2E_REUSE=1 npx playwright test` trong e2e/ — reuseExistingServer
   để không reset giữa chừng. Reporter list + html; lưu JSON report làm bằng chứng.
3. **Verdict đỏ**: re-run 1 lần spec đỏ trước khi verdict (flake known: kafka
   indexing-delay, e2e flake trên máy load). Vẫn đỏ → phân loại infra vs app
   theo touch map.
4. **Fix-infra commit**: mỗi nhóm fix 1 commit `fix(e2e)/fix(infra): ...`.
5. **Route-app-bug**: comment template `[P<n>][<DOMAIN>]` lên epic FI-280 + routing
   entry (SF domain theo coverage map).
6. **Toolchain probe**: ts-proto (npm dir /tmp — đã mất, rebuild theo memory
   fi233-story-patterns), grpc-java plugin (/tmp/sf1-spikes — còn, verify chạy được).
7. **Rubric doc**: docs/superpowers/qa-rubric.md — copy rubric + coverage map +
   ownership + execution notes từ epic spec (ground truth SF-2..7).

## ACCEPTANCE (từ context pack)
1. Boot 7/7 ports sạch từ nhánh đích.
2. Baseline 25/25 specs có verdict đỏ/xanh, ghi trên FI-281.
3. qa-rubric.md tồn tại (rubric + coverage map + ownership).
4. Mỗi spec đỏ: fix-infra commit HOẶC routing entry lên epic.
5. Toolchain probe kết quả ghi trên FI-281.

## Test strategy
Baseline bản thân nó là test-run; fix-infra được chứng minh bằng re-run specs liên quan
xanh sau fix. Không viết spec mới.

## Risks
- Stack cũ (postgres/keycloak Up 9h/5h) — E2E=1 reset xử lý.
- Specs đỏ cascade do 1 service chết — chờ full health trước khi verdict.
