# SF-12 Production hardening — Design spec (FI-257)

Epic: FI-245 (story/fi245-postgres-production). Context pack: docs/superpowers/contexts/fi245-sf-12.md. Phase 0 analysis: Linear FI-257 comment 2026-09-04.
Status: Approved (autonomous — epic-level questions answered per start prompt; residuals self-answered from codebase probes, flagged below).

## 1. Problem

Trust boundary hiện kết thúc ở BFF: BFF verify JWT thật nhưng hạ identity xuống `x-user-role`/metadata — mọi host chạm được gRPC port đều giả role được (Go tin mù `batching_server.go:536-548`, Java không có auth interceptor). Secrets mặc định còn nằm trong git (`.env` git-tracked với `POSTGRES_PASSWORD` committed ở 50f1df6; `hubstore-realm.json:191` literal admin secret). Không CI, không backup script, không healthcheck app services, không reconciliation cho saga-drift. SF-12 đóng tất cả mà KHÔNG refactor nghiệp vụ.

## 2. Scope

**In:** s2s auth (passthrough), secrets out of git + rotate, healthcheck endpoints + compose wiring, structured logs (những chỗ console.log/log.Printf dây dưa trên đường s2s/health), CI workflow file + scripts, backup script + cron doc, restore doc, reconciliation job, security final audit toàn diff FI-245.

**Out (boundary):** TLS domain thật/HA/k8s/helm; vault thật; refactor nghiệp vụ; git-history rewrite (acceptance yêu cầu "git history không còn secrets MẶC ĐỊNH MỚI" — untrack từ bây giờ, không rewrite lịch sử cũ); publish gRPC ports trong compose (vẫn `expose` — acceptance "gọi thẳng :50051" áp dụng host-run mode); print-service (Python, không DB) chỉ liveness healthcheck.

## 3. Quyết định kiến trúc (flagged per CREATIVITY:BALANCED)

### 3.1 s2s auth — TOKEN PASSTHROUGH (Direction A)

**Rationale (ghi vào README + Linear):**
- JWKS verify pattern đã proven trong repo (BFF `plugins/auth.ts` jose createRemoteJWKSet, refetch unknown kid, cooldown 100ms) →reuse ở 2 service, diff nhỏ.
- mTLS: cert CA + per-service cert + volume + Dockerfiles + dev-run SAN pain = 3-4x blast radius, vi phạm boundary "LIGHT touch"; repo không có TLS precedent.
- Internal calls (Go→Java hydration/mutate/revert + reconciler ticker) KHÔNG có user token → chấp nhận qua **`INTERNAL_SERVICE_TOKEN`** env (random ≥32 hex, đặt trong .env local + .env.example placeholder; interceptor nhận (1) user JWT hợp lệ HOẶC (2) internal token khớp env; không có cả hai → DENIED). Fail-closed. Đây là secret thứ 3 trong sweep "no default secrets" — rotate cùng đợt.

**Chi tiết:**
- BFF: `clients/grpc.ts` thêm `authorization: Bearer <access token>` vào metadata (token đã verify ở `plugins/auth.ts`, giữ trên request). `x-user-role` giữ nguyên nghĩa cho Java/Go NHƯNG chỉ được tin khi auth interceptor đã verify xong token (role derived từ `realm_access.roles` — interceptor tự derive và so; nếu metadata role ≠ claim role → dùng claim role, log warn). BFF KHÔNG còn derive-only.
- Go batching: new `internal/server/auth_interceptor.go` — fetch JWKS từ `OIDC_JWKS_URL` (env), cache + refetch unknown kid (tự viết JWKS fetch stdlib + `golang-jwt/jwt/v4` v4.5.x — tương thích go 1.19 pin, vetted parsing, tránh hand-roll crypto). Verify: RS256, iss (từ `OIDC_ISSUER` — giá trị trong JWT claim), exp. Accept internal token. Wrap vào interceptor chain tại `main.go:117`.
- Java fulfillment: new `TokenAuthInterceptor` cạnh `ActorInterceptor` — `com.nimbusds:nimbus-jose-jwt` (version managed bởi Boot 3.5.5 parent). Cùng contract: RS256 JWKS cache + refetch unknown kid, iss/exp, accept internal token. Khởi động trong `ServerBuilder` với mọi service đang register.
- **Allowlist (KHÔNG auth)** cho gRPC infra methods — cả Go và Java: `/grpc.health.v1.Health/*`, `/grpc.reflection.v1.ServerReflection/*` (v1alpha variant nếu dùng). Không allowlist → grpc-health-smoke.sh + readiness gate + grpcurl vỡ ngay. Test case bắt buộc: "health call không token → OK".
- **Auth matrix (contract chốt):**

| Credential trong metadata | Hành động | Role source |
|---|---|---|
| `authorization: Bearer <JWT>` hợp lệ | ALLOW | derive từ `realm_access.roles`; `x-user-role` metadata KHÔNG được tin — override bằng claim, warn nếu lệch |
| `x-internal-token` khớp `INTERNAL_SERVICE_TOKEN` env | ALLOW | tin `x-user-role` metadata nếu kèm theo (caller chịu trách nhiệm — có secret = đã qua trust); không kèm → role rỗng |
| không có / sai | DENIED (permission denied) | — |

  - Reconciler revert: `x-internal-token` + `x-user-name=reconciler` (actor ghi activity_log).
  - Go→Java outbound (`internal/fulfillment/client.go`): forward internal token khi ctx không có user token; nếu ctx có user token (luồng BFF đi qua) forward Bearer đó.
  - `AUTH_DISABLED=1` chỉ cho unit-test harness: binary phải log WARN loud khi flag bật, compose KHÔNG định nghĩa biến này.
- Env mới: `OIDC_ISSUER` (giá trị trong JWT claim — `http://localhost:8081`), `OIDC_JWKS_URL` (URL mạng thật — trong compose là `http://keycloak:8081`, KHÔNG derive từ issuer — same gotcha BFF đã xử lý ở compose :204-206), `INTERNAL_SERVICE_TOKEN` (≥32 hex random, placeholder trong .env.example, giá trị thật trong .env local).
- Test escape hatch: `AUTH_DISABLED=1` CHỈ cho unit test in-process (Go tests + Java tests); compose/CI E2E KHÔNG BAO GIỜ set flag này (guard: compose không có biến này; CI E2E dùng token thật mint từ Keycloak — precedent `e2e/auth.setup.ts`). Document trong README.
- E2E hiện gọi gRPC trực tiếp với bare metadata (`e2e/backend-integration.ts`, Go unit tests) → chuyển mint token thật (script mint có sẵn) hoặc qua BFF; flag AUTH_DISABLED=1 chỉ trong unit-test harness.

### 3.2 Secrets out of git + rotate

- `.gitignore` thêm `.env` (hiện chỉ ignore `.env.local`); `git rm --cached .env` trong worktree này.
- `.env.example` giữ placeholder (đã đúng pattern) — thêm `INTERNAL_SERVICE_TOKEN`, sweep default secrets: `KC_ADMIN_CLIENT_SECRET` (đổi default mới), realm JSON `hubstore-realm.json:191` admin client secret literal (đổi giá trị mới, lockstep compose default), **7 realm user passwords** `hubstore-realm.json:206-314` hiện đều `"Password123!"` (đổi mỗi user giá trị khác nhau — dev-only, ghi giá trị mới trong README dev section), `JWT_DEV_SECRET`/`VITE_JWT_DEV_SECRET` (`.env.example` đang commit hex THẬT không phải placeholder — đổi thành placeholder), `WEBHOOK_HMAC_SECRET` default (đổi), `KEYCLOAK_ADMIN_PASSWORD` dev default trong compose (đổi).
- **Rotate = đổi giá trị default mới** cho dev stack (không có credentials thật để rotate — ghi quy trình rotate cho prod trong README: đoạn "Rotation runbook" liệt kê từng secret + nơi phải đổi đồng bộ).
- ⚠ Merge plan: main worktree có `.env` local-modified — KHÔNG đụng file ngoài worktree; untrack chỉ trên branch này, merge-ngước xử lý (xóa .env khỏi index của dest branch khi merge, file local giữ nguyên trên đĩa).
- README: fresh-clone flow (copy .env.example → điền) trước compose up.

### 3.3 Healthchecks

- Mỗi service HTTP `/health` trả JSON `{status, db: ok|down}` (200/503):
  - BFF (Node): thay `/healthz` liveness-only → `/health` ping pg pool (2 DB) — cập nhật compose healthcheck; ripple: `bff.contract.test.ts:23-25`, `server.ts`, `scripts/k8s-deploy.sh:31` (giữ `/healthz` làm alias nếu rẻ hơn — quyết định khi implement, không vỡ test là được).
  - Go batching: HTTP side-port `:8082` (env `HEALTH_PORT`) `/health` ping pgx pool.
  - Java fulfillment: HTTP side-port riêng `HEALTH_PORT` default **8083** (8081=Keycloak `KC_HTTP_PORT`, 8082=Go health) — app là `web-application-type: none` → nhúng `com.sun.net.httpserver.HttpServer` nhẹ trong bootstrap (không thêm spring-web) ping DataSource `SELECT 1`.
  - Print (Python): liveness-only.
- **Probe method per image** (Java base `eclipse-temurin:17-jre` KHÔNG có curl/wget — Ubuntu base): Java Dockerfile cài curl, hoặc dùng probe `bash -c 'exec 3<>/dev/tcp/localhost/8083 ...'` — quyết định khi implement, spec yêu cầu: compose healthcheck KHÔNG giả định curl có sẵn. Go/BFF alpine: busybox wget OK.
- compose: healthcheck mỗi app service (interval 10s, start_period theo boot time), app depends_on postgres: condition service_healthy (đã có), chuỗi wiring nhẹ.
- Structured logs: BFF `console.log` còn lại → `app.log` JSON; Go `log.Printf` → slog-style JSON helper nhỏ (go 1.19 không có slog stdlib — helper tự viết emit JSON line); Java Spring đã log qua logback — cấu hình JSON encoder chỉ nếu nhẹ, không bắt buộc (out nếu vượt scope). Phạm vi: NHỮNG chỗ dây dưa trên đường s2s/health/reconciler, không sweep toàn repo.

### 3.4 CI (`.github/workflows/ci.yml` — file only, KHÔNG push/dispatch thật)

- Triggers: pull_request + push main.
- Jobs: (1) lint+unit matrix — node (pnpm install, lint, vitest/jest unit), go (go vet + go test ./...), java (mvn test); (2) E2E `E2E=1` — services postgres + keycloak, pnpm playwright install, boot stack qua compose/booth-all path CI-mode, chạy playwright specs; (3) docker build mỗi Dockerfile (không push).
- CI-mode boot: dùng compose profile hoặc boot-all script variant không tranh port; secrets qua CI env (password test value — KHÔNG dùng default vừa rotate làm giá trị thật).
- Longest-lead: E2E job — script CI được viết + chạy thử cục bộ (khác runner GH) nhưng KHÔNG thể verify thật trên GH runner từ repo này → flag rõ trong README + comment: file theo spec, khi repo lên GitHub cần 1 lần tinh chỉnh runner. Gotcha cụ thể: Keycloak as GH `services:` container KHÔNG support command override (`--import-realm`) → dùng start-command wrapper image (quay.io/keycloak/keycloak + entrypoint override trong step) hoặc step riêng boot keycloak bằng docker run.

### 3.5 Backup + restore

- `scripts/backup-db.sh`: pg_dump cả 2 DB (fulfillment + batching) qua container postgres, gzip, timestamped filename `backups/<db>-<ts>.sql.gz`, giữ N bản (env `BACKUP_KEEP`, default 7), fail-loud khi 1 DB dump lỗi.
- Cron wiring: README hướng dẫn systemd user timer + crontab line (2 cách).
- Restore doc trong README: stop apps → drop/create **từng DB riêng** (cùng cluster — drop `fulfillment` KHÔNG đụng `batching`, ghi rõ thứ tự) → psql restore từng DB → seed-verify boot tự kiểm → restart. Follow-the-doc chính là acceptance.

### 3.6 Reconciliation job (Go ticker trong batching-service)

- Interval env `RECONCILE_INTERVAL` (default 0 = tắt; >0 bật — dev opt-in, prod bật).
- Mỗi tick: Java `FilterOrders` (batch_statuses=[PREPARING]) → với từng đơn, query batching DB. **Tiêu chí mồ-côi (testable):** order PREPARING là mồ-côi ⇔ KHÔNG tồn tại batch ACTIVE chứa fulfill_code đó; batch CANCELLED/hoàn tất KHÔNG tính là match (đúng case "Go Delete thành công + Java mutate thành công" — saga-drift). Nếu mồ-côi → gọi Java revert batchStatus→NOT_PREPARED (reuse pattern `batching_server.go:335` — path đã ghi activity_log SF-7, actor=reconciler) + log warn structured.
- **Out of scope (ghi rõ):** drift chiều ngược — batch ACTIVE tồn tại nhưng orders đã NOT_PREPARED (compensation Delete fail) — KHÔNG quét; ghi câu này để security-audit không bắt thiếu.
- Idempotent: scan-revert là pure function của state; chạy lại an toàn.
- Saga-compensation drift: đúng case này — network partition giữa Go Delete + Java mutate; ticker tự hàn trong interval sau.
- Unit test: testdb harness có sẵn — seed order PREPARING không batch → tick → reverted; order PREPARING có batch → untouched.

## 4. Touch map

```
.github/workflows/ci.yml                          (mới)
scripts/backup-db.sh                              (mới)
.env (untrack) / .gitignore / .env.example        (secrets + tokens mới)
docker/keycloak/hubstore-realm.json               (rotate admin secret)
docker-compose.yml                                (healthchecks + secrets env wiring)
services/bff-gateway/src/clients/grpc.ts          (+authorization metadata — signature change ripple 63 call sites / 8 client files trong src/clients/ + src/routes/)
services/bff-gateway/src/plugins/auth.ts          (giữ token trên request)
services/bff-gateway/src/app.ts                   (/health DB ping)
services/print-service/print_service/server.py    (liveness /health)
services/batching-service/cmd/server/main.go      (interceptor chain + health port + ticker)
services/batching-service/internal/server/auth_interceptor.go   (mới)
services/batching-service/internal/fulfillment/client.go        (outbound internal token)
services/batching-service/internal/reconcile/*.go (mới)
services/fulfillment-service/.../TokenAuthInterceptor.java      (mới)
services/fulfillment-service/Dockerfile           (curl cho healthcheck probe — nếu chọn curl)
services/fulfillment-service/.../application.yml  (OIDC_ISSUER/JWKS + health port)
README.md                                         (s2s rationale + secrets + backup/restore + rotation runbook)
e2e/backend-integration.ts                        (mint token thay bare metadata)
docs/superpowers/plans/...                        (plan file)
```

## 5. Test strategy

- Unit: Go auth interceptor (valid/expired/internal-token/denied), reconciler (mồ-côi/ok/idempotent), Java TokenAuthInterceptor, BFF /health.
- Integration: Go testdb harness cho reconciler.
- E2E: existing 13+ specs không hồi quy (login flow intact — auth change only thêm metadata gRPC); backend-integration.ts mint token.
- Verify thủ công: curl gRPC không token → DENIED; curl :8080/health → JSON db ok; backup script → .sql.gz mở được.

## 6. Risks

1. `.env` untrack merge conflict với main worktree — merge plan ở §3.2, xử lý lúc merge-ngước.
2. go 1.19 pin — đã chọn golang-jwt/jwt/v4 (compatible); probe `go mod tidy` ngay task đầu liên quan Go.
3. Java non-web app — dùng nimbus-jose trực tiếp trong interceptor + HttpServer nhúng cho /health (không spring-security auto-config).
4. CI E2E không verify được thật trên GH runner từ repo local — file theo spec + flag rõ.
5. Security-audit trên diff tổng có thể bắn P0/P1 vào SF cũ — budget fix-loop trước Done (P0/P1 phải resolved).
6. Realm secret rotation lockstep 3 nơi (realm JSON + compose + .env.example) — 1 PR, test KC import sau đổi.
