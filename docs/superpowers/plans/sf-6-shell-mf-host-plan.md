# SF-6 Plan — Shell app MF host (FI-236)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3 SF-6) · Context pack: docs/superpowers/contexts/sf-6.md · Epic: FI-233
> Worktree: sf-6-shell-mf-host (fork/merge qua story/fi233-polyglot-grpc-mf — KHÔNG đụng main)
> Base: skeleton SF-1 đã merge (App.tsx tối thiểu + RemoteBoundary + i18n init + vite federation config đọc remotes.config.json).
> Federation verdict SPIKE 1 = source of truth: @module-federation/vite 1.21.1 + vite 5.4.19 PINNED — KHÔNG đổi plugin/version.
> Design: production-clone tokens §7 (sidebar 48px, header 55px, #EB6E09, Roboto) — không Figma.

## Meta (không checkbox)
- Boundary: CHỈ apps/shell/** (+ .env thêm VITE_ keys additive). KHÔNG đụng exposes contract, remotes.config.json, packages/*, apps/orders|fulfillment nội dung.
- Rolling review: code-reviewer ĐỘC LẬP trên diff toàn SF trước merge.
- Browser verify Rule 0: 3 tầng (DOM đo / screenshot so tokens / flow login→role-switch→gating→remote-fallback→logout).
- Merge: no-ff vào story/fi233-polyglot-grpc-mf (merge-ngược + update-ref FULL refname + ancestor-guard), audit comment merge-hash lên FI-236.
- Linear FI-236 → Done CHỈ SAU story-verify sạch.

## Tasks

- [x] Task 1 — mf-host base: xác nhận skeleton federation host hoạt động (vite config đọc remotes.config.json + lazy imports + RemoteBoundary). Không đổi exposes contract. (đã có từ SF-1 — verify + ghi nhận)
- [x] Task 2 — app-layout: AppLayout đầy đủ theo tokens §7 — sidebar 48px dark (#001529) nav icon+tooltip filter theo permission, header 55px trắng (title / VI-EN toggle / role switcher / user / logout), FPT orange + Roboto (LESS modifyVars có sẵn), main mount region.
- [x] Task 3 — router-dynamic-remotes: giữ routes `/hub-store-order/order|batch|batch/print` + 404 + fallback remote chết; nested trong AppLayout.
- [x] Task 4 — auth-stub-role-switcher: src/auth/session.ts (signIn/restore/signOut, session persist localStorage, signFakeJwt HS256 {sub, role}); LoginPage (chọn role + username → login); RoleSwitcher header (3 roles — switch = re-sign token + setRole + navigate về route được phép); oidc.ts đọc VITE_OIDC_* env.
- [x] Task 5 — set-token-getter: shell init đăng ký setTokenGetter(() => session token) vào api-client singleton trước render.
- [x] Task 6 — i18next-init-namespaces: shell ns thêm keys auth.* / nav.* / 403; VI gốc + EN; toggle persist LANG_STORAGE_KEY (có sẵn).
- [x] Task 7 — antd-theme-wrap: ConfigProvider (locale theo lang) wrap toàn app đã có từ skeleton — giữ; verify theme bằng .ant-btn-primary bg #EB6E09.
- [x] Task 8 — route-gating-roles: RequirePermission (can() ? children : Result 403) ở tầng shell route mount; nav filter theo PERMISSION_MATRIX §2 (Coordinator D1+D2+Print; WarehouseOps D2+Print; Manager all).
- [x] Task 9 — notfound: giữ Result 404 (có sẵn); unit tests: session sign/restore/expire, token-getter, gating 3 roles, nav filter, 404, fallback remote.
- [x] Task 10 — smoke-remotes + verify + review + merge: boot 3 dev servers (shell :3000 + orders :3001 + fulfillment :3002) — browser verify 3 tầng ACCEPTANCE; code-reviewer ĐỘC LẬP; verifier; merge no-ff story branch; audit comment FI-236.
