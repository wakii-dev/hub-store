# Story: FI-272 — Triển khai hệ thống trên minikube (Kubernetes local)

Destination: story/fi272-minikube-deploy

Spec: docs/superpowers/specs/fi24x-minikube-deploy-spec.md (spec-critic + plan-critic APPROVED; + Kafka bổ sung 2026-09-02).
Context packs: docs/superpowers/contexts/fi272-sf-1..5.md (SF agents ĐỌC FILE NÀY THAY tự tổng hợp).
Quyết định chốt: k8s gồm Postgres+Keycloak+Kafka (independent FI-245) / kustomize / minikube image build / gRPC health code OK / Kafka = KRaft wiring slot (app không dùng).

## SF-1 K8s platform foundation + Postgres + Kafka
Tier: 0
linear: FI-274
What: kustomize base skeleton k8s/base + composition contract (base kustomization pre-include TẤT CẢ component dirs với placeholder kustomization.yaml — SF-3/SF-4 chỉ thay dir mình, không sửa base) + overlay minikube skeleton; namespace hub-store; secrets (postgres-credentials, jwt-dev-secret, keycloak-admin — dev values, ghi rõ dev-only); seed ConfigMap (configMapGenerator từ api/seed/canonical-seed.json + comment ~800KB limit); Postgres StatefulSet postgres:16 (PVC, initdb 3 DB fulfillment/batching/keycloak, pg_isready probes) + Service; Kafka KRaft single-broker StatefulSet (image pin chốt ở plan — mặc định apache/kafka convention, KHÔNG ZooKeeper, PVC, health probe, Service kafka:9092 + headless, advertised.listeners client phải resolve được kafka:9092 trong cluster, KAFKA_HEAP_OPTS + requests/limits, bootstrap topic CONTRACT orders.events — KHÔNG tự đổi tên — WIRING SLOT, app không dùng); scripts/k8s-build-images.sh (minikube image build ×5 — ENTRY POINT DUY NHẤT cho build); preflight script (driver detect + resource check + khuyến nghị --memory=6g --cpus=4) + README preflight section (chỉ phần đó)
Depends on: —
Tasks: kustomize-skeleton-placeholder-dirs / base-kustomization-preinclude-all / namespace / secrets-dev-values / postgres-statefulset / postgres-initdb-3db / postgres-pvc / postgres-probes-service / kafka-kraft-statefulset / kafka-service-health / kafka-topic-bootstrap / seed-configmap-generator / build-images-script / preflight-script-readme

## SF-2 gRPC health + probes code
Tier: 0
linear: FI-275
What: grpc.health.v1 cho 3 services (Java HealthStatusManager + readiness Serving sau seed-load; Go health service; Python grpc_health.v1 + seed-ready) — chỉ THÊM file mới + registration tối thiểu, KHÔNG refactor (giảm conflict FI-245); pom check: mvn dependency:tree | grep grpc-services, thiếu → thêm 1 dòng io.grpc:grpc-services; location /healthz trong docker/nginx.conf (SF-2 sở hữu conf; rebuild web image là SF-4); grpcurl smoke script per-service (không build script riêng — docker build ad hoc/local run); unit tests. Standalone testable, không phụ thuộc SF-1
Depends on: —
Tasks: java-health-service / java-seed-ready / java-grpc-services-dep-check / go-health-service / python-health-service / python-seed-ready / nginx-healthz-location / grpcurl-smoke-script / unit-tests / dockerfile-unchanged-verify

## SF-3 Keycloak on k8s
Tier: 1
linear: FI-276
What: Keycloak Deployment (image pin, KC_HEALTH_ENABLED=true + mgmt port 9000 probes, KC_HTTP_RELATIVE_PATH=/keycloak — contract với SF-4 ingress route, KC_DB=postgres → db keycloak của SF-1, resources requests/limits); realm JSON minimal (realm hub-store, roles Coordinator/WarehouseOps/Manager, dev users kèm credentials, client directAccessGrantsEnabled:true cho password grant smoke) + import config; Service + startup probe (boot chậm) + readiness; smoke token qua port-forward. FLAG: FI-245 SF-4 sẽ có realm đầy đủ — bản này minimal, SF-5 ghi hướng thay. KHÔNG sửa base kustomization (chỉ dir keycloak placeholder của SF-1)
Depends on: SF-1
Tasks: keycloak-deployment / keycloak-db-env-wiring / realm-json-minimal / realm-import-config / keycloak-service-probes / startup-resources-tuning / smoke-token-portforward / docs-flag-fi245

## SF-4 5 app services + networking
Tier: 1
linear: FI-277
What: Deployments ×5 (fulfillment/batching/print/bff/web) + Services ×5 — thay placeholder dirs SF-1, KHÔNG sửa base kustomization; env wiring (GRPC_FULFILLMENT/GRPC_BATCHING/GRPC_PRINT → cluster DNS host:port, seed paths, JWT secret ref; CORS giữ nguyên local — same-origin qua Ingress không cần); probe wiring endpoint từ SF-2 (CHỈ manifest, không code); imagePullPolicy IfNotPresent; initContainer batching wait-fulfillment (busybox nc, timeout fail-loud 120s); Ingress (/ → web, /api → bff strip prefix, /keycloak → keycloak); overlay minikube glue (replicas/images); scripts/k8s-deploy.sh (CALL k8s-build-images.sh + apply -k overlay + rollout status — idempotent re-run); smoke curl qua ingress
Depends on: SF-1, SF-2
Tasks: deployment-fulfillment / deployment-batching / deployment-print / deployment-bff / deployment-web / services-x5 / env-wiring-grpc-seed-jwt / probes-wiring-manifest / batching-initcontainer-wait / ingress-routes / overlay-minikube-glue / deploy-script-call-build / smoke-curl-ingress / idempotent-rerun-verify

## SF-5 Convergence — cluster E2E + docs
Tier: 2
linear: FI-278
What: e2e/playwright.config.ts env-driven (E2E_BASE_URL: default giữ localhost:3000 + boot-all webServer; set → dùng URL đó + skip webServer — SF-5 sở hữu config change; REGRESSION: bare npx playwright test không env vẫn pass); cluster E2E pass qua E2E_BASE_URL; gRPC integration check trong cluster (kubectl run job); keycloak token smoke QUA INGRESS (route /keycloak SF-4); Postgres persistence proof (delete pod postgres-0 → data survives); Kafka produce/consume round-trip trong cluster (kubectl run client qua topic orders.events — convergence proof SC-6); seed-update workflow doc (rebuild configmap + rollout restart); README deploy guide + NodePort fallback doc; FI-245 wiring doc (bật env nào khi code merge + thay realm + KAFKA_BOOTSTRAP_SERVERS/topics); security notes (dev-only secrets); final audit comment lên epic
Depends on: SF-3, SF-4
Tasks: playwright-config-env-baseurl / e2e-cluster-pass / e2e-local-regression / grpc-integration-cluster-job / keycloak-token-ingress-smoke / postgres-persistence-proof / kafka-roundtrip-proof / seed-update-workflow-doc / readme-deploy-guide-nodeport / fi245-wiring-doc / security-notes / audit-comment
