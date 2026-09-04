# SF-2 SPEC: Auth + Role Matrix sweep (FI-282) — QA regression hub-store (epic FI-280)

Status: Approved (epic spec FI-280 APPROVED 2026-09-04; spec slice materialized trong
docs/superpowers/contexts/fi280-sf-2.md — file này là bản SF-scope, self-answered clarifying.
Tier: Full — shared permission files, mọi SF khác phụ thuộc.)

## Vấn đề
Baseline 02-role-matrix xanh 5/0 NHƯNG spec chỉ phủ 3 roles (Coordinator/WarehouseOps/Manager)
× 2 tầng (route gating + nav filter). Thiếu: Admin + WarehouseEmployee, logout flow,
401-refresh-fail redirect, landing từng role qua UI thật. Không có auth đúng thì mọi
walkthrough SF khác vô nghĩa (SF-2 là Wave-1 chủ shared permission files).

## Phase 0 impact analysis (tóm tắt)
- **Touch map (SF-2 sở hữu)**: `packages/shared/src/hooks/usePermissions.tsx` + `apps/shell/src/nav.ts`
  (nav config) + `e2e/tests/10xx-*` (regression mới). Read-only tham chiếu: AppLayout.tsx
  (nav filter), RequirePermission (route gating), oidc.ts (logout/401), firstPathForRole (landing).
- **Consumers**: MỌI SF khác phụ thuộc PERMISSION_MATRIX đúng; bug [PERM] từ SF khác nhận qua
  comment FI-282 (tag [PERM]).
- **Second-order (multi-dim)**: functional — 5 roles × landing/nav/route; security — deny-by-default
  (role null → can() false), 401 redirect chống lặp; UX — landing đúng role; backward-compat —
  KHÔNG reorder NAV_ROUTES (constraint firstPathForRole — landing mọi role giữ nguyên);
  skip: data (không DB), perf (không hot path), ops/business (QA sweep).
- **Alternatives**: (A) walkthrough-driven sweep trên private full stack [CHỌN — rubric mandate,
  Rule 0 3 tầng]; (B) chỉ re-run spec e2e [REJECT — không phủ 2 roles + session; vi phạm Rule 0].
- **Risks**: seam Keycloak-private realm-redirect :3020 chưa từng chạy (SF trước share :8081 +
  mint-token script); RAM 7 services + 2 containers; TTL-expiry chỉ manual checklist.

## Scope
IN: login 5 roles đúng tên ROLES qua UI thật · permission matrix ẩn-hiện nav + route gating đúng
PERMISSION_MATRIX · logout (post_logout redirect + back-button) · 401-refresh-fail redirect login
(TTL-expiry = manual checklist) · fix bug P0–P2 tìm thấy trong files sở hữu · regression spec 10xx ·
re-run 02-role-matrix verify-no-regression · nhận bug [PERM].
OUT: feature mới · đổi kiến trúc · sửa file cấm (sf11-helpers.ts, file SF khác) · thêm bảng DB ·
P3/latency (chỉ log) · fix bug ngoài domain (route lên SF chủ sở hữu).

## Quy trình mỗi flow (từ context pack)
Walkthrough = browser thật Rule 0 3 tầng (DOM→VISUAL→FLOW), spec 02-role-matrix làm CHECKLIST.
Bug → comment FI-282 template `[P<n>][<DOMAIN>] <title> / repro / expected vs actual / evidence /
fix commit / regression spec`. Fix P0–P2 ngay; >8 bug P2 → STOP + escalate epic.

## Thiết kế thực thi (self-answered clarifying)
1. **Private full stack** (rubric: KHÔNG share Kafka/Keycloak — realm redirect chỉ trỏ :3000):
   pg container riêng :55461 (volume riêng) · keycloak riêng :8182 (volume riêng, realm JSON sed
   redirect :3000→:3020) · java :50071 · go :50072 · python :50073 · bff :8086 · shell :3020 ·
   orders :3021 · fulfillment :3022. Shell env VITE_OIDC_AUTHORITY=http://localhost:8182 +
   VITE_OIDC_REDIRECT_URI=http://localhost:3020/callback. Services full-issuer (Java không derive).
   .env root KHÔNG chứa FULFILLMENT_DB_*/OIDC_*/GRPC_* (clobber class — lesson FI-281).
2. **Walkthrough matrix** (5 roles): login UI thật → landing = firstPathForRole → nav items
   ẩn-hiện đúng PERMISSION_MATRIX từng role → route permitted vào được (remote-mount) + route
   cấm thấy forbidden/403 → logout → back-button không vào lại.
3. **Session**: logout qua UI; 401-refresh-fail — simulate token hết hạn/không hợp lệ → expect
   redirect login (interceptor oidc.ts:177); TTL-expiry chỉ manual checklist (không wait thực).
4. **Bug fix**: chỉ usePermissions.tsx + nav.ts (SF-2 duy nhất được sửa); mỗi fix 1 commit;
   re-walkthrough sau fix (F7: sau FIX phải thấy PASS).
5. **Regression spec**: `e2e/tests/1000-role-matrix-regression.spec.ts` (range 10xx) — tự lập
   state, KHÔNG import sf11-helpers.ts; phủ 5 roles nav/route + logout/401-redirect smoke.

## ACCEPTANCE (từ context pack — Phase 5 kiểm từng dòng)
1. Từng walkthrough flow: đi trọn qua browser PASS (DOM+VISUAL+FLOW) hoặc bug đã fix.
2. 0 bug P0–P2 mở trong domain (bug-log comment hoàn chỉnh từng bug trên FI-282).
3. Regression specs range 10xx PASS (tự lập state).
4. verify-no-regression: 02-role-matrix re-run PASS sau fix.

## Test strategy
Browser walkthrough là gate chính (Rule 0); spec 02-role-matrix = checklist + regression base;
10xx = regression mới. Playwright chạy trên private stack qua E2E_SHELL_URL (baseURL :3020).

## Risks
- Keycloak private :8182 KC_HOSTNAME/issuer browser-reachable — verify bằng login thật trước walkthrough.
- RAM: 7 host services + 2 docker containers thêm vào main-stack đang sống — theo dõi; chỉ SF-2 đang chạy.
- Realm JSON sed phải đúng client hubstore-web (client thứ 2 rootUrl :3010 KHÔNG đụng).
