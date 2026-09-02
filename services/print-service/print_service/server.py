"""gRPC server bootstrap — :50053 (spec SF-5 pin).

Standalone: python -m print_service hoặc ./run.sh. KHÔNG thêm vào turbo.
"""
from __future__ import annotations

import logging
from concurrent import futures

import grpc

from ._proto import print_pb2_grpc
from .fonts import register_fonts
from .printers import load_printers
from .servicer import PrintServicer

PORT = 50053

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("print-service")


def create_server(port: int = PORT, printers=None) -> grpc.Server:
    """Tạo server (dùng chung cho main + tests). Fail-fast nếu seed lỗi."""
    registry = printers if printers is not None else load_printers()
    register_fonts()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    print_pb2_grpc.add_PrintServiceServicer_to_server(PrintServicer(registry), server)
    server.add_insecure_port(f"[::]:{port}")
    return server


def main() -> None:
    server = create_server()
    server.start()
    logger.info("print-service listening on :%d", PORT)
    server.wait_for_termination()


if __name__ == "__main__":
    main()
