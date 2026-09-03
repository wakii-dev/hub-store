// Package fulfillment — gRPC client tới Java fulfillment-service (SF-3).
//
// Mutation contract (spec §3.3): CHỈ Java mutate order — Go gọi
// MutateOrderStatus sau create/cancel/complete-picking. Đọc để validate
// rule 1 §3.6: Go gọi GetOrdersByCodes (server-side truth, không tin FE).
//
// Chain THẬT Go→Java được SF-11 verify backend-only; ở SF-4 client này được
// mock trong go test (context pack: "unit test mock Java server").
package fulfillment

import (
	"context"
	"fmt"
	"time"

	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

// roleKey — context key mang x-user-role đã extract từ incoming metadata
// (unary interceptor của batching server gắn vào trước khi handler gọi Java).
type roleKey struct{}

// NewRoleContext gắn role vào context (gọi từ interceptor).
func NewRoleContext(ctx context.Context, role string) context.Context {
	return context.WithValue(ctx, roleKey{}, role)
}

// RoleFromContext đọc role từ context.
func RoleFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(roleKey{}).(string); ok {
		return v
	}
	return ""
}

// Client is the surface batching-service needs from Java. Interface (thay vì
// concrete stub) để unit test thay thế bằng mock server.
type Client interface {
	// GetOrdersByCodes — hydration: truth về kho + batchStatus của từng đơn.
	GetOrdersByCodes(ctx context.Context, codes []string) ([]*fulfillmentv1.HubStoreOrderFilterItem, error)
	// MutateOrderStatus — đổi batchStatus của các đơn (one-way mutation).
	// batchCode: mã phiếu soạn truyền qua để Java eager-insert cod_confirmations
	// đúng batch (SF-14: không pass → Java insert batch_code rỗng, COD filter hụt).
	MutateOrderStatus(ctx context.Context, codes []string, target fulfillmentv1.BatchStatus, reason, batchCode string) error
	// Close releases the underlying gRPC connection.
	Close() error
}

// GRPCClient is the real Client over a gRPC connection to Java (:50051).
// x-user-role: server interceptor extract từ incoming metadata (BFF gắn) →
// NewRoleContext → mỗi call forward outgoing metadata sang Java.
type GRPCClient struct {
	conn *grpc.ClientConn
	stub fulfillmentv1.FulfillmentServiceClient
}

// NewGRPCClientFromConn wraps an existing connection (bufconn test / DI).
func NewGRPCClientFromConn(conn *grpc.ClientConn) *GRPCClient {
	return &GRPCClient{conn: conn, stub: fulfillmentv1.NewFulfillmentServiceClient(conn)}
}

// NewGRPCClient dials the Java fulfillment-service at addr.
func NewGRPCClient(ctx context.Context, addr string) (*GRPCClient, error) {
	conn, err := grpc.DialContext(ctx, addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithTimeout(5*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("dial fulfillment-service %s: %w", addr, err)
	}
	return &GRPCClient{conn: conn, stub: fulfillmentv1.NewFulfillmentServiceClient(conn)}, nil
}

func (c *GRPCClient) ctx(ctx context.Context) context.Context {
	if role := RoleFromContext(ctx); role != "" {
		return metadata.AppendToOutgoingContext(ctx, "x-user-role", role)
	}
	return ctx
}

// GetOrdersByCodes implements Client.
func (c *GRPCClient) GetOrdersByCodes(ctx context.Context, codes []string) ([]*fulfillmentv1.HubStoreOrderFilterItem, error) {
	resp, err := c.stub.GetOrdersByCodes(c.ctx(ctx), &fulfillmentv1.GetOrdersByCodesRequest{
		FulfillCodes: codes,
	})
	if err != nil {
		return nil, err
	}
	return resp.Orders, nil
}

// MutateOrderStatus implements Client.
func (c *GRPCClient) MutateOrderStatus(ctx context.Context, codes []string, target fulfillmentv1.BatchStatus, reason, batchCode string) error {
	req := &fulfillmentv1.MutateOrderStatusRequest{
		FulfillCodes:      codes,
		TargetBatchStatus: target,
	}
	if reason != "" {
		r := reason
		req.Reason = &r
	}
	if batchCode != "" {
		b := batchCode
		req.BatchCode = &b
	}
	resp, err := c.stub.MutateOrderStatus(c.ctx(ctx), req)
	if err != nil {
		return err
	}
	// Per-code failures surface as errors — mutation is all-or-nothing for Go.
	for _, r := range resp.Results {
		if !r.Success {
			return fmt.Errorf("mutate %s: %s", r.FulfillCode, r.Message)
		}
	}
	return nil
}

// Close implements Client.
func (c *GRPCClient) Close() error { return c.conn.Close() }
