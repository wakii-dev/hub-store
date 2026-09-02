# SF-1 K8s Platform Foundation + Postgres + Kafka — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Platform layer kustomize (base + overlay minikube) + Postgres StatefulSet 3-DB + Kafka KRaft single-broker (wiring slot) + build/preflight scripts cho minikube.

**Architecture:** `k8s/base/kustomization.yaml` viết MỘT LẦN pre-include 7 component dirs (placeholder namespace-only cho keycloak/apps — SF-3/SF-4 chỉ thay dir mình). Postgres + Kafka = StatefulSet + PVC trong namespace `hub-store`. Topic `orders.events` = CONTRACT cross-SF. Build entry point duy nhất = `scripts/k8s-build-images.sh`.

**Tech Stack:** kustomize (qua `kubectl apply -k`), postgres:16, apache/kafka:3.9.0 (KRaft combined mode), bash.

**Linear Issue:** FI-274 · **Spec:** `docs/superpowers/specs/2026-09-02-fi274-sf1-k8s-platform-design.md` · **Epic spec:** `docs/superpowers/specs/fi24x-minikube-deploy-spec.md`

**Commit convention:** `feat(sf1): <imperative summary>` (một commit / task).

**Verify cần cluster:** minikube (install `brew install minikube`, start `minikube start --memory=6g --cpus=4 --driver=docker`). Rule 0: mọi claim "healthy" phải có bằng chứng lệnh thật (kubectl get / psql / kafka-topics).

---

### Task 1: Kustomize skeleton + placeholder dirs (composition contract)

**Files:**
- Create: `k8s/base/kustomization.yaml`
- Create: `k8s/base/keycloak/kustomization.yaml`
- Create: `k8s/base/apps/fulfillment/kustomization.yaml`
- Create: `k8s/base/apps/batching/kustomization.yaml`
- Create: `k8s/base/apps/print/kustomization.yaml`
- Create: `k8s/base/apps/bff/kustomization.yaml`
- Create: `k8s/base/apps/web/kustomization.yaml`
- Create: `k8s/overlays/minikube/kustomization.yaml`

**CONTRACT (P0):** base kustomization pre-include TẤT CẢ dirs; SF-3/SF-4 chỉ thay NỘI DUNG dir của mình, KHÔNG BAO GIỜ sửa base kustomization.

- [ ] **Step 1: Viết base kustomization**

`k8s/base/kustomization.yaml`:
```yaml
# COMPOSITION CONTRACT — viết MỘT LẦN bởi SF-1 (FI-274).
# SF-3 (keycloak) / SF-4 (apps/*) chỉ thay nội dung dir của mình,
# KHÔNG BAO GIỜ sửa file này. Thêm component mới = quyết định epic-level.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: hub-store

resources:
  - ./postgres
  - ./kafka
  - ./keycloak
  - ./apps/fulfillment
  - ./apps/batching
  - ./apps/print
  - ./apps/bff
  - ./apps/web

# Seed ConfigMap — name ổn định `canonical-seed` (cross-SF contract SF-4/SF-5 mount).
# File là BẢN COPY của api/seed/canonical-seed.json (kustomize load restrictor chặn
# path ngoài root — KHÔNG tham chiếu ../../api/). CẢNH BÁO: seed ~48KB hôm nay;
# nếu phình ~800KB (gần 1MB ConfigMap limit) PHẢI đổi cơ chế (mount file / init container).
configMapGenerator:
  - name: canonical-seed
    files:
      - seed/canonical-seed.json
generatorOptions:
  disableNameSuffixHash: true
```

- [ ] **Step 2: Tạo 6 placeholder kustomization.yaml**

Mỗi file dưới đây — chỉ đổi comment đầu (ai sẽ thay):
`k8s/base/keycloak/kustomization.yaml` (SF-3 thay), `k8s/base/apps/{fulfillment,batching,print,bff,web}/kustomization.yaml` (SF-4 thay):
```yaml
# PLACEHOLDER — SF-3 thay dir này bằng manifests Keycloak thật (SF-4 cho apps/*).
# KHÔNG sửa k8s/base/kustomization.yaml (composition contract).
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: hub-store

resources: []
```

- [ ] **Step 3: Copy seed file vào k8s/base/seed/**

```bash
mkdir -p k8s/base/seed
cp api/seed/canonical-seed.json k8s/base/seed/canonical-seed.json
```
Đầu file copy thêm dòng chú thích? JSON không cho comment — ghi chú provenance trong kustomization đã làm ở Step 1. Đủ.

- [ ] **Step 4: Overlay minikube skeleton**

`k8s/overlays/minikube/kustomization.yaml`:
```yaml
# Overlay minikube — SF-1 tạo skeleton; SF-4 thêm glue (replicas/images), SF-5 thêm tune.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base
```

- [ ] **Step 5: Verify build sạch (chưa có postgres/kafka dir — tạm comment hoặc làm Task 2 trước khi build)**

Lưu ý: build chỉ sạch sau khi có dir `postgres/` + `kafka/` (Task 4+). Nếu làm task này một mình, verify bằng `kubectl kustomize k8s/overlays/minikube` SAU Task 5. Commit trước, verify build ở Task 5 Step 4.

- [ ] **Step 6: Commit**

```bash
git add k8s/
git commit -m "feat(sf1): kustomize base skeleton + placeholder dirs + overlay minikube (composition contract)"
```

---

### Task 2: Secrets dev-only

**Files:**
- Create: `k8s/base/secrets.yaml`
- Modify: `k8s/base/kustomization.yaml` (thêm `- ./secrets.yaml` vào resources)

- [ ] **Step 1: Viết secrets**

`k8s/base/secrets.yaml`:
```yaml
# ⚠️ DEV-ONLY SECRETS — giá trị giả lập cho minikube local.
# KHÔNG BAO GIỜ dùng giá trị này ở môi trường thật. Secret thật = external (không commit).
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
type: Opaque
stringData:
  POSTGRES_USER: "hubstore"
  POSTGRES_PASSWORD: "dev-only-password"
  POSTGRES_DB: "hubstore"
---
# DEV-ONLY — khớp env JWT_DEV_SECRET mà services/bff-gateway/src/config.ts fail-loud đọc.
apiVersion: v1
kind: Secret
metadata:
  name: jwt-dev-secret
type: Opaque
stringData:
  JWT_DEV_SECRET: "dev-jwt-secret-not-for-production"
---
# DEV-ONLY — Keycloak admin bootstrap (SF-3 sẽ consume; KC 26 dùng KC_BOOTSTRAP_ADMIN_*).
apiVersion: v1
kind: Secret
metadata:
  name: keycloak-admin
type: Opaque
stringData:
  KEYCLOAK_ADMIN: "admin"
  KEYCLOAK_ADMIN_PASSWORD: "admin-dev-only"
```

- [ ] **Step 2: Thêm `- ./secrets.yaml` vào resources của base kustomization** (trước ./postgres).

- [ ] **Step 3: Commit**

```bash
git add k8s/base/secrets.yaml k8s/base/kustomization.yaml
git commit -m "feat(sf1): dev-only secrets (postgres-credentials, jwt-dev-secret, keycloak-admin)"
```

---

### Task 3: Preflight script + README section

**Files:**
- Create: `scripts/k8s-preflight.sh`
- Modify: `README.md` (chỉ thêm section "K8s / minikube deploy — requirements + preflight")

- [ ] **Step 1: Viết preflight script**

`scripts/k8s-preflight.sh`:
```bash
#!/usr/bin/env bash
# Preflight check cho K8s/minikube deploy (SF-1). Idempotent — chạy thoải mái.
# Exit non-zero khi thiếu thứ gì đó (FAIL-LOUD), kèm hướng dẫn fix.
set -uo pipefail

FAIL=0

fail() { echo "✗ $1"; FAIL=1; }
ok()   { echo "✓ $1"; }

echo "=== K8s preflight (hub-store minikube) ==="

# 1. minikube installed?
if ! command -v minikube >/dev/null 2>&1; then
  fail "minikube chưa cài. Cài: brew install minikube (macOS) — https://minikube.sigs.k8s.io/docs/start/"
else
  ok "minikube $(minikube version --output=text 2>/dev/null | grep -o 'v[0-9.]*' | head -1)"
fi

# 2. kubectl installed?
if ! command -v kubectl >/dev/null 2>&1; then
  fail "kubectl chưa cài. Cài: brew install kubectl"
else
  ok "kubectl $(kubectl version --client --output=yaml 2>/dev/null | grep gitVersion | head -1 | awk '{print $2}')"
fi

# 3. driver detect (chỉ khi minikube có)
DRIVER=""
if command -v minikube >/dev/null 2>&1; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DRIVER=docker; ok "driver khả dụng: docker"
  elif command -v orbstack >/dev/null 2>&1; then
    DRIVER=orbstack; ok "driver khả dụng: orbstack"
  else
    fail "không thấy driver container nào (docker/orbstack). Cài Docker Desktop hoặc OrbStack."
  fi
fi

# 4. profile hiện tại + resource khuyến nghị
if [ -n "$DRIVER" ]; then
  if minikube profile list 2>/dev/null | grep -q minikube; then
    MEM=$(minikube profile list -o json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['valid'][0]['Memory'])" 2>/dev/null || echo "?")
    CPU=$(minikube profile list -o json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['valid'][0]['CPUs'])" 2>/dev/null || echo "?")
    echo "→ profile 'minikube' tồn tại: memory=${MEM}MB cpus=${CPU}"
    if [ "$MEM" != "?" ] && [ "$MEM" -lt 6000 ]; then
      echo "⚠ memory ${MEM}MB < khuyến nghị 6g — stack Java+Keycloak+Kafka dễ OOM."
      echo "  fix: minikube delete && minikube start --memory=6g --cpus=4 --driver=${DRIVER}"
    fi
  else
    echo "→ profile 'minikube' chưa tồn tại. Khởi động:"
    echo "    minikube start --memory=6g --cpus=4 --driver=${DRIVER}"
  fi
fi

# 5. addon ingress (cần ở SF-4 — báo trước, không fail)
if command -v minikube >/dev/null 2>&1 && minikube profile list 2>/dev/null | grep -q minikube; then
  if [ "$(minikube addons list 2>/dev/null | awk '$1=="ingress"{print $3}')" = "enabled" ]; then
    ok "addon ingress: enabled"
  else
    echo "⚠ addon ingress chưa bật (SF-4 cần): minikube addons enable ingress"
  fi
fi

if [ "$FAIL" -ne 0 ]; then
  echo "=== PREFLIGHT FAIL — fix các mục ✗ rồi chạy lại ==="
  exit 1
fi
echo "=== PREFLIGHT OK ==="
```

- [ ] **Step 2: chmod +x + shellcheck nếu có**

```bash
chmod +x scripts/k8s-preflight.sh
command -v shellcheck >/dev/null && shellcheck scripts/k8s-preflight.sh
```

- [ ] **Step 3: README section**

Thêm vào README.md (đặt sau section Quick start / local dev hiện có — KHÔNG đụng phần khác):
```markdown
## K8s / minikube deploy — requirements + preflight

Deploy lên Kubernetes local (minikube) cần:

- **minikube** ≥ 1.30 — `brew install minikube`
- **kubectl** — `brew install kubectl`
- **Driver**: Docker Desktop hoặc OrbStack (đang chạy)
- **Resources**: ≥ 6GB RAM, 4 CPU cho VM minikube — stack có 3 JVM services + Keycloak + Kafka, default 2GB sẽ OOM:
  ```bash
  minikube start --memory=6g --cpus=4
  ```

Check trước khi deploy:

```bash
bash scripts/k8s-preflight.sh
```

Script báo driver + resource + addon ingress; thoát non-zero khi thiếu gì đó (kèm hướng dẫn fix).
Lưu ý: toàn bộ secrets trong `k8s/` là DEV-ONLY (giá trị giả lập) — không dùng ở môi trường thật.
```

- [ ] **Step 4: Test fail-loud path (stub PATH)**

```bash
PATH=/usr/bin:/bin /usr/bin/env -i HOME=$HOME bash -c 'PATH=/nonexistent bash scripts/k8s-preflight.sh'; echo "exit=$?"
```
Expected: thông báo "minikube chưa cài..." + exit=1. (Nếu env -i làm break phần khác, test thay thế: mock `command -v minikube` fail bằng PATH rỗng.)

- [ ] **Step 5: Commit**

```bash
git add scripts/k8s-preflight.sh README.md
git commit -m "feat(sf1): k8s preflight script + README requirements section"
```

---

### Task 4: Postgres StatefulSet + PVC + initdb 3 DB + probes + Service

**Files:**
- Create: `k8s/base/postgres/kustomization.yaml`
- Create: `k8s/base/postgres/statefulset.yaml`
- Create: `k8s/base/postgres/service.yaml`
- Create: `k8s/base/postgres/initdb-configmap.yaml`

- [ ] **Step 1: initdb ConfigMap (3 DB, idempotent)**

`k8s/base/postgres/initdb-configmap.yaml`:
```yaml
# Initdb chạy CHỈ LẦN ĐẦU (datadir trống). PVC persist → đổi script sau này KHÔNG re-run
# (seed-update workflow là việc SF-5 docs).
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-initdb
data:
  01-create-databases.sh: |
    #!/bin/bash
    set -e
    # \gexec = psql meta-command — tạo DB chỉ khi chưa tồn tại (idempotent).
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
      SELECT 'CREATE DATABASE fulfillment'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fulfillment')\gexec
      SELECT 'CREATE DATABASE batching'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'batching')\gexec
      SELECT 'CREATE DATABASE keycloak'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
    EOSQL
```

- [ ] **Step 2: StatefulSet (PVC qua volumeClaimTemplates, pg_isready probes)**

`k8s/base/postgres/statefulset.yaml`:
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
              name: pg
          envFrom:
            - secretRef:
                name: postgres-credentials
          env:
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: pgdata
              mountPath: /var/lib/postgresql/data
            - name: initdb
              mountPath: /docker-entrypoint-initdb.d
          readinessProbe:
            exec:
              command: ["/bin/sh", "-c", "pg_isready -U $POSTGRES_USER -d postgres"]
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            exec:
              command: ["/bin/sh", "-c", "pg_isready -U $POSTGRES_USER -d postgres"]
            initialDelaySeconds: 30
            periodSeconds: 20
          resources:
            requests:
              memory: 256Mi
              cpu: 100m
            limits:
              memory: 1Gi
              cpu: 500m
      volumes:
        - name: initdb
          configMap:
            name: postgres-initdb
            defaultMode: 0755
  volumeClaimTemplates:
    - metadata:
        name: pgdata
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

- [ ] **Step 3: Service**

`k8s/base/postgres/service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  clusterIP: None   # headless — client nối thẳng postgres-0 (single instance dev)
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
      name: pg
```

- [ ] **Step 4: kustomization + build verify**

`k8s/base/postgres/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: hub-store

resources:
  - initdb-configmap.yaml
  - statefulset.yaml
  - service.yaml
```

Verify render (postgres + kafka đã đủ thì build full ở Task 5):
```bash
kubectl kustomize k8s/base/postgres
```
Expected: yaml render, namespace hub-store, không lỗi.

- [ ] **Step 5: Commit**

```bash
git add k8s/base/postgres/
git commit -m "feat(sf1): postgres StatefulSet 16 (PVC 5Gi, initdb 3 DB fulfillment/batching/keycloak, pg_isready probes)"
```

---

### Task 5: Kafka KRaft StatefulSet + Services + health + topic bootstrap

**Files:**
- Create: `k8s/base/kafka/kustomization.yaml`
- Create: `k8s/base/kafka/statefulset.yaml`
- Create: `k8s/base/kafka/services.yaml`
- Create: `k8s/base/kafka/topic-bootstrap.yaml`

- [ ] **Step 1: StatefulSet KRaft combined mode**

`k8s/base/kafka/statefulset.yaml`:
```yaml
# Kafka KRaft single-broker (combined broker+controller) — KHÔNG ZooKeeper.
# Image apache/kafka:3.9.0 — rationale: official image, env convention KAFKA_* map thẳng
# broker properties (đã verify Docker Hub docs), dòng 3.x mature cuối, multi-arch arm64.
# KHÔNG HA (minikube dev — single broker, RF=1). KHÔNG tự đổi topic orders.events (contract SF-5).
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
spec:
  serviceName: kafka-headless
  replicas: 1
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
        - name: kafka
          image: apache/kafka:3.9.0
          ports:
            - containerPort: 9092
              name: plaintext
            - containerPort: 9093
              name: controller
          env:
            - name: KAFKA_NODE_ID
              value: "1"
            - name: KAFKA_PROCESS_ROLES
              value: "broker,controller"
            - name: KAFKA_CONTROLLER_QUORUM_VOTERS
              value: "1@localhost:9093"
            - name: KAFKA_LISTENERS
              value: "PLAINTEXT://:9092,CONTROLLER://:9093"
            # CONTRACT: advertised PHẢI là Service DNS `kafka:9092` — client in-cluster
            # resolve được; sai (vd pod DNS) → broker healthy nhưng SF-5 produce fail.
            - name: KAFKA_ADVERTISED_LISTENERS
              value: "PLAINTEXT://kafka:9092"
            - name: KAFKA_CONTROLLER_LISTENER_NAMES
              value: "CONTROLLER"
            - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
              value: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_TRANSACTION_STATE_LOG_MIN_ISR
              value: "1"
            - name: KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS
              value: "0"
            - name: KAFKA_LOG_DIRS
              value: /var/lib/kafka/data
            # Fixed cluster id (dev) — format storage tự động khi có var này.
            - name: KAFKA_CLUSTER_ID
              value: "5L6g3nShT-eMCtK--X86sw"
            # Heap cap — tránh OOM neighbor trên minikube 6GB chia sẻ Java+Keycloak.
            - name: KAFKA_HEAP_OPTS
              value: "-Xmx1g -Xms512m"
          volumeMounts:
            - name: kafkadata
              mountPath: /var/lib/kafka/data
          readinessProbe:
            exec:
              command:
                - /opt/kafka/bin/kafka-broker-api-versions.sh
                - --bootstrap-server
                - localhost:9092
            initialDelaySeconds: 20
            periodSeconds: 10
            timeoutSeconds: 10
          livenessProbe:
            exec:
              command:
                - /opt/kafka/bin/kafka-broker-api-versions.sh
                - --bootstrap-server
                - localhost:9092
            initialDelaySeconds: 45
            periodSeconds: 20
            timeoutSeconds: 10
          resources:
            requests:
              memory: 512Mi
              cpu: 250m
            limits:
              memory: 1536Mi
              cpu: "1"
  volumeClaimTemplates:
    - metadata:
        name: kafkadata
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

- [ ] **Step 2: Services (client + headless)**

`k8s/base/kafka/services.yaml`:
```yaml
# Client Service — advertised listener trỏ về tên DNS này (`kafka:9092`).
apiVersion: v1
kind: Service
metadata:
  name: kafka
spec:
  selector:
    app: kafka
  ports:
    - port: 9092
      targetPort: 9092
      name: plaintext
---
# Headless — serviceName của StatefulSet (stable identity kafka-0).
apiVersion: v1
kind: Service
metadata:
  name: kafka-headless
spec:
  clusterIP: None
  selector:
    app: kafka
  ports:
    - port: 9092
      name: plaintext
    - port: 9093
      name: controller
```

- [ ] **Step 3: Topic bootstrap Job (CONTRACT orders.events)**

`k8s/base/kafka/topic-bootstrap.yaml`:
```yaml
# Bootstrap topic CONTRACT `orders.events` — KHÔNG TỰ ĐỔI TÊN (cross-SF contract với SF-5;
# đổi chỉ bằng quyết định epic-level). --if-not-exists → re-apply idempotent.
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-topic-bootstrap
spec:
  backoffLimit: 10          # kafka chưa ready → retry (bắt tay chờ broker)
  template:
    metadata:
      labels:
        app: kafka-topic-bootstrap
    spec:
      restartPolicy: OnFailure
      containers:
        - name: create-topic
          image: apache/kafka:3.9.0
          command:
            - /opt/kafka/bin/kafka-topics.sh
            - --bootstrap-server
            - kafka:9092
            - --create
            - --if-not-exists
            - --topic
            - orders.events
            - --partitions
            - "1"
            - --replication-factor
            - "1"
```

- [ ] **Step 4: kustomization**

`k8s/base/kafka/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: hub-store

resources:
  - statefulset.yaml
  - services.yaml
  - topic-bootstrap.yaml
```

- [ ] **Step 5: BUILD VERIFY — composition contract end-to-end (dry run)**

```bash
kubectl kustomize k8s/overlays/minikube
```
Expected: render sạch TẤT CẢ (secrets, postgres, kafka, placeholders 0-resource, ConfigMap canonical-seed KHÔNG hash suffix), namespace hub-store mọi resource, không lỗi.

- [ ] **Step 6: Commit**

```bash
git add k8s/base/kafka/
git commit -m "feat(sf1): kafka KRaft single-broker StatefulSet (apache/kafka:3.9.0, advertised kafka:9092, heap cap) + topic bootstrap orders.events"
```

---

### Task 6: minikube install + start + apply + POSTGRES VERIFY (Rule 0)

**Máy này chưa có minikube — install qua brew (đã nêu Phase 0).**

- [ ] **Step 1: Install + start**

```bash
brew install minikube kubernetes-cli
minikube start --memory=6g --cpus=4 --driver=docker
kubectl config current-context   # expected: minikube
```

- [ ] **Step 2: Apply + đợi postgres healthy**

```bash
kubectl apply -k k8s/overlays/minikube
kubectl -n hub-store rollout status statefulset/postgres --timeout=300s
kubectl -n hub-store get pods
```
Expected: postgres-0 Running 1/1 Ready.

- [ ] **Step 3: Bằng chứng 3 DB (psql thật)**

```bash
kubectl -n hub-store exec postgres-0 -- psql -U hubstore -l
```
Expected: danh sách chứa `fulfillment`, `batching`, `keycloak`.

- [ ] **Step 4: Bằng chứng PVC mount survive restart**

```bash
kubectl -n hub-store rollout restart statefulset/postgres
kubectl -n hub-store rollout status statefulset/postgres --timeout=300s
kubectl -n hub-store exec postgres-0 -- psql -U hubstore -l | grep -c -E 'fulfillment|batching|keycloak'
```
Expected: 3 (data + 3 DB sống qua restart — PVC mount hoạt động).

- [ ] **Step 5: Không commit (verify-only task)** — nếu có fix manifest phát sinh, commit fix riêng `fix(sf1): ...`.

---

### Task 7: KAFKA VERIFY (broker healthy + advertised listener + topic)

- [ ] **Step 1: kafka-0 healthy**

```bash
kubectl -n hub-store rollout status statefulset/kafka --timeout=300s
kubectl -n hub-store get pods -l app=kafka
```
Expected: kafka-0 Running Ready.

- [ ] **Step 2: Topic orders.events tồn tại (kafka-topics qua kubectl run)**

```bash
kubectl -n hub-store run kcheck --rm -i --restart=Never --image apache/kafka:3.9.0 -- \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list
```
Expected: stdout chứa `orders.events`. (KHÔNG qua pod DNS — qua Service DNS `kafka:9092`.)

- [ ] **Step 3: Advertised listener contract — metadata trả `kafka:9092`**

```bash
kubectl -n hub-store run kmeta --rm -i --restart=Never --image apache/kafka:3.9.0 -- \
  /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka:9092 | head -2
```
Expected: dòng broker `kafka:9092 (id: 1 ...)` — KHÔNG phải pod DNS (`kafka-0.kafka-headless...`). Sai → sửa KAFKA_ADVERTISED_LISTENERS rồi re-verify (đây là lỗi kinh điển single-broker-on-k8s).

- [ ] **Step 4: Không commit (verify-only)**

---

### Task 8: Build images script + verify 5 images

**Files:**
- Create: `scripts/k8s-build-images.sh`

- [ ] **Step 1: Script**

`scripts/k8s-build-images.sh`:
```bash
#!/usr/bin/env bash
# ENTRY POINT DUY NHẤT để build app images vào minikube (SF-1 owns; SF-4 deploy script
# CALL script này; SF-2 KHÔNG có build riêng). Tag mặc định dev, override: IMAGE_TAG=xxx.
# TẤT CẢ build context = repo root (Dockerfiles đã verify theo convention này).
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-dev}"
cd "$(dirname "$0")/.."   # repo root

command -v minikube >/dev/null 2>&1 || { echo "✗ minikube chưa cài — bash scripts/k8s-preflight.sh"; exit 1; }
minikube status >/dev/null 2>&1 || { echo "✗ minikube chưa chạy — minikube start --memory=6g --cpus=4"; exit 1; }

build() {
  echo "==> build hub-store/$1:${IMAGE_TAG}"
  minikube image build -f "$2" -t "hub-store/$1:${IMAGE_TAG}" .
}

build fulfillment-service services/fulfillment-service/Dockerfile
build batching-service    services/batching-service/Dockerfile
build print-service       services/print-service/Dockerfile
build bff-gateway         services/bff-gateway/Dockerfile
build web                 Dockerfile.web

echo "==> images in minikube (tag ${IMAGE_TAG}):"
minikube image ls | grep "hub-store/" || { echo "✗ images chưa thấy trong minikube"; exit 1; }
```

- [ ] **Step 2: chmod +x**

```bash
chmod +x scripts/k8s-build-images.sh
command -v shellcheck >/dev/null && shellcheck scripts/k8s-build-images.sh
```

- [ ] **Step 3: CHẠY THẬT (dài — 5 image build trong minikube)**

```bash
bash scripts/k8s-build-images.sh
```
Expected: 5 dòng `hub-store/*:dev` từ `minikube image ls`.

- [ ] **Step 4: Commit**

```bash
git add scripts/k8s-build-images.sh
git commit -m "feat(sf1): k8s-build-images.sh — single entry point, minikube image build x5 (context repo root)"
```

---

### Task 9: Acceptance sweep + audit evidence

- [ ] **Step 1: Chạy lại từng dòng ACCEPTANCE của context pack, lưu output vào `/tmp/story/fi272/sf1-verify.md`**

- preflight exit 0 + output driver/resource/addon
- `minikube image ls | grep hub-store/` → 5 images
- `kubectl kustomize k8s/overlays/minikube` build sạch
- postgres pod + 3 DB + survive restart
- kafka-0 + orders.events + advertised `kafka:9092`

- [ ] **Step 2: Chạy lại preflight fail-loud path (stub PATH) — bằng chứng non-zero**

- [ ] **Step 3: Không commit — evidence phục vụ verify Phase 5 + code review**

---

## Verification map (ACCEPTANCE → task)

| ACCEPTANCE | Task |
|---|---|
| preflight exit 0 / fail-loud non-zero | 3, 6 |
| 5 images hub-store/*:dev | 8 |
| postgres healthy + 3 DB + survive restart | 6 |
| kafka-0 + orders.events + advertised kafka:9092 | 7 |
| apply -k build sạch placeholder dirs | 5 |
