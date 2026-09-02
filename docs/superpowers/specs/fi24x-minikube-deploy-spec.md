# EPIC SPEC — Triển khai hệ thống trên minikube (Kubernetes local)

> Draft v1 cho spec-critic review. Đi kèm: P0 impact analysis (5 sections, verified deploy surface).
> Quyết định user đã chốt: (1) K8s gồm Postgres + Keycloak infra (independent của FI-245 merge);
> (2) Kustomize base+overlay; (3) minikube image build; (4) cho phép sửa code services để thêm gRPC health.

## IDEA-BRIEF (8 chiều)

- **Task** — đóng gói toàn bộ stack (5 app images + Postgres + Keycloak) thành k8s manifests và
  deploy được 1 lệnh trên minikube local: `minikube start` → build → deploy → mở app qua Ingress.
- **Output** — thư mục `k8s/` (kustomize base + overlay `minikube`), scripts build/deploy/smoke,
  code gRPC health trong 3 services, README deploy guide. Sản phẩm nhìn thấy: app chạy ở
  `http://<minikube-ip>/` (hoặc host name) với full stack trong cluster.
- **Users** — chính project owner (dev); sau này FI-245/team dùng lại overlay làm nơi deploy prod-like.
- **Constraints** — MUST: kustomize, minikube image build, gRPC health protocol (không exec probe),
  Postgres initdb 3 DB (fulfillment/batching/keycloak), Keycloak realm import.
  MUST-NOT: không phá docker-compose local flow, không phá `scripts/boot-all.sh`/e2e local,
  không merge vào main thay user, không hardcode secret thật vào git (dev-only values được, ghi rõ).
- **Input** — main branch hiện tại (stateless + seed 48KB + fake JWT), 5 Dockerfiles context=repo-root,
  BFF env host:port form, docker-compose.yml làm tham chiếu shape.
- **Context** — FI-245 (Postgres+Keycloak code: repos, OIDC login) đang chạy song song CHƯA merge.
  Story này là PLATFORM LAYER: app pods chạy mode hiện tại (in-memory seed), DB/Keycloak deploy sẵn
  làm wiring slot — khi code FI-245 merge, chỉ cần bật env trong overlay.
- **Success criteria** — (1) `bash scripts/k8s-deploy.sh` trên minikube sạch → app mở qua Ingress,
  login fake-JWT đi được vào D1, tạo batch, in PDF; (2) 3 gRPC services có readiness/liveness thật
  (probe Serving sau khi seed loaded); (3) Postgres PVC giữ data qua restart — proof cụ thể: delete
  pod postgres-0 → data còn; (4) Keycloak import realm lấy được token bằng password grant QUA INGRESS
  (route /keycloak); (5) e2e Playwright pass against cluster URL qua E2E_BASE_URL (local e2e giữ
  nguyên là default).
- **Out-of-scope** — code chạy Postgres/Keycloak trong app services (việc FI-245), CI pipeline,
  prod cloud (EKS/GKE), auto-scaling, sealed-secrets/SOPS, monitoring stack, multi-env (chỉ overlay minikube).

## Kiến trúc đích

```
minikube (driver: docker/orbstack — preflight sẽ detect)
namespace: hub-store
├─ postgres-0 (StatefulSet, PVC, initdb: fulfillment+batching+keycloak, pg_isready probes)
├─ keycloak (Deployment, DB=postgres/keycloak, --import-realm, startup probe chậm)
├─ fulfillment (Deployment :50051, gRPC health, seed từ ConfigMap)
├─ batching (Deployment :50052, gRPC health, initContainer wait fulfillment)
├─ print (Deployment :50053, gRPC health, seed từ ConfigMap)
├─ bff (Deployment :8080, /healthz, env GRPC_*→cluster DNS, JWT Secret; CORS không cần cho cluster path — same-origin qua Ingress, giữ env chỉ cho local dev)
├─ web (Deployment nginx :3000, /healthz (do SF-2 thêm vào docker/nginx.conf), shell+2 remotes static)
├─ Services ClusterIP ×7
└─ Ingress (SF-4 sở hữu): / → web, /api → bff (strip prefix), /keycloak → keycloak service
    (SF-3 đặt KC_HTTP_RELATIVE_PATH=/keycloak trên deployment để path-prefix hoạt động)
ConfigMap: canonical-seed (configMapGenerator từ api/seed/canonical-seed.json)
Secrets: postgres-credentials, jwt-dev-secret, keycloak-admin (dev values, .gitignore nếu thật)
```

## SF split (rubric)

**SF-1 (Tier 0) K8s platform foundation + Postgres** — owns k8s/ skeleton + **kustomize composition
contract**: `k8s/base/kustomization.yaml` (viết MỘT LẦN bởi SF-1) pre-include TẤT CẢ component dirs
(postgres, keycloak, app services — mỗi dir có placeholder kustomization.yaml namespace-only do SF-1
tạo); SF-3/SF-4 CHỈ thay nội dung dir của mình, KHÔNG BAO GIỜ sửa base kustomization → tier-1 chạy
song song không same-file conflict; overlay minikube inherit toàn bộ base; secrets, seed ConfigMap
(configMapGenerator + comment cảnh báo ~800KB limit), Postgres StatefulSet 3-DB
(fulfillment/batching/keycloak, pg_isready probes), image-build script `scripts/k8s-build-images.sh`
(minikube image build ×5 — ENTRY POINT DUY NHẤT cho build; SF-4 deploy script CALL script này;
SF-2 KHÔNG có build script riêng — smoke bằng docker build ad hoc/local run), preflight script
(driver detect + resource check + khuyến nghị `minikube start --memory=6g --cpus=4` cho stack
Java+Keycloak) + README section preflight/requirements (SF-1 KHÔNG đụng phần khác của README). 11 tasks.

**SF-2 (Tier 0) gRPC health + probes code** — owns TOÀN BỘ probe-code changes: Java/Go/Python
grpc.health.v1 (Serving sau seed-load, chỉ THÊM file mới + registration tối thiểu — không refactor,
giảm conflict FI-245), `location /healthz` trong docker/nginx.conf (SF-2 sở hữu conf change; rebuild
web image là việc SF-4), grpcurl smoke script per-service, tests. Standalone testable (docker build
ad hoc / local binary run — KHÔNG tạo build script riêng, build entry point là SF-1). Exit criteria
thêm: `mvn dependency:tree | grep grpc-services` pass — thiếu thì thêm 1 dòng pom
(io.grpc:grpc-services cho HealthStatusManager). Không phụ thuộc SF-1. 10 tasks.

**SF-3 (Tier 1, dep SF-1) Keycloak on k8s** — Deployment (image pin cụ thể, `KC_HEALTH_ENABLED=true`
+ management port 9000 cho probes, `KC_HTTP_RELATIVE_PATH=/keycloak` — contract với SF-4 ingress
route, KC_DB=postgres → db `keycloak` của SF-1) + realm JSON minimal (roles Coordinator/WarehouseOps/
Manager + dev users kèm credentials, client với `directAccessGrantsEnabled: true` để password grant
smoke được) + startup/readiness probes (keycloak boot chậm) + smoke token qua port-forward. 8 tasks.

**SF-4 (Tier 1, dep SF-1, SF-2) 5 app services + networking** — Deployments ×5 + Services (thay
placeholder dirs của SF-1 — CHỈ đụng dir app, không sửa base kustomization), env wiring (GRPC_*
cluster DNS, seed paths, JWT secret ref), probe wiring (endpoint từ SF-2 — CHỈ manifest, không code),
`imagePullPolicy: IfNotPresent`, initContainer batching wait-fulfillment (busybox nc, timeout
fail-loud 120s — không retry vô hạn), Ingress (/ → web, /api → bff strip prefix, /keycloak → keycloak
— route thuộc SF-4, prefix env do SF-3 đặt), overlay minikube glue, `scripts/k8s-deploy.sh` (CALL
k8s-build-images.sh + apply -k overlay + rollout status — idempotent re-run được), smoke curl qua
ingress. NodePort fallback = README/docs snippet (SF-5), không dead config trong overlay. 13 tasks.

**SF-5 (Tier 2, dep SF-3, SF-4) Convergence — cluster E2E + docs** — Playwright against cluster URL:
sửa `e2e/playwright.config.ts` thành env-driven (`E2E_BASE_URL` — default vẫn http://localhost:3000 +
webServer boot-all như cũ; set E2E_BASE_URL → dùng URL đó + SKIP webServer) — SF-5 sở hữu config
change này; **regression criterion bắt buộc: bare `npx playwright test` (không env) vẫn pass như
trước**; gRPC integration check trong cluster (kubectl run job), keycloak token smoke QUA INGRESS
(route /keycloak từ SF-4), Postgres persistence proof (delete pod postgres-0 → data survives),
seed-update workflow doc (rebuild configmap + rollout restart), README deploy guide (+ NodePort
fallback doc), FI-245 wiring doc (bật env nào khi code merge), security notes (dev-only secrets ghi
rõ), final audit. 11 tasks.

**Anti-duplicate audit** (liệt kê pattern trước khi chốt): health *code* chỉ ở SF-2; probe *manifest
wiring* chỉ ở SF-4 (dùng endpoint SF-2 — yaml khác code, không trùng); realm JSON chỉ SF-3; scripts
tách: build (SF-1) / deploy (SF-4) / e2e-smoke (SF-5) — escalation không lặp; ConfigMap seed chỉ SF-1.
Không SF nào ≥50% tasks cùng loại với SF khác. Mọi SF 8-13 tasks. ✓

**Tier-gate rule** — SF-1 gate: postgres pod healthy + pg_isready 3 DB (KHÔNG test app); SF-2 gate:
grpcurl health serving per-service standalone (KHÔNG test k8s); SF-3 gate: token lấy được (KHÔNG test
app OIDC — app chưa dùng); SF-4 gate: app full flow qua ingress với fake-JWT (KHÔNG test Postgres
persistence — app chưa dùng DB); cross-SF behaviors (e2e, persistence, keycloak-app wiring slot) dồn
SF-5.

## Rủi ro chính (từ P0) + mitigation trong spec

1. Batching hard dial boot (WithBlock 5s → Fatal) → initContainer wait-fulfillment trong SF-4; KHÔNG đổi Go dial code (giảm conflict FI-245).
2. gRPC health code đụng 3 services → conflict với FI-245 branches đang mở → SF-2 chỉ THÊM file mới + registration dòng tối thiểu, không refactor.
3. Minikube driver macOS chưa verify → SF-1 preflight script detect (docker/orbstack/hyperkit), README ghi requirement; nếu chưa cài → FAIL-LOUD với hướng dẫn.
4. Ingress addon hành vi khác nhau theo driver → SF-4 có fallback NodePort trong overlay (commented) + docs.
5. Keycloak realm trùng FI-245 SF-4 → giữ minimal + flag trong context pack SF-3; convergence SF-5 ghi hướng thay realm khi FI-245 merge.
6. Seed ConfigMap stale → SF-5 docs quy trình update (rebuild configmap + rollout restart).
