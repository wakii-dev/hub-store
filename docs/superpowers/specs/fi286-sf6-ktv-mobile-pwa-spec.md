# FI-286 SF-6 — KTV Mobile + PWA sweep (spec slice)

> Epic: FI-280 QA regression hub-store. Bracket: docs/superpowers/brackets/fi280-qa-hub-store-regression.md §SF-6. Context pack: docs/superpowers/contexts/fi280-sf-6.md.
> Status: Approved (autonomous — epic-level questions pre-answered trong context pack; spec slice là bản chi tiết hóa, không mở scope mới).

## 1. Problem
KTV mobile web là user-facing chính thứ 2 (kỹ thuật viên dùng ngoài thực địa). SW cache sai → che bug (bản cũ ghim mãi) hoặc chặn job flow khi offline. Hiện chưa có QA sweep độc lập cho domain này trên nhánh story/qa-hub-store-regression.

## 2. Scope
**In:**
- Walkthrough 3 specs làm checklist qua browser thật, viewport :375: `08-mobile.spec.ts` (shell mobile ≤768 smoke), `09-ktv-mobile.spec.ts` (KTV app :4220 — my orders/accept/complete/reschedule/detail/timeline/PWA), `08-pwa.spec.ts` (shell PWA manifest/SW/offline/notifications/GA-off)
- Rule 0 3 tầng: DOM (eval) → VISUAL (screenshot) → FLOW (login→navigate→action→logout trọn)
- Offline qua Playwright `context.setOffline()`; SW cache hygiene (cache-first immutable / network-first nav / pass-through guards)
- PWA install prompt: manual checklist + screenshot evidence (automation không click được native prompt)
- Fix bug P0–P2 trong apps/ktv-mobile/** + SW; P3 + latency chỉ log
- Regression spec 14xx (tự lập state) + verify-no-regression re-run walkthrough specs

**Out:**
- Feature mới, đổi kiến trúc, đổi API contract/DB schema
- Shared permission files (SF-2 duy nhất), sf11-helpers.ts
- Shell SW (`apps/shell/public/sw.js`) thuộc shell domain — chỉ verify hoạt động, không refactor (nếu bug shell SW P0-P2 → fix tối thiểu + log, trỏ shell domain SF-7 không có SW task → escalate epic nếu cần)

## 3. Touch map
- Sửa: `apps/ktv-mobile/**`, `e2e/tests/14xx-*.spec.ts` (mới), `docs/superpowers/improvements-log.md` (flag nếu có)
- Dùng read-only: `e2e/scripts/run-ktv-private.sh`, `playwright.ktv.config.ts`, `mint_ktv_auth.py`
- CẤM: `packages/shared/src/hooks/usePermissions.tsx`, nav config, `e2e/tests/sf11-helpers.ts`

## 4. Design / approach
- Direction A: reuse seam runner SF-25 (block :4220 app / :4286 BFF / :56443 pg / :8082 KC, fresh containers sf-25-postgres/sf-25-keycloak, KAFKA off nhờ KC riêng — ktv không cần Kafka). Fallback B (seam sf-6 port mới) chỉ nếu block bị chiếm bởi process lạ.
- SW sweep hygiene: mỗi sweep hard-reload; KHÔNG curl bare `/src/*.ts` (MF entry-poisoning); SW register readyState fast-path — chờ `navigator.serviceWorker.controller` trước khi setOffline.
- Bug reporting: comment lên FI-286, template `[P<n>][MOBILE] <title> / repro / expected vs actual / evidence / fix commit / regression spec`. Fix ngay P0-P2; >8 bug P2 → STOP + escalate epic.
- Bug permission trong file cấm-sửa → log + `[PERM]` comment FI-282.

## 5. Acceptance (từ context pack — kiểm từng dòng ở Phase 5)
1. Từng walkthrough spec: flow đi trọn qua browser PASS (DOM+VISUAL+FLOW) hoặc bug đã fix.
2. 0 bug P0–P2 mở trong domain (bug-log comment hoàn chỉnh từng bug trên issue).
3. Regression specs range 14xx PASS (tự lập state).
4. verify-no-regression: walkthrough specs domain re-run PASS sau fix.

## 6. Risks
- SW register sau load → offline context phải chờ controller; hard-reload bắt buộc giữa các sweep
- Port-war cross-worktree (block sf-25 có thể bị container cũ giữ — runner rm -f containers của mình, docker_safe_kill guard)
- storageState mint PKCE hack — fail → debug mint_ktv_auth.py trước khi walk
- Install prompt manual — screenshot evidence là chứng nhận duy nhất
