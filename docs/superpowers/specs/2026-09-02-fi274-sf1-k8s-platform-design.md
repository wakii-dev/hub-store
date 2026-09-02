# SF-1 Spec — K8s platform foundation + Postgres + Kafka (FI-274)

> Parent: FI-272 epic (docs/superpowers/specs/fi24x-minikube-deploy-spec.md — spec-critic APPROVED)
> Slice contract: docs/superpowers/contexts/fi272-sf-1.md (read-first)
> Status: Approved (epic-level decisions locked 2026-09-02; SF spec = restatement + implementation decisions)

## Mục tiêu

Platform layer cho minikube deploy: kustomize base skeleton (composition contract),
Postgres StatefulSet 3-DB, Kafka KRaft single-broker (wiring slot), build + preflight
scripts. KHÔNG deploy app (SF-4), KHÔNG Keycloak thật (SF-3), KHÔNG produce/consume (SF-5).

## Quyết định implementation (epic-level locked + verify session này)

1. **Composition contract** — `k8s/base/kustomization.yaml` viết MỘT LẦN, resources:
   `./postgres`, `./kafka`, `./keycloak`, `./apps/fulfillment`, `./apps/batching`,
   `./apps/print`, `./apps/bff`, `./apps/web` + `namespace: hub-store` transformer.
   Mỗi component dir có placeholder `kustomization.yaml` (namespace-only, 0 resources —
   kustomize build hợp lệ). SF-3/SF-4 chỉ thay dir mình, không sửa base.
2. **Kafka image: `apache/kafka:3.9.0`** — rationale: official image, env convention
   `KAFKA_NODE_ID`/`KAFKA_CLUSTER_ID`/`KAFKA_PROCESS_ROLES`/`KAFKA_LISTENERS`/
   `KAFKA_ADVERTISED_LISTENERS`/`KAFKA_CONTROLLER_QUORUM_VOTERS` (đã verify qua Docker Hub
   docs session này); 3.9 = dòng 3.x mature cuối, KRaft GA, multi-arch (arm64 OK);
   tránh 4.0 (major churn) và kafka-native (mới, ít docs). KHÔNG bitnami (KAFKA_CFG_*
   surface khác). Format storage tự động khi có KAFKA_CLUSTER_ID (combined mode
   `broker,controller`, controller quorum `1@kafka-0.kafka-headless:9093`... — dùng
   headless DNS cho quorum voters).
3. **Advertised listener contract** — client listener PLAINTEXT advertised =
   `kafka:9092` (Service DNS trong cluster), KHÔNG phải pod DNS → SF-5 round-trip pass.
   Verify sớm: `kafka-broker-api-versions --bootstrap-server kafka:9092` chạy từ pod
   khác (kubectl run) — metadata trả về phải chứa `kafka:9092`.
4. **Heap/resources** — `KAFKA_HEAP_OPTS=-Xmx1g -Xms512m`; requests 512m/limits 1.5Gi
   memory + 250m/500m CPU.
5. **Topic CONTRACT** — bootstrap Job/initContainer `kafka-topics --create --if-not-exists
   --topic orders.events`. Tên KHÔNG đổi (cross-SF contract SF-5).
6. **Postgres** — StatefulSet `postgres-0`, image `postgres:16` (pin), PVC 5Gi RWO,
   initdb ConfigMap mount `docker-entrypoint-initdb.d` tạo 3 DB
   `fulfillment`/`batching`/`keycloak` (idempotent: `IF NOT EXISTS`-style check),
   liveness/readiness exec `pg_isready`, Service ClusterIP `postgres:5432`.
   Credentials từ Secret `postgres-credentials` (dev-only: hubstore/dev-only-password).
7. **Secrets dev-only** (stringData + comment `# DEV-ONLY — không dùng giá trị này ở prod`):
   `postgres-credentials`, `jwt-dev-secret` (JWT_DEV_SECRET khớp services/bff-gateway/
   src/config.ts fail-loud env name), `keycloak-admin`.
8. **Seed ConfigMap** — `configMapGenerator` files: `./seed/canonical-seed.json` (bản COPY
   của `api/seed/canonical-seed.json` — kustomize load restrictor mặc định CHẶN file ngoài
   root của kustomization nên không tham chiếu trực tiếp `../../api/seed/`; file copy có
   header comment "GENERATED COPY — source of truth api/seed/canonical-seed.json").
   47KB an toàn dưới 1MB — comment cảnh báo ~800KB đổi cơ chế.
   `generatorOptions.disableNameSuffixHash: true` → name ổn định `canonical-seed`
   (cross-SF contract cho SF-4/SF-5 mount).
9. **Build script** — `scripts/k8s-build-images.sh` ENTRY POINT DUY NHẤT:
   `minikube image build -f <dockerfile> -t hub-store/<name>:dev .` ×5 (4 services/
   */Dockerfile + Dockerfile.web, context = repo root, đã verify tồn tại), tag overridable
   `IMAGE_TAG` env. `set -euo pipefail`, fail-loud khi minikube profile chưa chạy.
10. **Preflight script** — `scripts/k8s-preflight.sh`: check minikube installed (thiếu →
    FAIL-LOUD + hướng dẫn brew install), detect driver hiện tại (`minikube profile list`),
    resource khuyến nghị `--memory=6g --cpus=4`, addon ingress. Idempotent, exit non-zero
    khi thiếu. README section "K8s / minikube deploy — requirements + preflight" (chỉ phần đó).

## ACCEPTANCE (verify từng dòng — Rule 0, bằng chứng lệnh thật)

- `bash scripts/k8s-preflight.sh` → báo driver + resource + addon, exit 0; (thiếu minikube
  → thông báo + non-zero — test bằng PATH-stub nếu đã cài).
- `bash scripts/k8s-build-images.sh` → 5 images `hub-store/*:dev` trong `minikube image ls`.
- `kubectl apply -k k8s/overlays/minikube` (hoặc -k k8s/base) → build sạch với placeholder
  dirs; postgres pod Running healthy; `psql -l` thấy fulfillment/batching/keycloak; pod sống
  qua rollout restart (PVC mount).
- kafka-0 Running healthy; topic `orders.events` tồn tại (`kafka-topics --list` qua kubectl
  run); broker metadata trả `kafka:9092` qua Service DNS (advertised listener đúng).
- `kubectl apply -k k8s/base` build không lỗi (composition contract hoạt động).

## Out of scope

Keycloak deployment thật (SF-3) · app Deployments/Ingress (SF-4) · produce/consume round-trip
(SF-5) · deploy guide/NodePort (SF-5) · sửa code services/** hoặc docker-compose.yml.
