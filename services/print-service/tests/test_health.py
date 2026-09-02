"""SF-2 — grpc.health.v1 smoke qua real-wire server (create_server dùng chung)."""
from __future__ import annotations

import grpc
import pytest
from grpc_health.v1 import health_pb2, health_pb2_grpc

from print_service.server import create_server


@pytest.fixture()
def health_channel():
    server = create_server(port=0)
    port = server.add_insecure_port("[::]:0")
    server.start()
    channel = grpc.insecure_channel(f"localhost:{port}")
    yield channel
    channel.close()
    server.stop(grace=None)


def test_health_serving_after_seed_load(health_channel):
    """Seed load xong trước khi server bind → Check overall phải SERVING."""
    stub = health_pb2_grpc.HealthStub(health_channel)
    resp = stub.Check(health_pb2.HealthCheckRequest(service=""))
    assert resp.status == health_pb2.HealthCheckResponse.SERVING


def test_health_unknown_service_not_found(health_channel):
    stub = health_pb2_grpc.HealthStub(health_channel)
    with pytest.raises(grpc.RpcError) as exc:
        stub.Check(health_pb2.HealthCheckRequest(service="no-such"))
    assert exc.value.code() == grpc.StatusCode.NOT_FOUND
