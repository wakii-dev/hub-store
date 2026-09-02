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
