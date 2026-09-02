# Plan — SF-3 Keycloak on k8s (FI-276)

Spec: docs/superpowers/contexts/fi272-sf-3.md (context pack — epic spec-critic APPROVED).
Tier: Standard (8 tasks, không task DAG riêng — DAG SF-level đã có trong run_4a4e57c91665 / task_ed988c03ba5b).
Worktree: sf-3-keycloak (branch VuHoi/sf-3-keycloak, base story/fi272-minikube-deploy).

## Đã verify trước khi viết plan (Prime Directive)

- Image pin: `quay.io/keycloak/keycloak:26.3.4` — manifest API trả 200, multi-arch amd64+arm64;
  tag bogus trả 404 (check đáng tin). Lý do: patch cuối dòng minor 26.3 mature; KC 26 dùng
  `KC_BOOTSTRAP_ADMIN_*` — khớp comment trong secrets.yaml SF-1.
- Secret `keycloak-admin` keys: `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` (legacy keys SF-1) —
  map sang env `KC_BOOTSTRAP_ADMIN_*` bằng secretKeyRef, KHÔNG sửa secrets.yaml.
- Secret `postgres-credentials`: POSTGRES_USER=hubstore / POSTGRES_PASSWORD → KC_DB_USERNAME/PASSWORD.
- Postgres Service = headless `postgres:5432` → `jdbc:postgresql://postgres:5432/keycloak` (DB do initdb tạo).
- Cluster sống: postgres-0, kafka-0 Running (namespace hub-store).

## Tasks

### Task 1-2: keycloak-deployment + db-env-wiring
`k8s/base/keycloak/deployment.yaml` — image 26.3.4, `start-dev --import-realm`,
env: KC_HEALTH_ENABLED=true, KC_HTTP_RELATIVE_PATH=/keycloak (contract SF-4),
KC_DB=postgres, KC_DB_URL, KC_DB_USERNAME/PASSWORD ← postgres-credentials,
KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD ← keycloak-admin (map key legacy).
Resources requests 512Mi/250m, limits 1536Mi/1 (Keycloak RAM-heavy, minikube 6GB chia sẻ).
Commit: `feat(sf3): keycloak deployment + db/admin env wiring`.

### Task 3-4: realm-json-minimal + realm-import-config
`k8s/base/keycloak/realm-hub-store.json` — realm `hub-store`, roles
Coordinator/WarehouseOps/Manager, 3 dev users (credentials trong JSON, temporary:false,
DEV-ONLY flag), client `hub-store-app` publicClient + directAccessGrantsEnabled:true.
`k8s/base/keycloak/realm-secret.yaml` — Secret `keycloak-realm-hub-store` (dev-only),
volume mount `/opt/keycloak/data/import/realm-hub-store.json`.
Commit: `feat(sf3): minimal hub-store realm + import mount`.

### Task 5-6: keycloak-service-probes + startup-resources-tuning
`k8s/base/keycloak/service.yaml` — ClusterIP keycloak:8080 (http) + 9000 (management).
Probes trên :9000: startupProbe /health/ready (failureThreshold 30 × period 5s — boot chậm),
readiness /health/ready, liveness /health/live. KC_HTTP_RELATIVE_PATH chỉ áp port 8080,
management port root là /health (verify runtime).
Commit: `feat(sf3): keycloak service + health probes tuning`.

### Task 7-8: smoke-token-portforward + docs-flag-fi245
Build sạch `kustomize build k8s/base`, apply, rollout status; `kubectl port-forward`
→ curl password grant `/realms/hub-store/protocol/openid-connect/token` cho cả 3 users
→ decode JWT realm_access (bằng chứng Rule 0); re-apply/restart → import idempotent
không crash-loop. Flag FI-245: comment trong dir + đoạn doc ngắn (realm minimal,
FI-245 SF-4 sẽ thay, SF-5 ghi hướng chính thức).
Commit: `docs(sf3): FI-245 realm replacement flag + smoke evidence`.

## Acceptance (từ context pack)

1. Pod keycloak Ready trong hub-store, startup probe không flap, log không DB error.
2. port-forward + password grant → access_token realm_access chứa đúng roles (verify cả 3).
3. Realm import idempotent — không crash-loop khi re-apply.

## Boundary

KHÔNG sửa base kustomization / postgres / kafka / apps/*; KHÔNG Ingress (SF-4);
KHÔNG wiring OIDC app (SF-5/FI-245); realm minimal flag thay vì full.
