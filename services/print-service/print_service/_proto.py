"""Import bridge cho generated protos (SF-2 authored — KHÔNG đổi).

Generated code nằm ở <repo-root>/api/proto/gen/python. Thư mục đó được thêm
vào sys.path để import hubstore.print.v1.* hoạt động cả khi service chạy
standalone (run.sh) lẫn từ pytest.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GEN_PYTHON = _REPO_ROOT / "api" / "proto" / "gen" / "python"
_SEED_PATH = _REPO_ROOT / "api" / "seed" / "canonical-seed.json"

# Env override (hữu ích khi seed được mount chỗ khác trong deploy).
_SEED_OVERRIDE = os.environ.get("PRINT_SERVICE_SEED_PATH")


def repo_root() -> Path:
    return _REPO_ROOT


def seed_path() -> Path:
    return Path(_SEED_OVERRIDE) if _SEED_OVERRIDE else _SEED_PATH


if str(_GEN_PYTHON) not in sys.path:
    sys.path.insert(0, str(_GEN_PYTHON))

# Re-export để module khác `from ._proto import print_pb2` được luôn.
from hubstore.print.v1 import print_pb2, print_pb2_grpc  # noqa: E402

__all__ = ["print_pb2", "print_pb2_grpc"]
