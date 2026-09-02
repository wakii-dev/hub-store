// batching-service — Go gRPC server :50052 (spec §3.3).
//
// Batches store trên Postgres (FI-245 SF-3) — schema do golang-migrate tạo
// (compose batches-migrate / Dockerfile entrypoint), data do seed pipeline
// SF-1 nạp. Boot KHÔNG phụ thuộc Java: gRPC client dial lazy (non-blocking,
// tự reconnect) — hydration chỉ khi serve request, client deadline.
//
// Env:
//
//	BATCHING_PORT        default 50052
//	BATCHING_DB_HOST     default localhost
//	BATCHING_DB_PORT     default 5432
//	BATCHING_DB_NAME     default batching
//	BATCHING_DB_USER     default hubstore
//	BATCHING_DB_PASSWORD required (compose/.env wire)
//	FULFILLMENT_ADDR     default localhost:50051 (Java; hydration + mutate)
package main

import (
	"context"
	"log"
	"net"
	"net/url"
	"os"

	"hubstore/batching-service/internal/ahamove"
	"hubstore/batching-service/internal/fulfillment"
	"hubstore/batching-service/internal/server"
	"hubstore/batching-service/internal/store"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/reflection"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	port := env("BATCHING_PORT", "50052")
	fulfillAddr := env("FULFILLMENT_ADDR", "localhost:50051")
	// DSN qua net/url — password chứa ký tự đặc biệt (@ : / ? #) được escape.
	dsn := (&url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(env("BATCHING_DB_USER", "hubstore"), os.Getenv("BATCHING_DB_PASSWORD")),
		Host:     net.JoinHostPort(env("BATCHING_DB_HOST", "localhost"), env("BATCHING_DB_PORT", "5432")),
		Path:     "/" + env("BATCHING_DB_NAME", "batching"),
		RawQuery: "sslmode=disable",
	}).String()

	ctx := context.Background()

	// Batches store — Postgres (schema V1 + seed pipeline SF-1 nạp data).
	st, err := store.OpenPostgres(ctx, dsn)
	if err != nil {
		log.Fatalf("batching-service: batches DB open failed: %v", err)
	}
	defer st.Close()
	log.Printf("batching-service: batches DB %s:%s/%s ready (sequence bootstrapped)",
		env("BATCHING_DB_HOST", "localhost"), env("BATCHING_DB_PORT", "5432"), env("BATCHING_DB_NAME", "batching"))

	// Java client — dial LAZY (không WithBlock): boot không cần Java đang chạy;
	// conn tự reconnect, hydration/mutate chỉ khi serve request (client deadline).
	jconn, err := grpc.DialContext(ctx, fulfillAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("batching-service: %v", err)
	}
	defer jconn.Close()
	fc := fulfillment.NewGRPCClientFromConn(jconn)
	log.Printf("batching-service: fulfillment-service at %s (lazy — boot không phụ thuộc)", fulfillAddr)

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("batching-service: listen :%s: %v", port, err)
	}

	// NVC adapter (SF-15, dual-mode) — mock mặc định / real khi AHAMOVE_MODE=real
	// + đủ key. Boot chỉ chọn + log mode; DeliveryBatchService (task T4) sẽ
	// consume adapter này khi register lên gRPC server.
	_ = ahamove.NewFromEnv()

	grpcServer := grpc.NewServer(grpc.UnaryInterceptor(server.RoleUnaryInterceptor))
	batchingv1.RegisterBatchingServiceServer(grpcServer, server.New(st, fc))
	reflection.Register(grpcServer)

	log.Printf("batching-service: listening on :%s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("batching-service: serve: %v", err)
	}
}
