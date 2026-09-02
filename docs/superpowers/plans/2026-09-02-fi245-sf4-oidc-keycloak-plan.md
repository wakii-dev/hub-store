# Plan — FI-245 SF-4: OIDC auth thật (Keycloak) — Linear FI-249

Spec: docs/superpowers/contexts/fi245-sf-4.md (epic: fi245-postgres-production-spec.md).
Branch: VuHoi/sf-4-oidc-keycloak (worktree) → merge về story/fi245-postgres-production.

## Task 1 — keycloak-realm-import + roles/users seed
- `docker/keycloak/hubstore-realm.json` (mới): realm `hubstore` (enabled, sslRequired `none` — dev http), realm roles `Coordinator`/`WarehouseOps`/`Manager`, public client `hubstore-web` (standardFlowEnabled, PKCE S256 `pkceCodeChallengeMethod: S256`, directAccessGrantsEnabled **false** — KHÔNG ROPC, redirectUris `http://localhost:3000/*`, webOrigins `+`), protocol mapper audience `hubstore-api` (claim aud cho BFF verify), 3 users (coordinator/warehouse/manager — password literal `Password123!` DEV-ONLY, KHÔNG env-substitution), accessTokenLifespan 3600 (E2E stability).
- Acceptance: `docker compose up keycloak` → realm import log sạch; `curl` OIDC discovery 200.

## Task 2 — BFF JWKS verify + roles map + reset-password
- `config.ts`: +`oidc` block — issuer/jwks/admin base từ env (`OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUDIENCE`, `KEYCLOAK_ADMIN[_PASSWORD]` default `admin`/`admin` dev-only khớp compose), derive `/realms/hubstore` paths (issuer thật, JWKS path, admin API path). Bỏ fail-loud JWT_DEV_SECRET, fail-loud `OIDC_ISSUER` thay thế.
- `plugins/auth.ts`: `createRemoteJWKSet` (jose 6.2.10 — tự refetch unknown kid), `jwtVerify` RS256 + issuer + audience; role = `realm_access.roles` ∩ {Coordinator, WarehouseOps, Manager} (first match, unmatched → 401); sub = `preferred_username` ?? `sub`; metadata gRPC `x-user-role` giữ nguyên (services KHÔNG đổi). Public routes: `/healthz`, `/auth/reset-password` (dev-only).
- Route mới `POST /auth/reset-password` {username, newPassword} → admin token password-grant (master realm, client admin-cli) → tìm user → PUT reset-password. Comment + README DEV-ONLY (không xác minh danh tính — production cần OTP/built-in forgot-password).
- Tests: harness sinh RSA keypair (generateKeyPair + exportJWK) + serve JWKS qua http server inject được vào config; contract tests token = SignJWT RS256 với claims iss/aud/realm_access đúng; thêm case unknown-kid refetch? (coverage: 401 sai token, 401 missing role, roles map đúng).

## Task 3 — Shell OIDC login + silent renew + logout + forgot-password
- Dep `oidc-client-ts` pin `3.5.0`.
- `auth/oidc.ts` rewrite: UserManager (authority từ VITE_OIDC_AUTHORITY, clientId, redirectUri, automaticSilentRenew, loadUserInfo false, scope `openid`), helper `signInRedirect`/`completeSignIn`/`signOutRedirect`, `mapRole(claims)` (realm_access.roles ∩ KNOWN_ROLES first, null → throw), `getToken()` từ user hiện tại, đăng ký setTokenGetter + 401 interceptor (response 401 → signinRedirect) lúc init.
- `App.tsx`: session state từ OIDC user; route `/callback` → completeSignIn → navigate `firstPathForRole(role)`; boot: `getUser()` → có user hợp lệ → setRole + vào layout.
- `LoginPage.tsx`: OIDC mode — Card cùng design language, 1 button `signinRedirect` (form username/password là của Keycloak hosted page — KHÔNG ROPC); link "Quên mật khẩu".
- Forgot-password page `/forgot-password` (mới, không đụng page cũ/testid E2E): form username + password mới → `POST /auth/reset-password` → thông báo thành công → link về login. DEV-ONLY note.
- Logout trong AppLayout: `signOutRedirect` (post_logout `http://localhost:3000`).
- fake-jwt: `session.ts` stub xoá khỏi runtime (App không còn import); module `packages/shared/src/auth/fake-jwt.ts` GIỮ (unit test mock), `session.ts` xoá + tests chuyển sang oidc mock; grep đảm bảo không còn runtime import signFakeJwt.
- i18n: thêm keys login OIDC + forgot-password (vi/en).

## Task 4 — E2E auth.setup + specs + boot-all + env
- `playwright.config.ts`: +`globalSetup: './auth.setup.ts'`.
- `e2e/auth.setup.ts` (mới): login UI Keycloak thật 3 lần (coordinator/warehouse/manager — fill form Keycloak, KHÔNG ROPC) → `storageState` `.auth/{role}.json`; default storageState = coordinator.
- Specs: bỏ hàm login() stub; `01`/`03`/`04` dùng storageState coordinator; `02-role-matrix` tạo context per role từ 3 storageState. Business assertions KHÔNG đổi.
- `scripts/boot-all.sh`: +keycloak boot block (`docker compose up -d keycloak` + wait :8081 + discovery check) — SF-5 làm bootall-update đầy đủ, block này là tối thiểu để E2E chạy auth thật.
- Root `.env`: uncomment + set `VITE_OIDC_AUTHORITY/CLIENT_ID/REDIRECT_URI`, `OIDC_JWKS_URL=http://localhost:8081` (host view; compose override internal `http://keycloak:8081` giữ nguyên). `.env.example`: cập nhật comment giá trị dev.
- Acceptance: `pnpm e2e` 13/13 green qua login thật.

## Task 5 — Verify + merge + Done
- Rule 0: browser walkthrough — login coordinator → shell → role matrix 3 roles → logout → forgot-password; screenshots.
- code-reviewer độc lập trên diff SF → verdict `/tmp/story/fi245/reviewer-sf4.md`.
- Merge: parent story/fi245-postgres-production vào sf-branch → `git update-ref refs/heads/story/fi245-postgres-production HEAD` (guard merge-base + rev-list) → dest-sync main → audit comment merge-hash lên FI-249.
- `story-verify sf-4` sạch → FI-249 Done.

## Boundary
KHÔNG đổi gRPC services / compose postgres+db-seed+keycloak block / business spec assertions / ROPC / refresh-token rotation.
