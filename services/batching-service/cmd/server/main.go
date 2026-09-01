// batching-service — Go gRPC server :50052 (spec §3.3, SF-4).
//
// Owns the in-memory batches store, seeded from the canonical fixture at
// boot. Stands alone — KHÔNG thêm vào turbo (context pack rule).
//
// Env:
//   BATCHING_PORT       default 50052
//   FULFILLMENT_ADDR    default localhost:50051 (Java; hydration + mutate)
//   CANONICAL_SEED_PATH default ../../api/seed/canonical-seed.json (từ run.sh)
package main

import (
	"context"
	"log"
	"net"
	"os"

	"hubstore/batching-service/internal/fulfillment"
	"hubstore/batching-service/internal/server"
	"hubstore/batching-service/internal/store"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"google.golang.org/grpc"
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
	seedPath := env("CANONICAL_SEED_PATH", "../../api/seed/canonical-seed.json")

	// Batches store — seed từ canonical fixture (một nguồn, KHÔNG seed riêng).
	st, err := store.LoadSeedFile(seedPath)
	if err != nil {
		log.Fatalf("batching-service: seed load failed: %v", err)
	}
	log.Printf("batching-service: canonical seed loaded from %s", seedPath)

	// Java client — hydration (GetOrdersByCodes) + mutation (MutateOrderStatus).
	fc, err := fulfillment.NewGRPCClient(context.Background(), fulfillAddr)
	if err != nil {
		log.Fatalf("batching-service: %v", err)
	}
	defer fc.Close()
	log.Printf("batching-service: fulfillment-service at %s", fulfillAddr)

	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("batching-service: listen :%s: %v", port, err)
	}
	grpcServer := grpc.NewServer()
	batchingv1.RegisterBatchingServiceServer(grpcServer, server.New(st, fc))
	reflection.Register(grpcServer)

	log.Printf("batching-service: listening on :%s", port)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("batching-service: serve: %v", err)
	}
}
