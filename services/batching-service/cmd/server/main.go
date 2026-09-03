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
//	HEALTH_PORT          default 8082 (SF-12 HTTP /health side-port)
//	KAFKA_ENABLED        "true" bật publisher SF-27; off (mặc định) = Noop
//	KAFKA_BOOTSTRAP_SERVERS default localhost:9092 (chỉ đọc khi KAFKA_ENABLED=true)
package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"hubstore/batching-service/internal/ahamove"
	"hubstore/batching-service/internal/fulfillment"
	"hubstore/batching-service/internal/health"
	"hubstore/batching-service/internal/kafka"
	"hubstore/batching-service/internal/server"
	"hubstore/batching-service/internal/store"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"github.com/jackc/pgx/v5/pgxpool"
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

	// gRPC health (SF-2): NOT_SERVING tới khi batches DB open xong.
	hs := health.New()

	// Batches store — Postgres (schema V1 + seed pipeline SF-1 nạp data).
	st, err := store.OpenPostgres(ctx, dsn)
	if err != nil {
		log.Fatalf("batching-service: batches DB open failed: %v", err)
	}
	defer st.Close()
	log.Printf("batching-service: batches DB %s:%s/%s ready (sequence bootstrapped)",
		env("BATCHING_DB_HOST", "localhost"), env("BATCHING_DB_PORT", "5432"), env("BATCHING_DB_NAME", "batching"))
	health.SetServing(hs)

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

	// SF-27 — Kafka side-channel publisher (best-effort; off mặc định).
	var events kafka.BatchEventPublisher = kafka.NoopPublisher{}
	if env("KAFKA_ENABLED", "") == "true" {
		events = kafka.NewKafkaPublisher(strings.Split(
			env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"), ","))
		log.Printf("batching-service: kafka events enabled → %s", env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"))
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("batching-service: listen :%s: %v", port, err)
	}

	// NVC adapter (SF-15, dual-mode) — mock mặc định / real khi AHAMOVE_MODE=real
	// + đủ key. Boot chọn + log mode; mọi response mock mang meta.mock=true.
	nvc := ahamove.NewFromEnv()

	// Pool riêng cho DeliveryBatch V2 schema (plannings/bookings/...) —
	// PostgresStore đóng pool của nó khi Close; pool thứ 2 cùng DSN là cách
	// sạch nhất mà không đụng logic store cũ (SF-3).
	nvcPool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("batching-service: delivery-batch DB pool: %v", err)
	}
	defer nvcPool.Close()
	if err := nvcPool.Ping(ctx); err != nil {
		log.Fatalf("batching-service: delivery-batch DB ping: %v", err)
	}

	// SF-12: auth interceptor (token passthrough / internal token) chạy TRƯỚC
	// role interceptor — auth derive role từ claim, role interceptor chỉ đọc.
	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(
		server.AuthUnaryInterceptor,
		server.RoleUnaryInterceptor,
	))
	srv := server.New(st, fc)
	srv.SetEventPublisher(events)
	batchingv1.RegisterBatchingServiceServer(grpcServer, srv)
	batchingv1.RegisterDeliveryBatchServiceServer(grpcServer, server.NewDeliveryBatch(nvcPool, nvc))
	health.Register(grpcServer, hs) // SF-2: grpc.health.v1
	reflection.Register(grpcServer)

	// SF-12 — HTTP health side-port (compose probe; gRPC health vẫn giữ cho
	// grpcurl/smoke). Ping batches DB pool — 503 khi DB chết.
	healthPort := env("HEALTH_PORT", "8082")
	healthSrv := server.NewHealthHTTP(st.Pool(), healthPort)
	go func() {
		if err := healthSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("batching-service: health http :%s: %v", healthPort, err)
		}
	}()

	log.Printf("batching-service: listening on :%s (health http :%s)", port, healthPort)
	serveErr := grpcServer.Serve(lis)
	// Graceful stop — HTTP health tắt trước khi process thoát.
	shCtx, shCancel := context.WithTimeout(context.Background(), 3*time.Second)
	_ = healthSrv.Shutdown(shCtx)
	shCancel()
	if serveErr != nil {
		log.Fatalf("batching-service: serve: %v", serveErr)
	}
}
