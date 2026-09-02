# SF-4 Plan — 5 app services + networking (FI-277)

> Spec: docs/superpowers/specs/fi24x-minikube-deploy-spec.md (spec-critic APPROVED) · Context pack: docs/superpowers/contexts/fi272-sf-4.md · Epic: FI-272
> Worktree: sf-4-app-networking (merge vào story/fi272-minikube-deploy — KHÔNG đụng main)
> Base: bbb355b (SF-1 + SF-2 merged). Cluster đã sống: postgres-0 + kafka-0 Ready (SF-1 deploy), keycloak CHƯA có (SF-3 song song — route /keycloak vẫn làm, smoke chỉ web+api).
> Facts verified: ConfigMap `canonical-seed` key `canonical-seed.json` (mount /seed → /seed/canonical-seed.json) · Secret `jwt-dev-secret` key `JWT_DEV_SECRET` · env names khớp sources (BATCHING_PORT/FULFILLMENT_ADDR/CANONICAL_SEED_PATH · PRINT_SERVICE_SEED_PATH, port cứng 50053 · SEED_PATH + listen ${GRPC_FULFILLMENT:50051} · BFF PORT_BFF ?? 8080 · nginx /healthz :3000) · ingress addon enabled.

## Meta (không checkbox)
- Contracts KHÔNG phá: KHÔNG sửa k8s/base/kustomization.yaml (composition contract SF-1) · Ingress /keycloak → keycloak:8080 (KC_HTTP_RELATIVE_PATH do SF-3) · initContainer batching fail-loud 120s · imagePullPolicy IfNotPresent · KHÔNG đụng worktree sf-5-convergence.
- Scripts tách: build = scripts/k8s-build-images.sh (SF-1, call không sửa) / deploy = scripts/k8s-deploy.sh (SF-4, CALL build) / e2e-smoke = SF-5.
- Rolling review: code-reviewer ĐỘC LẬP trên toàn diff SF trước merge (nhóm duy nhất — manifests liền khối).
- Verify: kustomize build sạch (cả base + overlay) · deploy.sh 1 lệnh + idempotent re-run · Rule 0 bằng chứng kubectl/curl thật · từng dòng ACCEPTANCE context pack.
- Merge: chuỗi merge-ngược an toàn (merge parent vào sf-branch → update-ref FULL refname + ancestor guard TRƯỚC + rev-list check SAU), audit comment merge-hash lên FI-277.
- Linear FI-277 → Done CHỈ SAU story-verify sạch + orca task task_befdd0049c6b completed.

## Tasks

- [ ] Task 1 — deployment-fulfillment: `k8s/base/apps/fulfillment/` — kustomization (thay placeholder, resources đầy đủ) + deployment (image hub-store/fulfillment-service:dev, port 50051, IfNotPresent, env SEED_PATH=/seed/canonical-seed.json, volume canonical-seed mount /seed) + service ClusterIP. Probe gRPC grpc.health.v1 readiness+liveness port 50051 (wiring SF-2).
- [ ] Task 2 — deployment-batching: `k8s/base/apps/batching/` — deployment (port 50052, env BATCHING_PORT=50052 / FULFILLMENT_ADDR=fulfillment:50051 / CANONICAL_SEED_PATH=/seed/canonical-seed.json, seed mount) + service. Probe gRPC port 50052. initContainer busybox `nc -z fulfillment 50051` loop, timeout fail-loud 120s.
- [ ] Task 3 — deployment-print: `k8s/base/apps/print/` — deployment (port 50053, env PRINT_SERVICE_SEED_PATH=/seed/canonical-seed.json, seed mount) + service. Probe gRPC port 50053.
- [ ] Task 4 — deployment-bff: `k8s/base/apps/bff/` — deployment (port 8080, env GRPC_FULFILLMENT=fulfillment:50051 / GRPC_BATCHING=batching:50052 / GRPC_PRINT=print:50053, JWT_DEV_SECRET secretKeyRef jwt-dev-secret) + service. Probe httpGet /healthz :8080.
- [ ] Task 5 — deployment-web: `k8s/base/apps/web/` — deployment (port 3000, nginx /healthz SF-2) + service. Probe httpGet /healthz :3000.
- [ ] Task 6-9 — services-x5 + env-wiring + probes-wiring + initcontainer: gộp vào Task 1-5 (mỗi app dir = deployment+service+env+probe trọn vẹn, một commit/app — tránh same-file churn).
- [ ] Task 10 — ingress-routes: `k8s/base/apps/web/ingress.yaml` (networking.k8s.io/v1): `/` → web:3000, `/api(/|$)(.*)` → bff:8080 rewrite-target /$2 (strip prefix), `/keycloak(/|$)(.*)` → keycloak:8080 rewrite /$2 (SF-3 prefix env). Ghi chú ingressClassName nginx.
- [ ] Task 11 — overlay-minikube-glue: `k8s/overlays/minikube/kustomization.yaml` — images set tag `hub-store/*:dev`, replicas=1 ×5, commonLabels app.kubernetes.io/part-of=hub-store. KHÔNG dead-config (NodePort fallback là doc SF-5).
- [ ] Task 12 — deploy-script-call-build: `scripts/k8s-deploy.sh` — set -euo pipefail · CALL scripts/k8s-build-images.sh (KHÔNG duplicate) · kubectl apply -k k8s/overlays/minikube · kubectl rollout status từng deployment (timeout rõ) · idempotent re-run sạch.
- [ ] Task 13 — smoke-curl-ingress: kustomize build base + overlay sạch (dry-run) · deploy.sh chạy thật · lấy minikube ip · curl `/`, `/api/healthz`, `/remotes/orders/remoteEntry.js` → 200. Keycloak route chỉ verify config (pod chưa có).
- [ ] Task 14 — idempotent-rerun-verify: chạy deploy.sh LẦI lần 2 → sạch · kubectl get pods ALL Ready · batching KHÔNG crash-loop (initContainer đúng vai) · rule 0 evidence · code-reviewer độc lập APPROVED → merge + audit comment.
