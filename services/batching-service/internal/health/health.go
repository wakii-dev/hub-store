// Package health — grpc.health.v1 readiness cho batching-service (SF-2).
//
// Additive-only (context pack FI-272): KHÔNG refactor, KHÔNG đụng dial code.
// Readiness thật: NOT_SERVING lúc tạo — SERVING CHỈ sau khi seed load xong.
package health

import (
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// New — health server ở trạng thái NOT_SERVING (health.NewServer mặc định
// SERVING nên phải override ngay — readiness KHÔNG được nói dối).
func New() *health.Server {
	hs := health.NewServer()
	hs.SetServingStatus("", healthpb.HealthCheckResponse_NOT_SERVING)
	return hs
}

// SetServing — flip overall status sau khi seed load thành công.
func SetServing(hs *health.Server) {
	hs.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
}

// Register — wire health service vào grpc server.
func Register(s grpc.ServiceRegistrar, hs *health.Server) {
	healthpb.RegisterHealthServer(s, hs)
}
