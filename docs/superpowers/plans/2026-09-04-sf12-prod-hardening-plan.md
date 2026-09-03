# SF-12 Production hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng trust-boundary s2s (token passthrough + JWKS verify ở Go/Java), secrets ra khỏi git + rotate defaults, healthchecks mọi service + structured logs, CI GitHub Actions, backup/restore, reconciliation job, security final audit — KHÔNG refactor nghiệp vụ.

**Architecture:** Token passthrough (Direction A): BFF forward access token qua `authorization` metadata → Go + Java verify JWKS độc lập (RS256, cache + refetch unknown kid); internal calls (Go→Java, reconciler) dùng `INTERNAL_SERVICE_TOKEN`; allowlist grpc.health/reflection; `x-user-role` chỉ derived-sau-verify. Spec: docs/superpowers/specs/2026-09-04-sf12-prod-hardening-design.md (auth matrix §3.1, secrets sweep §3.2).

**Tech Stack:** golang-jwt/jwt/v4 (go 1.19 pin), nimbus-jose-jwt (Boot 3.5.5 managed), jose (BFF đã có), GitHub Actions, pg_dump.

**Linear Issue:** FI-257

---

## DAG tổng quan (deps)

```
T1 s2s-auth ──┬──> T5 structured-logs ──┐
T2 secrets ───┼──> T3 rotate-credentials├──> T10 reconciliation ──> T11 security-audit
              ├──> T4 healthchecks ─────┘
T6 ci-pipeline ──> T7 e2e-in-ci ─────────────────────────┘
T8 backup-cron ──> T9 restore-doc ───────────────────────┘
```

Tier 1: T1, T2, T6, T8. Tier 2: T3, T4, T7, T9. Tier 3: T5, T10. Cuối: T11. **Thực thi TUẦN TỰ trong worktree, linear commit order: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11** (plan-critic: T2/T3/T4 ĐỀU sửa docker-compose.yml — KHÔNG song song hóa nhóm này; review rolling theo nhóm: Nhóm A = T1+T2+T3+T4, Nhóm B = T5+T6+T7+T8+T9, Nhóm C = T10). T1 được phép 2-3 scoped commits (Go / Java / BFF+e2e) cùng task — blast radius quá lớn cho 1 commit.

**Commit convention:** `<type>(<scope>): SF-12 <summary> (FI-257)`. MỖI task 1 atomic commit, stage file cụ thể (KHÔNG `git add -A`).

**Guard toàn run:** KHÔNG đụng `.env` ngoài worktree này (main worktree có .env local-modified). Flyway: KHÔNG thêm migration (không cần — đã max V14). pnpm install trước typecheck. KHÔNG publish port gRPC trong compose. KHÔNG push/workflow_dispatch thật.

---

### Task 1: s2s token passthrough — interceptors Go/Java + BFF forward

**Files:**
- Modify: `services/bff-gateway/src/plugins/auth.ts` (giữ verified token trên request — kiểm tra current shape, có thể đã có), `services/bff-gateway/src/clients/grpc.ts` (metadata thêm `authorization: Bearer <token>`; signature của callSite helpers nhận token thay vì chỉ role — ripple 8 client files + routes theo compiler)
- Create: `services/batching-service/internal/server/auth_interceptor.go`
- Create: `services/batching-service/internal/server/auth_interceptor_test.go`
- Modify: `services/batching-service/cmd/server/main.go:117` (wrap interceptor), `services/batching-service/go.mod` (+golang-jwt/jwt/v4)
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/TokenAuthInterceptor.java`
- Modify: Java bootstrap nơi build Server (tìm `ServerBuilder`/devh wiring — cạnh `ActorInterceptor` registration), `application.yml` (+`oidc.issuer`, `oidc.jwks-url`, `internal-service-token` env binding), `pom.xml` (+nimbus-jose-jwt, no version)
- Test: existing Go tests dùng bare metadata → thêm flag test; Java test interceptor

**Auth matrix (contract — spec §3.1, KHÔNG tự ý đổi):**
| Credential | Hành động | Role |
|---|---|---|
| `authorization: Bearer <JWT>` hợp lệ (RS256, iss=`OIDC_ISSUER`, exp ok, JWKS khớp kid) | ALLOW | derive `realm_access.roles` → override `x-user-role` metadata; lệch → dùng claim + log warn |
| `x-internal-token` == `$INTERNAL_SERVICE_TOKEN` | ALLOW | tin `x-user-role`/`x-user-name` metadata |
| thiếu/sai | DENIED `codes.PermissionDenied` | — |

**Allowlist (pass-through, không auth):** `/grpc.health.v1.Health/`, `/grpc.reflection.v1.ServerReflection/` (cả v1alpha nếu dùng) — prefix match.

- [x] **Step 1.1:** `go get github.com/golang-jwt/jwt/v4@v4.5.2 && go mod tidy` — verify build với go 1.19 (`go build ./...`). FAIL → BLOCKED (đổi lib: lestrrat-go/jwx/v1 hoặc hand-roll RSA verify stdlib, báo coordinator).
- [x] **Step 1.2:** Go `auth_interceptor.go`: JWKS fetcher — `net/http` GET `OIDC_JWKS_URL` (env, default `http://localhost:8081/realms/hubstore/protocol/openid-connect/certs`), parse `{keys:[{kid,kty,n,e,alg}]}` → map kid→*rsa.PublicKey (base64url n/e → `rsa.PublicKey`); cache 5 phút + refetch-on-unknown-kid (1 retry, sau đó fail). Interceptor func: allowlist prefix → handler; đọc `authorization` Bearer → `jwt.Parse` RS256 + validate exp/iss (`OIDC_ISSUER` env) → derive role từ claims `realm_access.roles` (Coordinator/WarehouseOps/Manager/KTV) → set `ctx` value + rewrite metadata `x-user-role`; else `x-internal-token` check; else Denied. `AUTH_DISABLED=1` bypass nhưng `log.Printf` WARN loud mỗi 60s.
- [x] **Step 1.3:** Wire `main.go:117` — interceptor chạy TRƯỚC `RoleUnaryInterceptor` trong chain (auth derive role → role interceptor chỉ đọc). Test: valid JWT (tự ký RSA test key + kid), expired, wrong iss, internal token ok, internal token sai, không gì → Denied, health/reflection không token → pass. `go test ./internal/server/ -run Auth -v`.
- [x] **Step 1.4:** Java `TokenAuthInterceptor`: nimbus `RemoteJWKSet` + `JWSVerificationKeySelector` RS256, cache default, `SignedJWT.parse().verify()`, validate iss/exp claims; cùng allowlist + internal token + auth matrix; DENIED → `Status.PERMISSION_DENIED.asRuntimeException()`. Bind từ env qua `application.yml` (`${OIDC_ISSUER:}`, `${OIDC_JWKS_URL:}`, `${INTERNAL_SERVICE_TOKEN:}`) → inject qua constructor (bootstrap tự dựng interceptor, KHÔNG phụ thuộc Spring context — app là `web-application-type: none`). Register cạnh `ActorInterceptor` cho MỌI service đang register. Test unit: testkey JWKS fixture + matrix cases.
- [x] **Step 1.5:** BFF `clients/grpc.ts`: giữ token đã verify từ `request.authVerify`/`request` (đọc shape hiện có ở `plugins/auth.ts` — token object nằm đâu thì dùng đó); metadata build thêm `authorization: Bearer <raw token>`. Ripple: các hàm helper hiện nhận `role` — đổi nhận `{token, role}` hoặc đọc từ AsyncLocalStorage nếu helper spread quá rộng (chọn phương án diff nhỏ nhất, compiler dắt). `pnpm --filter bff-gateway exec tsc --noEmit` sạch.
- [x] **Step 1.6:** Fix test hồi quy: Go unit tests bare-metadata (`batching_test.go`, `delivery_batch_server_test.go`, `internal/mockfulfillment/`) → set `AUTH_DISABLED=1` trong test bootstrap (không đụng assertion); `e2e/backend-integration.ts` → mint token thật (pattern `e2e/scripts/mint_*.py` hoặc password grant script có sẵn) rồi gắn metadata. Java tests tương tự (`AUTH_DISABLED` env trong test setup).
- [x] **Step 1.7:** Verify acceptance: boot stack local (host-run) → `grpcurl -plaintext 127.0.0.1:50051 list` (reflection OK không token) → gọi method không token → PERMISSION_DENIED; có token mint → OK. `go build ./... && go test ./... && mvn -q test && pnpm typecheck`.
- [x] **Step 1.8:** Commit: `feat(s2s): SF-12 token passthrough — Go/Java JWKS interceptors + BFF forward + internal token (FI-257)`.

### Task 2: secrets out of git — .env untrack + gitignore + env wiring

**Files:**
- Modify: `.gitignore` (+`.env` — hiện chỉ ignore `.env.local`), `.env.example` (đổi giá trị thật còn sót → placeholder, đọc Task 3 sweep list)
- Untrack: `.env` — `git rm --cached .env` (file trên đĩa GIỮ NGUYÊN trong worktree này)
- Modify: `docker-compose.yml` — mọi secret qua `${VAR:?}` hoặc `${VAR:-dev-default-mới}` (chỉ default cho giá trị đã rotate ở Task 3, KHÔNG default cho POSTGRES_PASSWORD — giữ `:?`)

- [x] **Step 2.1:** `git ls-files | grep -E '^\.env'` — xác nhận .env tracked. `.gitignore` thêm `.env` (giữ `.env.local`, `.env.*.local`). `git rm --cached .env` + verify `git status` shows deletion staged, file vẫn tồn tại trên đĩa (`ls -la .env`).
- [x] **Step 2.2:** `.env.example`: `JWT_DEV_SECRET`/`VITE_JWT_DEV_SECRET` đang là hex thật → đổi thành placeholder rỗng + comment "điền local, KHÔNG commit"; thêm `INTERNAL_SERVICE_TOKEN=` placeholder; `OIDC_JWKS_URL`/`OIDC_ISSUER` cho Go/Java (issuer `http://localhost:8081`, jwks trong compose `http://keycloak:8081/realms/hubstore/...` — 2 giá trị KHÁC nhau, gotcha BFF compose:204).
- [x] **Step 2.2b:** README thêm mục "Fresh clone setup" (spec §3.2): `cp .env.example .env` → điền `POSTGRES_PASSWORD` + `INTERNAL_SERVICE_TOKEN` (+ secrets khác theo bảng) → `docker compose up --build`. 1 đoạn ngắn, đặt trên mục Deploy.
- [x] **Step 2.3:** `docker-compose.yml`: fulfillment + batching service env thêm `OIDC_ISSUER`, `OIDC_JWKS_URL=http://keycloak:8081/...`, `INTERNAL_SERVICE_TOKEN=${INTERNAL_SERVICE_TOKEN:-}`, `HEALTH_PORT` (8083/8082). KHÔNG publish thêm port mới ra host ngoài health ports cần thiết.
- [x] **Step 2.4:** Verify: `git status` sạch về .env (chỉ staged deletion); `git check-ignore .env` → match; fresh-clone simulation: `GIT_SSH_COMMAND=: git archive HEAD | ...` không cần — chỉ verify index không còn .env: `git ls-files | grep -c '^\.env$'` → 0. compose config vẫn parse: `docker compose config -q` (cần .env local có giá trị — worktree này đã có .env từ base).
- [x] **Step 2.5:** Commit: `chore(secrets): SF-12 untrack .env + gitignore + placeholder sweep + compose env wiring (FI-257)`.

### Task 3: rotate credentials — new defaults + rotation runbook

**Files:**
- Modify: `docker/keycloak/hubstore-realm.json` (:191 admin client secret + :206-314 7 user passwords `"Password123!"`), `docker-compose.yml` (lockstep defaults), `.env.example` (lockstep), README.md (dev credentials section + rotation runbook)
- **Lockstep e2e credentials (plan-critic P0):** `e2e/auth.setup.ts:22` (PASSWORD hardcoded `Password123!`), `e2e/tests/02-role-matrix.spec.ts:76`, `e2e/tests/05-users.spec.ts:82`, `e2e/tests/05-dashboard.spec.ts:163`, `e2e/walkthrough-sf18.ts:25` — đổi cùng đợt (tốt nhất: extract vào 1 constants file `e2e/lib/credentials.ts` import thay literal, hoặc đọc env `E2E_PASSWORD` với default mới)

- [x] **Step 3.1:** Sinh giá trị mới (openssl rand -hex 16 style): admin client secret mới; mỗi 7 user 1 password dev mới KHÁC nhau (ghi bảng vào README "Dev credentials (KHÔNG dùng prod)"). Chọn 1 password chung cho e2e users nếu e2e specs fill literal — cập nhật e2e files ở Step 3.2b.
- [x] **Step 3.2:** Sửa realm JSON: `"secret"` admin + `credentials[].value` 7 users ( realm import hash format giữ nguyên — plain value KC tự hash khi import). Sửa compose + .env.example cùng giá trị (lockstep — 1 commit).
- [x] **Step 3.2b:** Cập nhật e2e credentials lockstep: extract `Password123!` từ 5 file trên vào `e2e/lib/credentials.ts` (hoặc env) — mọi spec login vẫn pass sau rotate (`pnpm --filter e2e exec tsc --noEmit` nếu có).
- [x] **Step 3.3:** README: mục "Secrets & rotation runbook" — bảng secret → nơi phải đổi đồng bộ (realm JSON / compose / .env.example / .env local) + quy trình rotate prod-style (từng secret 1 đoạn ngắn).
- [x] **Step 3.4:** Verify: Keycloak import thành công với realm JSON mới (boot keycloak compose service hoặc docker run --import-realm một lần) → login 1 user bằng password mới qua token endpoint (password grant hoặc PKCE script `e2e/scripts/`). `git diff` chỉ chứa file đã liệt kê.
- [x] **Step 3.5:** Commit: `chore(secrets): SF-12 rotate dev defaults — realm admin+7 users, lockstep compose/env.example, rotation runbook (FI-257)`.

### Task 4: healthchecks — /health mọi service + compose wiring

**Files:**
- Modify: `services/bff-gateway/src/app.ts` (/healthz → /health + DB ping cả 2 pool; giữ /healthz alias), **`services/bff-gateway/src/plugins/auth.ts` — thêm `/health` vào public skip-list (global onRequest hook :58 — không thêm → compose probe 401, stack boot deadlock)**, ripple `bff.contract.test.ts`, `server.ts`, `scripts/k8s-deploy.sh:31` nếu đổi path
- Modify Go: `cmd/server/main.go` (+HTTP health server port `${HEALTH_PORT:8082}` — handler ping pgx pool `SELECT 1`)
- Modify Java: bootstrap (+`com.sun.net.httpserver.HttpServer` port `${HEALTH_PORT:8083}`, handler ping DataSource `SELECT 1`, JSON `{status,db}`)
- Modify: `services/print-service/print_service/server.py` (+`/health` liveness JSON)
- Modify: `docker-compose.yml` (healthcheck mỗi app service; Java probe không giả định curl — cài curl vào `services/fulfillment-service/Dockerfile` HOẶC bash /dev/tcp; Go/BFF alpine busybox wget)
- Test: BFF contract test /health

- [x] **Step 4.1:** BFF: `/health` mới — `await pool1.query('SELECT 1')` + pool2 (đọc wiring DB hiện có trong bff — nếu BFF không có pg pool trực tiếp thì health check qua gRPC ping fulfillment, ghi rõ choice); response `{status:'ok'|'degraded', db:{fulfillment,batching}}`, 200/503. `/healthz` alias giữ (contract test không vỡ). **Thêm `/health` vào skip-list public của `plugins/auth.ts` (:58)** — KHÔNG thì compose probe 401. Update test assert db shape.
- [x] **Step 4.2:** Go: health server tách file `internal/server/health_http.go` — start goroutine, graceful shutdown; ping `store.Pool().Ping(ctx)`. Java: `HealthHttpServer` class nhỏ cạnh bootstrap — start sau Spring context sẵn sàng, ping `jdbcTemplate.queryForObject("SELECT 1")`. Print: FastAPI/Flask route `/health` `{"status":"ok"}`.
- [x] **Step 4.3:** compose healthchecks: mỗi app service `test:` probe /health tương ứng image (Java: cài curl trong Dockerfile — 1 dòng apt-get; interval 10s timeout 5s retries 5 start_period 30s Java / 15s còn lại).
- [x] **Step 4.4:** Verify: boot từng service host-run → `curl -s localhost:<port>/health | jq` đúng shape; compose config parse. `go test ./... && mvn -q test && pnpm --filter bff-gateway test`.
- [x] **Step 4.5:** Commit: `feat(health): SF-12 /health endpoints 4 services + compose healthcheck wiring (FI-257)`.

### Task 5: structured logs — JSON trên đường s2s/health

**Files:**
- Modify: `services/bff-gateway/src/kafka/consumer.ts:86` (console.log → app.log), grep hết `console.log` còn lại trong `services/bff-gateway/src/**` (tokens/role/auth path ưu tiên)
- Create Go: `internal/logging/logging.go` (JSON line emitter: `logger.JSON(level, msg, kv...)` — tiny, go 1.19 không có slog)
- Modify Go: log.Printf trong `main.go` + `auth_interceptor.go` + reconcile (Task 10 dùng luôn)

- [x] **Step 5.1:** Go logging helper ~40 LOC: struct `{ts,level,msg,...kv}` → `json.Marshal` → stdout. Replace log.Printf ở main.go/auth path (KHÔNG sweep toàn repo — chỉ đường auth/health).
- [x] **Step 5.2:** BFF: thay console.log bằng app.log (Fastify `app.log` — shape JSON sẵn). Grep xác nhận 0 console.log còn trong src auth/kafka path.
- [x] **Step 5.3:** Java: KHÔNG đổi (logback đã structure được) — ghi 1 dòng trong README ops section "Java logs: logback, cấu hình JSON encoder là follow-up nếu cần".
- [x] **Step 5.4:** `go test ./... && go build ./... && pnpm --filter bff-gateway test`. Commit: `feat(logging): SF-12 structured JSON logs — Go helper + BFF console.log sweep (FI-257)`.

### Task 6: CI pipeline — lint + unit + docker build

**Files:**
- Create: `.github/workflows/ci.yml`

- [x] **Step 6.1:** Workflow: `on: pull_request` + `push: branches: [main]`. Job `unit`: matrix steps trong 1 job — node20 + pnpm (cache pnpm store), `pnpm install --frozen-lockfile`, `pnpm -r lint` (nếu có lint script — kiểm root package.json; không có → `tsc --noEmit` per FE/BFF), `pnpm -r test` **--filter loại trừ e2e package (e2e có script test → sẽ trigger Playwright trong unit job — kiểm và exclude)**; setup-go 1.19 + `go vet ./... && go test ./...` (working-directory services/batching-service); setup-java 17 temurin + `mvn -B test` (working-directory services/fulfillment-service).
  - Thực tế: root `lint` = `turbo run lint` no-op (0 package có lint script) → tsc --noEmit. e2e package `@hub-store/e2e` KHÔNG có script `test` (chỉ `e2e`/`backend-integration`) — vẫn exclude bằng filter list tường minh. `apps/fulfillment` LOẠI khỏi typecheck (tsc debt có sẵn — axios types, antd data-testid, PrintPage typing; follow-up riêng) nhưng vẫn chạy unit tests (83/83 xanh).
- [x] **Step 6.2:** Job `docker-build`: docker build mỗi Dockerfile (tìm `**/Dockerfile` — compose dùng images nào thì build nấy, `docker build -t ci-<name> <ctx>`), KHÔNG push.
  - 5 Dockerfile: Dockerfile.web + 4 services — TẤT CẢ context là repo root (COPY api/proto/gen/*) → `docker build -f <path> -t ci-<name> .` (needs: unit).
- [x] **Step 6.3:** Env cho tests không cần DB thật: Go tests đã skip-when-no-DB; Java integration test skip khi không DB (pattern SF-2 có sẵn) — verify bằng cách đọc test setup, ghi vào PR comment nếu cần env giả.
  - Verified: Go `internal/store` t.Skip khi ping fail + SMOKE_ADDR-gated; Java *IT không chạy trong `mvn test` (surefire default excludes *IT) VÀ có @BeforeAll connectOrSkip — không cần env giả, comment giải thích trong ci.yml.
- [x] **Step 6.4:** Validate YAML cục bộ (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`). Commit: `ci(sf-12): GitHub Actions — lint + unit (node/go/java) + docker build per PR (FI-257)`.
  - YAML OK (venv pyyaml — PEP 668 chặn pip --user). Local verify: tsc 6 packages CLEAN, node tests 911/911 xanh (7 packages), go vet+test ok.

### Task 7: E2E trong CI (E2E=1)

**Files:**
- Modify: `.github/workflows/ci.yml` (+job `e2e` needs unit)

- [x] **Step 7.1:** Job e2e: services `postgres:16` (health cmd pg_isready, 2 DB tạo ở boot step qua psql) + keycloak — GH services KHÔNG support command override → boot keycloak bằng step `docker run -d --name keycloak -p 8081:8080 -e KEYCLOAK_ADMIN -e KEYCLOAK_ADMIN_PASSWORD quay.io/keycloak/keycloak:23 start-dev --import-realm -v $(pwd)/docker/keycloak:/opt/keycloak/data/import` (đọc image tag/keycloak version đang dùng trong compose — dùng CÙNG version).
  - Done: services postgres:16.4 (CÙNG tag compose, health pg_isready); keycloak docker run quay.io/keycloak/keycloak:26.0 (CÙNG version compose). OIDC env dùng FULL realm URL cho cả BFF/Go/Java (BFF withRealm idempotent) — base-vs-full gotcha đã fix sau local seam (403 root-cause).
- [x] **Step 7.2:** Steps: checkout, pnpm install, `pnpm playwright install --with-deps chromium`, migrations + seed (scripts có sẵn — `scripts/migrate`/`seed-db.sh` pattern, chạy qua docker hoặc host tools như boot-all.sh làm), `E2E=1 pnpm --filter <e2e-package> exec playwright test` (đọc e2e package name + webServer config — boot-all.sh cần Postgres/Keycloak env trỏ tới services/containers; set env tương ứng private-port seam nếu boot-all hardcode).
  - Done: create-2-DB + flyway + golang-migrate + seed gộp vào `scripts/ci-e2e-boot.sh` (chạy trong workflow + dùng lại local). webServer mặc định boot-all.sh: PGHOST-mode làm wait-db/reset-db/seed-db đi psql trực tiếp (compose up fail do port conflict bị boot-all ignore). Spec subset mặc định 03-audit (đọc-là-chính), widen qua E2E_CI_SPECS.
- [x] **Step 7.3:** Ghi rõ trong comment + README CI section: job này cần 1 lần tinh chỉnh khi chạy thật trên GH runner (không verify được từ local) — nhưng CI-mode boot script phải chạy được cục bộ: tạo `scripts/ci-e2e-boot.sh` mô phỏng (boot postgres+keycloak containers + migrations + seed + env export) VÀ chạy thử nó cục bộ bằng cách chạy specs 1 file (`playwright test login.spec`) để chứng minh seam sống.
  - Verified local: (1) `bash scripts/ci-e2e-boot.sh` GREEN — postgres-ci :55441 + keycloak-ci :18081, 2 DB migrated + seeded + realm hubstore ready; (2) spec `03-audit.spec.ts` 2/2 PASSED trên stack full OIDC wiring. Phát hiện (đã fix trong ci.yml): .env local giữ OIDC_ISSUER base (BFF) nhưng Java/Go host-run cần FULL realm URL — nếu dùng base, Java deny mọi Bearer → D1 empty (root-cause lần chạy đầu fail).
- [x] **Step 7.4:** Commit: `ci(sf-12): E2E job E2E=1 — keycloak import-realm step + ci-e2e-boot script (FI-257)`.

### Task 8: backup script + cron wiring

**Files:**
- Create: `scripts/backup-db.sh` (pattern theo `scripts/seed-db.sh` — docker exec pg_dump)
- Modify: README.md (cron wiring: systemd user timer + crontab)

- [x] **Step 8.1:** Script: `set -euo pipefail`; đọc POSTGRES_CONTAINER (default `hub-store-postgres-1` — verify tên container thật từ compose), POSTGRES_USER từ env; dump 2 DB: `docker exec <c> pg_dump -U <user> -d <db>` → gzip → `backups/<db>-$(date +%Y%m%d-%H%M%S).sql.gz`; mỗi DB fail-loud (set -e + check file size >0); retention: `ls -1t backups/<db>-*.sql.gz | tail -n +$((KEEP+1)) | xargs rm -f` với `BACKUP_KEEP=${BACKUP_KEEP:-7}`; tạo `backups/` nếu thiếu + gitignore `backups/`.
  - Done: script + fallback resolve container qua `docker compose ps -q postgres`; pipefail giữ exit code pg_dump; retention while-read (an toàn hơn xargs BSD empty-input); fail per-DB ghi FAILED[] rồi exit 1.
- [x] **Step 8.2:** README "Backup": crontab line (`0 2 * * * cd <repo> && BACKUP_KEEP=7 bash scripts/backup-db.sh >> backups/backup.log 2>&1`) + systemd user timer snippet (service + timer unit nội dung đầy đủ).
  - Done: mục "### Backup tự động (SF-12)" trong section Backup / Restore — crontab + 2 unit systemd + linger note.
- [x] **Step 8.3:** Verify THẬT: compose postgres đang chạy → `bash scripts/backup-db.sh` → `gunzip -t backups/*.sql.gz` OK + `gunzip -c <file> | head -30` thấy CREATE TABLE. Commit: `feat(backup): SF-12 backup-db.sh pg_dump 2 DB gzip retention + cron/systemd doc (FI-257)`.
  - Verified: hub-store-postgres-1 healthy → fulfillment 13K (20 CREATE TABLE), batching 3.2K (8 CREATE TABLE); gunzip -t OK; BACKUP_KEEP=1 x2 → còn đúng 1 file/DB; POSTGRES_USER=bogus → exit 1 + message rõ + file rác dọn.

### Task 9: restore doc

**Files:**
- Modify: README.md (mục "Restore" dưới Backup)

- [ ] **Step 9.1:** Doc restore từng DB RIÊNG (cùng cluster): stop apps (docker compose stop fulfillment batching bff) → `docker exec -i <c> psql -U <user> -c "DROP DATABASE fulfillment WITH (FORCE); CREATE DATABASE fulfillment;"` (chú thích: FORCE chỉ PG13+; KHÔNG đụng batching) → `gunzip -c backups/fulfillment-<ts>.sql.gz | docker exec -i <c> psql -U <user> -d fulfillment` → lặp cho batching → start apps (migrate-on-boot idempotent + seed-verify tự kiểm) → verify `curl :8080/health` + D1 thấy ORD-3001.
- [ ] **Step 9.2:** Verify: chạy theo doc 1 lần cục bộ (restore vào lại chính nó) — thành công mới tick. Commit: `docs(restore): SF-12 restore runbook 2-DB cùng cluster (FI-257)`.

### Task 10: reconciliation job — PREPARING orphans

**Files:**
- Create: `services/batching-service/internal/reconcile/reconcile.go`, `reconcile_test.go`
- Modify: `cmd/server/main.go` (start ticker nếu `RECONCILE_INTERVAL` > 0, goroutine + graceful stop)

- [ ] **Step 10.1:** Logic: mỗi tick — gọi Java `FilterOrders(batch_statuses=[PREPARING])` qua fulfillment client CÓ SẴN (`internal/fulfillment/client.go`, metadata internal token + `x-user-name: reconciler`) → với từng fulfill_code: query batching DB `SELECT 1 FROM batches WHERE ... ACTIVE-trạng thái ... AND đơn chứa fulfill_code` (đọc schema batches/orders-in-batch thật từ migration — bảng mapping fulfill_code↔batch có thể là cột JSONB/array hoặc bảng con; dùng đúng shape) → nếu KHÔNG có batch ACTIVE chứa code: gọi Java revert (`UpdateOrderBatchStatus`-style path mà CancelBatch dùng — pattern `batching_server.go:335`) + log warn JSON `{orphan: code}`.
- [ ] **Step 10.2:** Ticker: `time.NewTicker(interval)`, skip tick nếu tick trước chưa xong (mutex/atomic), `RECONCILE_INTERVAL` env seconds, default 0 = không start. Context cancel → stop.
- [ ] **Step 10.3:** Test với testdb harness: seed order PREPARING không batch → 1 tick → reverted NOT_PREPARED + activity_log row actor=reconciler; order PREPARING có batch ACTIVE → untouched; chạy tick 2 lần → idempotent (0 revert lần 2); batch CANCELLED chứa code → VẪN revert (orphan criteria). `go test ./internal/reconcile/ -v`.
- [ ] **Step 10.4:** Commit: `feat(reconcile): SF-12 PREPARING-orphan reconciler ticker — cross-DB check + revert qua Java + activity_log (FI-257)`.

### Task 11: security final audit (coordinator-dispatched, không code)

- [ ] **Step 11.1:** Dispatch `security-audit` agent trên toàn diff `story/fi245-postgres-production...HEAD` (SF-1..12) — focus: s2s token/mTLS rationale + auth matrix, secrets không log, least-privilege interceptor allowlist, .env history/xử lý khi remove, CI secrets, backup script injection (container name từ env — eval risk), reconciler internal token usage.
- [ ] **Step 11.2:** P0/P1 findings → fix task nhỏ (inline hoặc dispatch executor) → re-audit điểm đó. P2 → note Linear.
- [ ] **Step 11.3:** Verdict ghi comment FI-257 + tick checkbox này.

---

## Testing strategy (tổng)

- Unit: Go auth interceptor + reconciler + logging; Java TokenAuthInterceptor; BFF /health + contract.
- Integration: reconciler qua testdb; health ping DB thật host-run.
- E2E: full specs không hồi quy (login + D1 + auth flow); backend-integration.ts mint token.
- Manual/acceptance: gRPC denied không token (host-run), .env out of index, backup/restore follow-doc, compose config parse.

## Risks (từ spec §6 — executor đọc trước Task liên quan)

1. `.env` untrack merge conflict khi merge-ngước — xử lý ở Phase 5 merge (coordinator), KHÔNG phải việc của executor.
2. go 1.19 + golang-jwt/v4 — Step 1.1 probe NGAY đầu; fail → BLOCKED sớm.
3. Java non-web — interceptor + HttpServer nhúng, KHÔNG spring-security auto-config.
4. CI E2E không verify thật trên GH runner — cục bộ chạy ci-e2e-boot seam.
5. Realm rotate lockstep 3 nơi — 1 commit Task 3, verify import sau đổi.
6. security-audit có thể bắn P0/P1 vào SF cũ — budget fix trước Done.
