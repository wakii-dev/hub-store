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
//	RECONCILE_INTERVAL   giây giữa 2 tick reconciler (SF-12 Task 10);
//	                     unset/<=0 = KHÔNG start (mặc định off)
package main

import (
	"context"
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
	"hubstore/batching-service/internal/logging"
	"hubstore/batching-service/internal/reconcile"
	"hubstore/batching-service/internal/server"
	"hubstore/batching-service/internal/store"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

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
		logging.Fatal("batches DB open failed", "component", "batching", "err", err.Error())
	}
	defer st.Close()
	logging.Info("batches DB ready (sequence bootstrapped)",
		"component", "batching",
		"db_host", env("BATCHING_DB_HOST", "localhost"),
		"db_port", env("BATCHING_DB_PORT", "5432"),
		"db_name", env("BATCHING_DB_NAME", "batching"))
	health.SetServing(hs)

	// Java client — dial LAZY (không WithBlock): boot không cần Java đang chạy;
	// conn tự reconnect, hydration/mutate chỉ khi serve request (client deadline).
	jconn, err := grpc.DialContext(ctx, fulfillAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		logging.Fatal("fulfillment dial failed", "component", "batching", "addr", fulfillAddr, "err", err.Error())
	}
	defer jconn.Close()
	fc := fulfillment.NewGRPCClientFromConn(jconn)
	logging.Info("fulfillment-service dial lazy — boot không phụ thuộc", "component", "batching", "addr", fulfillAddr)

	// SF-27 — Kafka side-channel publisher (best-effort; off mặc định).
	var events kafka.BatchEventPublisher = kafka.NoopPublisher{}
	if env("KAFKA_ENABLED", "") == "true" {
		events = kafka.NewKafkaPublisher(strings.Split(
			env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"), ","))
		logging.Info("kafka events enabled", "component", "batching",
			"brokers", env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"))
	}

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		logging.Fatal("listen failed", "component", "batching", "port", port, "err", err.Error())
	}

	// NVC adapter (SF-15, dual-mode) — mock mặc định / real khi AHAMOVE_MODE=real
	// + đủ key. Boot chọn + log mode; mọi response mock mang meta.mock=true.
	nvc := ahamove.NewFromEnv()

	// Pool riêng cho DeliveryBatch V2 schema (plannings/bookings/...) —
	// PostgresStore đóng pool của nó khi Close; pool thứ 2 cùng DSN là cách
	// sạch nhất mà không đụng logic store cũ (SF-3).
	nvcPool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logging.Fatal("delivery-batch DB pool failed", "component", "batching", "err", err.Error())
	}
	defer nvcPool.Close()
	if err := nvcPool.Ping(ctx); err != nil {
		logging.Fatal("delivery-batch DB ping failed", "component", "batching", "err", err.Error())
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
			logging.Warn("health http server error", "component", "health", "port", healthPort, "err", err.Error())
		}
	}()

	logging.Info("listening", "component", "batching", "grpc_port", port, "health_http_port", healthPort)

	// SF-12 Task 10 — reconciliation job: dọn orphan PREPARING (spec §3.6).
	// Off mặc định (RECONCILE_INTERVAL unset/<=0). Dùng chung conn lazy tới
	// Java; actor audit x-user-name=reconciler do reconciler tự gắn metadata.
	recInterval := reconcile.IntervalFromEnv()
	var recCancel context.CancelFunc
	if recInterval > 0 {
		recCtx, cancel := context.WithCancel(ctx)
		recCancel = cancel
		go func() {
			logging.Info("reconciler started", "component", "reconciler",
				"interval", recInterval.String())
			reconcile.New(
				fulfillmentv1.NewFulfillmentServiceClient(jconn),
				st.Pool(), recInterval, 30*time.Second).Run(recCtx)
		}()
	} else {
		logging.Info("reconciler disabled", "component", "reconciler")
	}

	serveErr := grpcServer.Serve(lis)
	// Graceful stop — reconciler + HTTP health tắt trước khi process thoát.
	if recCancel != nil {
		recCancel()
	}
	shCtx, shCancel := context.WithTimeout(context.Background(), 3*time.Second)
	_ = healthSrv.Shutdown(shCtx)
	shCancel()
	if serveErr != nil {
		logging.Fatal("serve failed", "component", "batching", "err", serveErr.Error())
	}
}
