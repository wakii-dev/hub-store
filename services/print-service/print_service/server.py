"""gRPC server bootstrap — :50053 (spec SF-5 pin).

Standalone: python -m print_service hoặc ./run.sh. KHÔNG thêm vào turbo.
"""
from __future__ import annotations

import logging
import os
from concurrent import futures

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

from ._proto import print_pb2, print_pb2_grpc
from .fonts import register_fonts
from .printers import load_printers
from .servicer import PrintServicer

PORT = int(os.environ.get("GRPC_PRINT_PORT", "50053"))  # private-port seam

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("print-service")


def create_server(port: int = PORT, printers=None) -> grpc.Server:
    """Tạo server (dùng chung cho main + tests). Fail-fast nếu seed lỗi."""
    # SF-2: grpc.health.v1 — NOT_SERVING tới khi seed (printers) load xong.
    health_servicer = health.HealthServicer()
    health_servicer.set("", health_pb2.HealthCheckResponse.NOT_SERVING)
    registry = printers if printers is not None else load_printers()
    register_fonts()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    print_pb2_grpc.add_PrintServiceServicer_to_server(PrintServicer(registry), server)
    # SF-2: reflection — grpcurl smoke (scripts/grpc-health-smoke.sh) cần discover
    # (Java có sẵn qua devh, Go register reflection — 3 service phải đồng bộ).
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    reflection.enable_server_reflection(
        (print_pb2.DESCRIPTOR.services_by_name["PrintService"].full_name,
         health_pb2.DESCRIPTOR.services_by_name["Health"].full_name),
        server,
    )
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
    server.add_insecure_port(f"[::]:{port}")
    return server


def main() -> None:
    server = create_server()
    server.start()
    logger.info("print-service listening on :%d", PORT)
    server.wait_for_termination()


if __name__ == "__main__":
    main()
