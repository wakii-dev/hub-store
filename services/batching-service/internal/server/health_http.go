// Package server — HTTP health side-port (SF-12 Task 4, spec §3.3).
//
// gRPC health (internal/health) chỉ phục vụ grpcurl/smoke; compose probe cần
// HTTP. Server này chạy side-port :${HEALTH_PORT:8082} (8081=Keycloak,
// 8083=Java health), GET /health ping pgx pool → JSON:
//
//	200 {"status":"ok","db":"ok"}
//	503 {"status":"degraded","db":"down"}
//
// Pinger interface để unit test không cần DB thật (*pgxpool.Pool khớp signature).
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Pinger — subset *pgxpool.Pool cần cho health (Ping(ctx) error).
type Pinger interface {
	Ping(ctx context.Context) error
}

// healthBody — struct thay map để thứ tự field JSON ổn định (map sort key).
type healthBody struct {
	Status string `json:"status"`
	DB     string `json:"db"`
}

// NewHealthHTTP tạo *http.Server (chưa start — caller chạy ListenAndServe trong
// goroutine + Shutdown lúc graceful stop).
func NewHealthHTTP(pinger Pinger, port string) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		if err := pinger.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(healthBody{Status: "degraded", DB: "down"})
			return
		}
		_ = json.NewEncoder(w).Encode(healthBody{Status: "ok", DB: "ok"})
	})
	return &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}
