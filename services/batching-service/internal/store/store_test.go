package store

// Tests FI-245 SF-3 — PostgresStore trên DB test riêng (batching_test, migrations
// applied + seed fixture từ canonical-seed.json). Skip-if-no-DB qua testdb.Pool
// (ping fail → t.Skip) — `go test ./...` pass khi không có Postgres.

import (
	"context"
	"sync"
	"testing"

	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"hubstore/batching-service/internal/testdb"
)

func newStore(t *testing.T) *PostgresStore {
	t.Helper()
	testdb.Pool(t) // setup DB + seed fixture (skip khi không có Postgres)
	s, err := OpenPostgres(context.Background(), testdb.DSN())
	if err != nil {
		t.Fatalf("OpenPostgres: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

// Seed contract (context pack spec slice §2): 7 phiếu đủ 3 trạng thái,
// items[].orderCode trỏ đúng orders seed.
func TestSeedFixture_List(t *testing.T) {
	s := newStore(t)
	all, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 7 {
		t.Fatalf("expected 7 seeded batches, got %d", len(all))
	}
	counts := map[batchingv1.BatchEntityStatus]int{}
	for _, b := range all {
		counts[b.GetStatus()]++
		for _, it := range b.GetItems() {
			if it.GetBatchCode() != b.GetBatchCode() {
				t.Errorf("item %s batchCode mismatch: %s", it.GetOrderCode(), it.GetBatchCode())
			}
		}
	}
	for st, want := range map[batchingv1.BatchEntityStatus]int{
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE:    3,
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED: 3,
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED: 1,
	} {
		if counts[st] != want {
			t.Errorf("status %s: got %d, want %d", st, counts[st], want)
		}
	}
}

// List ordering giữ semantics cũ: createdAt → batchCode.
func TestList_OrderingCreatedAtThenCode(t *testing.T) {
	s := newStore(t)
	all, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for i := 1; i < len(all); i++ {
		prev, cur := all[i-1], all[i]
		if prev.GetCreatedAt() > cur.GetCreatedAt() ||
			(prev.GetCreatedAt() == cur.GetCreatedAt() && prev.GetBatchCode() > cur.GetBatchCode()) {
			t.Fatalf("ordering violated at %d: %s/%s > %s/%s",
				i, prev.GetBatchCode(), prev.GetCreatedAt(), cur.GetBatchCode(), cur.GetCreatedAt())
		}
	}
}

// Bootstrap sequence = max batchCode seed → code kế tiếp BATCH-0008.
func TestNextBatchCode(t *testing.T) {
	s := newStore(t)
	got, err := s.NextBatchCode(context.Background())
	if err != nil {
		t.Fatalf("NextBatchCode: %v", err)
	}
	if got != "BATCH-0008" {
		t.Fatalf("NextBatchCode = %s, want BATCH-0008", got)
	}
	// Preview KHÔNG tiêu thụ sequence — gọi lần nữa vẫn 0008.
	if got, _ = s.NextBatchCode(context.Background()); got != "BATCH-0008" {
		t.Fatalf("NextBatchCode consumed sequence: %s", got)
	}
}

// Bảng rỗng + sequence fresh → bootstrap về 1,false → create đầu = BATCH-0001.
func TestBootstrapSequence_EmptyDB(t *testing.T) {
	pool := testdb.Pool(t) // truncate + seed; cần truncate lại cho case rỗng
	if _, err := pool.Exec(context.Background(), "TRUNCATE batch_items, batches"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), "SELECT setval('batches_code_seq', 1, false)"); err != nil {
		t.Fatal(err)
	}
	s, err := OpenPostgres(context.Background(), testdb.DSN())
	if err != nil {
		t.Fatalf("OpenPostgres: %v", err)
	}
	defer s.Close()
	b, ok, err := s.CreateWithNextCode(context.Background(), func(_ context.Context, code string) *batchingv1.Batch {
		return newBatch(code)
	})
	if err != nil || !ok {
		t.Fatalf("create: ok=%v err=%v", ok, err)
	}
	if b.GetBatchCode() != "BATCH-0001" {
		t.Fatalf("first create on empty DB = %s, want BATCH-0001", b.GetBatchCode())
	}
}

func newBatch(code string) *batchingv1.Batch {
	return &batchingv1.Batch{
		BatchCode: code,
		Status:    batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE,
	}
}

func TestGetDelete(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	if err := s.Put(ctx, newBatch("B-1")); err != nil {
		t.Fatalf("Put: %v", err)
	}
	g, err := s.Get(ctx, "B-1")
	if err != nil || g == nil {
		t.Fatalf("Get(B-1) = %v, %v", g, err)
	}
	// returned copy must not alias store state
	g.Status = batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED
	g2, _ := s.Get(ctx, "B-1")
	if g2.GetStatus() == batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED {
		t.Fatal("Get returned alias, want copy")
	}
	if err := s.Delete(ctx, "B-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if b, _ := s.Get(ctx, "B-1"); b != nil {
		t.Fatal("Delete failed")
	}
	if b, err := s.Get(ctx, "B-404"); err != nil || b != nil {
		t.Fatalf("Get unknown = %v, %v — want nil,nil", b, err)
	}
}

// CAS + sequence atomic — giữ test logic cũ qua integration Postgres.
func TestCreateWithNextCode_Sequence(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	b, ok, err := s.CreateWithNextCode(ctx, func(_ context.Context, code string) *batchingv1.Batch {
		return newBatch(code)
	})
	if err != nil || !ok || b.GetBatchCode() != "BATCH-0008" {
		t.Fatalf("create = %s ok=%v err=%v, want BATCH-0008", b.GetBatchCode(), ok, err)
	}
	b2, ok, err := s.CreateWithNextCode(ctx, func(_ context.Context, code string) *batchingv1.Batch {
		return newBatch(code)
	})
	if err != nil || !ok || b2.GetBatchCode() != "BATCH-0009" {
		t.Fatalf("second create = %s ok=%v err=%v, want BATCH-0009", b2.GetBatchCode(), ok, err)
	}
	// items persist qua round-trip.
	if got, _ := s.Get(ctx, "BATCH-0008"); got.GetBatchCode() != "BATCH-0008" {
		t.Fatal("created batch không đọc lại được từ DB")
	}
}

// ACCEPTANCE: 2 CreateBatch đồng thời → 2 code khác nhau (sequence atomic).
func TestCreateWithNextCode_Concurrent(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	const n = 8
	codes := make([]string, n)
	var wg sync.WaitGroup
	var mu sync.Mutex
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			b, _, err := s.CreateWithNextCode(ctx, func(_ context.Context, code string) *batchingv1.Batch {
				return newBatch(code)
			})
			if err != nil {
				t.Errorf("concurrent create: %v", err)
				return
			}
			mu.Lock()
			codes[i] = b.GetBatchCode()
			mu.Unlock()
		}(i)
	}
	wg.Wait()
	seen := map[string]bool{}
	for _, c := range codes {
		if c == "" {
			t.Fatal("missing code")
		}
		if seen[c] {
			t.Fatalf("trùng code %s — sequence không atomic", c)
		}
		seen[c] = true
	}
}

func TestTransition_CAS(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	if err := s.Put(ctx, newBatch("B-1")); err != nil {
		t.Fatal(err)
	}
	// sai from → (nil,nil), không đổi.
	if b, err := s.Transition(ctx, "B-1", batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED, batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED); err != nil || b != nil {
		t.Fatalf("transition with wrong from = %v, %v — want nil,nil", b, err)
	}
	if g, _ := s.Get(ctx, "B-1"); g.GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE {
		t.Fatal("status must be unchanged")
	}
	if b, err := s.Transition(ctx, "B-1", batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE, batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED); err != nil || b == nil {
		t.Fatalf("valid transition = %v, %v — must succeed", b, err)
	}
	if b, err := s.Transition(ctx, "B-404", batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE, batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED); err != nil || b != nil {
		t.Fatalf("unknown code = %v, %v — want nil,nil", b, err)
	}
	// persist: đọc lại đúng status sau transition.
	if g, _ := s.Get(ctx, "B-1"); g.GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED {
		t.Fatal("transition status không persist")
	}
}
