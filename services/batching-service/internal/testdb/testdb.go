// Package testdb — test helper cho PostgresStore tests (FI-245 SF-3).
//
// Tạo DB riêng `batching_test` (KHÔNG đụng data dev DB `batching`), apply
// migrations từ services/batching-service/migrations/*.up.sql, TRUNCATE rồi
// nạp fixture từ canonical-seed.json (mapping trùng scripts/seed-db.sh).
//
// Skip-if-no-DB: ping fail → t.Skip (go test ./... pass không cần Postgres).
package testdb

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DSN từ env (test runner set khi muốn chạy integration); default localhost
// dev compose map. POSTGRES_PASSWORD bắt buộc (compose fail-loud cũng vậy).
func dsn(db string) string {
	host := envOr("BATCHING_DB_HOST", "localhost")
	port := envOr("BATCHING_DB_PORT", "5432")
	user := envOr("BATCHING_DB_USER", "hubstore")
	pass := os.Getenv("POSTGRES_PASSWORD")
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, db)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

const testDBName = "batching_test"

// DSN trả connection string tới batching_test (PostgresStore tests dùng
// chung với Pool).
func DSN() string { return dsn(testDBName) }

// Pool returns a connected pool to batching_test with migrations applied,
// tables truncated, and the canonical seed fixture loaded. Skips the test
// when Postgres is unreachable (POSTGRES_PASSWORD unset cũng skip — không
// có credential thì không có DB test).
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("POSTGRES_PASSWORD") == "" {
		t.Skip("POSTGRES_PASSWORD not set — skip Postgres integration test")
	}
	ctx := context.Background()

	createTestDB(t, ctx)

	pool, err := pgxpool.New(ctx, dsn(testDBName))
	if err != nil {
		t.Fatalf("connect %s: %v", testDBName, err)
	}
	t.Cleanup(pool.Close)
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("postgres unreachable — skip integration test: %v", err)
	}

	applyMigrations(t, ctx, pool)
	truncate(ctx, t, pool)
	Seed(t, ctx, pool)
	return pool
}

func createTestDB(t *testing.T, ctx context.Context) {
	t.Helper()
	maint, err := pgx.Connect(ctx, dsn("postgres"))
	if err != nil {
		t.Skipf("postgres unreachable — skip integration test: %v", err)
	}
	defer maint.Close(ctx)
	if _, err := maint.Exec(ctx, "CREATE DATABASE "+testDBName); err != nil {
		// 42P04 duplicate_database = đã có → dùng lại.
		if pgErr := err.Error(); !strings.Contains(pgErr, "42P04") && !strings.Contains(pgErr, "already exists") {
			t.Fatalf("create %s: %v", testDBName, err)
		}
	}
}

// applyMigrations đọc services/batching-service/migrations/*.up.sql (sorted)
// và exec — tests không cần golang-migrate binary/lib.
func applyMigrations(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	// internal/testdb → services/batching-service/migrations.
	mdir := filepath.Join(wd, "..", "..", "migrations")
	entries, err := os.ReadDir(mdir)
	if err != nil {
		t.Fatalf("read migrations dir %s: %v", mdir, err)
	}
	var ups []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			ups = append(ups, e.Name())
		}
	}
	sort.Strings(ups)
	for _, up := range ups {
		sql, err := os.ReadFile(filepath.Join(mdir, up))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("apply migration %s: %v", up, err)
		}
	}
}

func truncate(ctx context.Context, t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(ctx, "TRUNCATE batch_items, batches"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

// seedShape — subset canonical-seed.json mà batching DB dùng (giống seed
// struct Go cũ đã xoá khỏi store.go — test-only).
type seedShape struct {
	Batches []seedBatch `json:"batches"`
}
type seedBatch struct {
	BatchCode    string          `json:"batchCode"`
	ShopCode     string          `json:"shopCode"`
	ShipperID    string          `json:"shipperId"`
	DeliveryTime struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"deliveryTime"`
	Status    int32           `json:"status"`
	Items     []seedBatchItem `json:"items"`
	CreatedAt string          `json:"createdAt"`
}
type seedBatchItem struct {
	BatchCode        string          `json:"batchCode"`
	StopOrder        int32           `json:"stopOrder"`
	OrderCode        string          `json:"orderCode"`
	CustomerAddress  string          `json:"customerAddress"`
	Distance         float64         `json:"distance"`
	FromDeliveryTime string          `json:"fromDeliveryTime"`
	ToDeliveryTime   string          `json:"toDeliveryTime"`
	OrderStatus      int32           `json:"orderStatus"`
	OrderType        int32           `json:"orderType"`
	Items            []seedProduct   `json:"items"`
	TotalQuantity    int32           `json:"totalQuantity"`
	CodAmount        int64           `json:"codAmount"`
}
type seedProduct struct {
	ProductCode string `json:"productCode"`
	ProductName string `json:"productName"`
	Quantity    int32  `json:"quantity"`
}

// Seed nạp fixture batches + batch_items từ canonical-seed.json (mapping =
// scripts/seed-db.sh). Exported để server test fixture dùng chung.
func Seed(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	seedPath := envOr("CANONICAL_SEED_PATH",
		filepath.Join(wdRoot(t), "api", "seed", "canonical-seed.json"))
	data, err := os.ReadFile(seedPath)
	if err != nil {
		t.Fatalf("read seed fixture %s: %v", seedPath, err)
	}
	var s seedShape
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatalf("parse seed fixture: %v", err)
	}
	for _, b := range s.Batches {
		if _, err := pool.Exec(ctx, `INSERT INTO batches
			(batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to, status, created_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			b.BatchCode, b.ShopCode, b.ShipperID, fromStr(b.DeliveryTime.From), fromStr(b.DeliveryTime.To), b.Status, fromStr(b.CreatedAt)); err != nil {
			t.Fatalf("seed batch %s: %v", b.BatchCode, err)
		}
		for _, it := range b.Items {
			items, _ := json.Marshal(it.Items)
			if _, err := pool.Exec(ctx, `INSERT INTO batch_items
				(batch_code, stop_order, order_code, customer_address, distance,
				 from_delivery_time, to_delivery_time, order_status, order_type,
				 items, total_quantity, cod_amount)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
				it.BatchCode, it.StopOrder, it.OrderCode, it.CustomerAddress, it.Distance,
				fromStr(it.FromDeliveryTime), fromStr(it.ToDeliveryTime),
				it.OrderStatus, it.OrderType, string(items), it.TotalQuantity, it.CodAmount); err != nil {
				t.Fatalf("seed item %s/%d: %v", it.BatchCode, it.StopOrder, err)
			}
		}
	}
}

// wdRoot — repo root từ internal/testdb: <root>/services/batching-service/internal/testdb.
func wdRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(wd, "..", "..", "..", "..")
}

// fromStr parse ISO-8601; empty → nil (nullable timestamptz).
func fromStr(s string) any {
	if s == "" {
		return nil
	}
	return s // pgx parse text → timestamptz
}
