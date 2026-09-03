"""gRPC server bootstrap — :50053 (spec SF-5 pin).

Standalone: python -m print_service hoặc ./run.sh. KHÔNG thêm vào turbo.
"""
from __future__ import annotations

import logging
import os
import threading
from concurrent import futures
from http.server import BaseHTTPRequestHandler, HTTPServer

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

from ._proto import print_pb2, print_pb2_grpc
from .fonts import register_fonts
from .printers import load_printers
from .servicer import PrintServicer

PORT = int(os.environ.get("GRPC_PRINT_PORT", "50053"))  # private-port seam
# SF-12 — HTTP liveness side-port (compose probe; gRPC health vẫn giữ).
HEALTH_PORT = int(os.environ.get("PRINT_HEALTH_PORT", "8084"))

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


def _start_health_http(port: int = HEALTH_PORT) -> HTTPServer:
    """Liveness HTTP :8084 (SF-12) — print KHÔNG có DB → chỉ {status:ok} 200."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 (stdlib API)
            if self.path == "/health":
                body = b'{"status":"ok"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args: object) -> None:  # im — probe 10s/lần
            pass

    httpd = HTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True, name="health-http").start()
    return httpd


def main() -> None:
    server = create_server()
    server.start()
    _start_health_http()
    logger.info("print-service listening on :%d (health http :%d)", PORT, HEALTH_PORT)
    server.wait_for_termination()


if __name__ == "__main__":
    main()
