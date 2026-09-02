#!/usr/bin/env bash
# SF-4 deploy — minikube local. BUILD = scripts/k8s-build-images.sh (SF-1, ENTRY POINT
# DUY NHẤT — script này CALL, không duplicate build logic). APPLY overlay + đợi rollout.
# Idempotent: chạy lại sạch (kubectl apply + rollout status đều an toàn re-run).
#   bash scripts/k8s-deploy.sh           # build + deploy + đợi Ready
#   IMAGE_TAG=v2 bash scripts/k8s-deploy.sh   # tag khác (khớp overlay images newTag)
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE_TAG="${IMAGE_TAG:-dev}"

# 1. Build 5 images vào minikube (script SF-1 — preflight minikube status bên trong).
IMAGE_TAG="$IMAGE_TAG" bash scripts/k8s-build-images.sh

# 2. Apply overlay (namespace hub-store — kustomize namespace transformer + namespace.yaml).
echo "==> kubectl apply -k k8s/overlays/minikube"
kubectl apply -k k8s/overlays/minikube

# 3. Đợi từng deployment Ready (fail-loud, không loop vô hạn).
for d in fulfillment batching print bff web; do
  echo "==> rollout status deployment/$d"
  kubectl rollout status "deployment/$d" -n hub-store --timeout=300s
done

echo "==> DONE — pods:"
kubectl get pods -n hub-store
echo "==> Smoke qua ingress:"
echo "    MINIKUBE_IP=\$(minikube ip)"
echo "    curl http://\$MINIKUBE_IP/                    # shell"
echo "    curl http://\$MINIKUBE_IP/api/healthz          # bff"
echo "    curl http://\$MINIKUBE_IP/remotes/orders/remoteEntry.js"
