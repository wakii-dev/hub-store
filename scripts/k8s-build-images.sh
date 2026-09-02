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
