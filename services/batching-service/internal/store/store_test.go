package store

// Tests FI-245 SF-3 — PostgresStore trên DB test riêng (batching_test, migrations
// applied + seed fixture từ canonical-seed.json). Skip-if-no-DB qua testdb.Pool
// (ping fail → t.Skip) — `go test ./...` pass khi không có Postgres.

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"hubstore/batching-service/internal/testdb"
)

// SF-5 convergence regression: Java OffsetDateTime.toString() bỏ giây khi =0
// ("2026-09-03T01:00Z") — layout RFC3339 thuần fail → delivery_time NULL
// (D2 render NaN). ParseTime phải chấp nhận cả hai dạng.
func TestParseTime(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want time.Time
	}{
		{"rfc3339 đủ giây", "2026-09-03T01:00:00Z", time.Date(2026, 9, 3, 1, 0, 0, 0, time.UTC)},
		{"rfc3339 offset", "2026-09-03T08:00:00+07:00", time.Date(2026, 9, 3, 8, 0, 0, 0, time.FixedZone("", 7*3600))},
		{"không giây Z (Java)", "2026-09-03T01:00Z", time.Date(2026, 9, 3, 1, 0, 0, 0, time.UTC)},
		{"không giây offset (Java)", "2026-09-03T08:00+07:00", time.Date(2026, 9, 3, 8, 0, 0, 0, time.FixedZone("", 7*3600))},
		{"rỗng → zero", "", time.Time{}},
		{"rác → zero", "not-a-time", time.Time{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ParseTime(c.in); !got.Equal(c.want) {
				t.Fatalf("ParseTime(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

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

// ---------------------------------------------------------------------------
// Filter (SF-7) — pagination SQL trên PostgresStore, List() bất biến.
// ---------------------------------------------------------------------------

// putBatch — seed thêm batch ngoài fixture với createdAt cụ thể (Put upsert).
func putBatch(t *testing.T, s *PostgresStore, code string, createdAt string, status batchingv1.BatchEntityStatus) {
	t.Helper()
	b := newBatch(code)
	b.Status = status
	b.CreatedAt = createdAt
	if err := s.Put(context.Background(), b); err != nil {
		t.Fatalf("Put %s: %v", code, err)
	}
}

// Seed 7 + 8 batch "Z-" (createdAt 2099) = 15, pageSize 10 → 2 trang: duyệt
// đủ 15 code, không trùng, không thiếu, khớp tập List.
func TestFilter_PaginationTraversal(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	for i := 1; i <= 8; i++ {
		putBatch(t, s, fmt.Sprintf("Z-%02d", i), fmt.Sprintf("2099-01-%02dT00:00:00Z", i),
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE)
	}
	want, err := s.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	wantCodes := map[string]bool{}
	for _, b := range want {
		wantCodes[b.GetBatchCode()] = true
	}

	seen := map[string]bool{}
	var total int64
	for page := 1; ; page++ {
		items, tot, err := s.Filter(ctx, BatchFilter{Page: page, PageSize: 10})
		if err != nil {
			t.Fatalf("Filter page %d: %v", page, err)
		}
		total = tot
		for _, b := range items {
			code := b.GetBatchCode()
			if seen[code] {
				t.Fatalf("page %d: trùng code %s giữa các trang", page, code)
			}
			if !wantCodes[code] {
				t.Fatalf("page %d: code lạ %s", page, code)
			}
			seen[code] = true
		}
		if len(items) < 10 {
			break
		}
	}
	if total != int64(len(want)) {
		t.Fatalf("total = %d, want %d", total, len(want))
	}
	if len(seen) != len(wantCodes) {
		t.Fatalf("duyệt được %d/%d code — thiếu trang", len(seen), len(wantCodes))
	}
}

// Filter không filter → cùng thứ tự createdAt → batchCode như List.
func TestFilter_OrderingCreatedAtThenCode(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	all, err := s.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	items, total, err := s.Filter(ctx, BatchFilter{Page: 1, PageSize: 100})
	if err != nil {
		t.Fatalf("Filter: %v", err)
	}
	if total != int64(len(all)) || len(items) != len(all) {
		t.Fatalf("Filter total=%d items=%d, want %d", total, len(items), len(all))
	}
	for i := range all {
		if all[i].GetBatchCode() != items[i].GetBatchCode() {
			t.Fatalf("thứ tự lệch tại %d: List=%s Filter=%s",
				i, all[i].GetBatchCode(), items[i].GetBatchCode())
		}
	}
}

// Statuses + search: search khớp CẢ batch_code VÀ order_code của items;
// wildcard user (%) bị escape — match literal như in-memory.
func TestFilter_StatusesAndSearch(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	// Statuses: seed có 3 COMPLETED (BATCH-0002/0004/0007).
	items, total, err := s.Filter(ctx, BatchFilter{
		Statuses: []batchingv1.BatchEntityStatus{
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED,
		},
		Page: 1, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Filter statuses: %v", err)
	}
	if total != 3 || len(items) != 3 {
		t.Fatalf("statuses COMPLETED: total=%d items=%d, want 3/3", total, len(items))
	}
	for _, b := range items {
		if b.GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED {
			t.Fatalf("lọt status %s: %s", b.GetStatus(), b.GetBatchCode())
		}
	}

	// Search theo batch_code (case-insensitive).
	items, total, err = s.Filter(ctx, BatchFilter{Search: "batch-0001", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("Filter search code: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].GetBatchCode() != "BATCH-0001" {
		t.Fatalf("search batch_code: total=%d items=%v, want [BATCH-0001]", total, items)
	}

	// Search theo order_code của item (RSA-700107 thuộc BATCH-0001).
	items, total, err = s.Filter(ctx, BatchFilter{Search: "RSA-700107", Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("Filter search order_code: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].GetBatchCode() != "BATCH-0001" {
		t.Fatalf("search order_code: total=%d items=%v, want [BATCH-0001]", total, items)
	}

	// Wildcard % user bị escape — seed không có '%' literal → 0 match.
	if _, total, err = s.Filter(ctx, BatchFilter{Search: "%", Page: 1, PageSize: 10}); err != nil || total != 0 {
		t.Fatalf("search '%%' → total=%d err=%v, want 0 (escape hoạt động)", total, err)
	}

	// Combo: ACTIVE + search code của 1 batch ACTIVE (BATCH-0003).
	items, total, err = s.Filter(ctx, BatchFilter{
		Search: "BATCH-0003",
		Statuses: []batchingv1.BatchEntityStatus{
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE,
		},
		Page: 1, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Filter combo: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].GetBatchCode() != "BATCH-0003" {
		t.Fatalf("combo: total=%d items=%v, want [BATCH-0003]", total, items)
	}
	// Combo lệch status: BATCH-0003 không COMPLETED → 0.
	if _, total, err = s.Filter(ctx, BatchFilter{
		Search: "BATCH-0003",
		Statuses: []batchingv1.BatchEntityStatus{
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED,
		},
		Page: 1, PageSize: 10,
	}); err != nil || total != 0 {
		t.Fatalf("combo lệch status: total=%d err=%v, want 0", total, err)
	}
}

// Page vượt last page → items rỗng NHƯNG total vẫn đúng (LEFT JOIN LATERAL
// anchor — pattern SF-2).
func TestFilter_TotalBeyondLastPage(t *testing.T) {
	s := newStore(t)
	items, total, err := s.Filter(context.Background(), BatchFilter{Page: 99, PageSize: 10})
	if err != nil {
		t.Fatalf("Filter page 99: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("items = %d, want 0", len(items))
	}
	if total != 7 {
		t.Fatalf("total = %d, want 7 (seed fixture)", total)
	}
}

// CreatedFrom/CreatedTo lọc theo created_at (timestamptz).
func TestFilter_CreatedRange(t *testing.T) {
	s := newStore(t)
	from := time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC) // gồm BATCH-0001/0003/0006 (01:30Z/03:15Z/04:00Z ngày 2/9)
	to := time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)  // gồm BATCH-0004 (30/8 07:00Z) + BATCH-0005 (29/8 01:45Z); loại-trừ (<)
	items, total, err := s.Filter(context.Background(), BatchFilter{CreatedFrom: &from, Page: 1, PageSize: 10})
	if err != nil || total != 3 {
		t.Fatalf("CreatedFrom 2026-09-02: total=%d err=%v, want 3", total, err)
	}
	items, total, err = s.Filter(context.Background(), BatchFilter{CreatedTo: &to, Page: 1, PageSize: 10})
	if err != nil || total != 2 {
		t.Fatalf("CreatedTo 2026-08-31 (loại-trừ): total=%d err=%v, want 2", total, err)
	}
	if len(items) == 0 {
		t.Fatal("CreatedTo phải trả items")
	}
}
