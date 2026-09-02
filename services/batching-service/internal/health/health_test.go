package health

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/test/bufconn"
)

// Real-wire qua bufconn (đúng convention internal/server/batching_test.go):
// Check phải NOT_SERVING lúc đầu, SERVING sau SetServing — readiness thật.
func TestHealthReadinessLifecycle(t *testing.T) {
	hs := New()
	lis := bufconn.Listen(1024 * 64)
	srv := grpc.NewServer()
	Register(srv, hs)
	go func() { _ = srv.Serve(lis) }()
	defer srv.Stop()

	conn, err := grpc.Dial("bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("dial bufconn: %v", err)
	}
	defer conn.Close()

	client := healthpb.NewHealthClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Trước seed → NOT_SERVING.
	resp, err := client.Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil {
		t.Fatalf("check before seed: %v", err)
	}
	if resp.Status != healthpb.HealthCheckResponse_NOT_SERVING {
		t.Fatalf("trước seed: want NOT_SERVING, got %s", resp.Status)
	}

	SetServing(hs)

	// Sau seed → SERVING.
	resp, err = client.Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil {
		t.Fatalf("check after seed: %v", err)
	}
	if resp.Status != healthpb.HealthCheckResponse_SERVING {
		t.Fatalf("sau seed: want SERVING, got %s", resp.Status)
	}
}
