// mock-fulfillment — dev-only stub của Java fulfillment-service (:50051).
//
// Cho phép chạy smoke batching-service ĐỘC LẬP khi Java (SF-3) chưa chạy:
//
//	go run ./cmd/mock-fulfillment   # terminal 1
//	./run.sh                        # terminal 2
//
// KHÔNG dùng cho integration verify thật — chain Go→Java thật là việc của
// SF-11 (context pack boundary).
package main

import (
	"log"
	"net"
	"os"

	"hubstore/batching-service/internal/mockfulfillment"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	seedPath := os.Getenv("CANONICAL_SEED_PATH")
	if seedPath == "" {
		seedPath = "../../api/seed/canonical-seed.json"
	}
	port := os.Getenv("MOCK_FULFILLMENT_PORT")
	if port == "" {
		port = "50051"
	}
	srv, err := mockfulfillment.New(seedPath)
	if err != nil {
		log.Fatalf("mock-fulfillment: %v", err)
	}
	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("mock-fulfillment: listen :%s: %v", port, err)
	}
	g := grpc.NewServer()
	fulfillmentv1.RegisterFulfillmentServiceServer(g, srv)
	reflection.Register(g)
	log.Printf("mock-fulfillment: seed-backed stub on :%s", port)
	if err := g.Serve(lis); err != nil {
		log.Fatalf("mock-fulfillment: %v", err)
	}
}
