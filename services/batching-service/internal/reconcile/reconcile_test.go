package reconcile

// Integration tests — testdb harness (batching DB thật, skip khi không có
// Postgres) + fake Java stateful (FilterOrders/MutateOrderStatus in-memory,
// mutate đổi state → idempotency testable). activity_log actor=reconciler là
// write phía Java (ActorInterceptor đọc x-user-name) — test assert hợp đồng
// metadata outbound thay vì row DB fulfillment.

import (
	"context"
	"testing"
	"time"

	"hubstore/batching-service/internal/testdb"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// fakeJava — Java fulfillment stateful: orders theo fulfillCode; mutate thành
// công → batchStatus đổi (giống mockfulfillment nhưng chỉ surface cần cho
// reconcile + ghi nhận metadata outbound từng call).
type fakeJava struct {
	orders map[string]*fulfillmentv1.HubStoreOrderFilterItem

	mutCalls   []mutCall // bản copy field thường — tránh copy proto message (vet lock)
	mutMD      []metadata.MD
	filterMD   []metadata.MD
	failMutate bool
}

func newFakeJava(orders map[string]fulfillmentv1.BatchStatus) *fakeJava {
	f := &fakeJava{orders: map[string]*fulfillmentv1.HubStoreOrderFilterItem{}}
	for c, st := range orders {
		f.orders[c] = &fulfillmentv1.HubStoreOrderFilterItem{
			FulfillCode: c, BatchStatus: st,
		}
	}
	return f
}

func (f *fakeJava) FilterOrders(ctx context.Context, req *fulfillmentv1.FilterOrdersRequest, _ ...grpc.CallOption) (*fulfillmentv1.FilterOrdersResponse, error) {
	if md, ok := metadata.FromOutgoingContext(ctx); ok {
		f.filterMD = append(f.filterMD, md)
	}
	page, size := req.GetPage(), req.GetPageSize()
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 10
	}
	var items []*fulfillmentv1.HubStoreOrderFilterItem
	for _, o := range f.orders {
		match := len(req.GetBatchStatuses()) == 0
		for _, st := range req.GetBatchStatuses() {
			if o.GetBatchStatus() == st {
				match = true
				break
			}
		}
		if match {
			items = append(items, o)
		}
	}
	// fake nhỏ: đủ page-slice cho vòng paginate của Tick.
	start := (page - 1) * size
	if start >= int32(len(items)) {
		items = nil
	} else {
		end := start + size
		if end > int32(len(items)) {
			end = int32(len(items))
		}
		items = items[start:end]
	}
	return &fulfillmentv1.FilterOrdersResponse{Items: items, Total: int64(len(items))}, nil
}

func (f *fakeJava) MutateOrderStatus(ctx context.Context, req *fulfillmentv1.MutateOrderStatusRequest, _ ...grpc.CallOption) (*fulfillmentv1.MutateOrderStatusResponse, error) {
	if md, ok := metadata.FromOutgoingContext(ctx); ok {
		f.mutMD = append(f.mutMD, md)
	}
	if f.failMutate {
		return nil, context.DeadlineExceeded
	}
	resp := &fulfillmentv1.MutateOrderStatusResponse{}
	for _, c := range req.GetFulfillCodes() {
		o, ok := f.orders[c]
		if !ok {
			resp.Results = append(resp.Results, &fulfillmentv1.MutateOrderStatusResult{
				FulfillCode: c, Success: false, Message: "not found"})
			continue
		}
		o.BatchStatus = req.GetTargetBatchStatus() // stateful — idempotency testable
		resp.Results = append(resp.Results, &fulfillmentv1.MutateOrderStatusResult{
			FulfillCode: c, Success: true})
	}
	f.mutCalls = append(f.mutCalls, mutCall{
		codes:     append([]string(nil), req.GetFulfillCodes()...),
		target:    req.GetTargetBatchStatus(),
		reason:    req.GetReason(),
		batchCode: req.GetBatchCode(),
	})
	return resp, nil
}

// mutCall — snapshot 1 lần MutateOrderStatus (không giữ proto message).
type mutCall struct {
	codes     []string
	target    fulfillmentv1.BatchStatus
	reason    string
	batchCode string
}

// setupPool — testdb harness rồi dọn seed canonical (test tự nạp fixture).
func setupPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testdb.Pool(t)
	if _, err := pool.Exec(context.Background(),
		`DELETE FROM batch_items; DELETE FROM batches`); err != nil {
		t.Fatalf("clear seed: %v", err)
	}
	return pool
}

// seedBatch — insert 1 batch (status theo BatchEntityStatus: 0 ACTIVE,
// 2 CANCELLED) chứa các order_code (= fulfill_code, buildItems SF-2).
func seedBatch(t *testing.T, pool *pgxpool.Pool, code string, status int, orderCodes ...string) {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO batches (batch_code, shop_code, status, created_at)
		 VALUES ($1,'SHOP-TEST',$2,now())`, code, status); err != nil {
		t.Fatalf("seed batch %s: %v", code, err)
	}
	for i, oc := range orderCodes {
		if _, err := pool.Exec(ctx,
			`INSERT INTO batch_items (batch_code, stop_order, order_code)
			 VALUES ($1,$2,$3)`, code, i+1, oc); err != nil {
			t.Fatalf("seed item %s/%s: %v", code, oc, err)
		}
	}
}

func newReconciler(f *fakeJava, pool *pgxpool.Pool) *Reconciler {
	return New(f, pool, 50*time.Millisecond, 2*time.Second)
}

// (a) order PREPARING không batch ACTIVE nào → 1 tick → revert NOT_PREPARED
// qua Java + metadata actor (x-user-name=reconciler, x-internal-token) —
// Java ghi activity_log actor=reconciler từ metadata này.
func TestTick_OrphanReverted(t *testing.T) {
	t.Setenv("INTERNAL_SERVICE_TOKEN", "test-internal-token")
	pool := setupPool(t)
	f := newFakeJava(map[string]fulfillmentv1.BatchStatus{
		"ORD-9001": fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING,
	})
	r := newReconciler(f, pool)
	r.Tick(context.Background())

	if len(f.mutCalls) != 1 {
		t.Fatalf("mutate calls = %d, want 1", len(f.mutCalls))
	}
	call := f.mutCalls[0]
	if len(call.codes) != 1 || call.codes[0] != "ORD-9001" {
		t.Fatalf("reverted codes = %v, want [ORD-9001]", call.codes)
	}
	if call.target != fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED {
		t.Fatalf("target = %v, want NOT_PREPARED", call.target)
	}
	if call.reason == "" || call.batchCode != "" {
		t.Fatalf("reason=%q batchCode=%q, want reason set + batchCode empty", call.reason, call.batchCode)
	}
	if f.orders["ORD-9001"].GetBatchStatus() != fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED {
		t.Fatalf("fake state after revert = %v, want NOT_PREPARED", f.orders["ORD-9001"].GetBatchStatus())
	}
	// metadata outbound: actor + internal token (Java auth matrix path 2).
	if len(f.mutMD) == 0 {
		t.Fatal("no mutate metadata captured")
	}
	md := f.mutMD[0]
	if got := md.Get("x-user-name"); len(got) != 1 || got[0] != "reconciler" {
		t.Fatalf("x-user-name = %v, want [reconciler]", got)
	}
	if got := md.Get("x-internal-token"); len(got) != 1 || got[0] != "test-internal-token" {
		t.Fatalf("x-internal-token = %v, want [test-internal-token]", got)
	}
	// filter call cũng mang cùng metadata.
	if len(f.filterMD) == 0 || f.filterMD[0].Get("x-user-name") == nil {
		t.Fatal("filter call missing metadata")
	}
}

// (b) order PREPARING nằm trong batch ACTIVE → untouched.
func TestTick_ActiveBatchUntouched(t *testing.T) {
	pool := setupPool(t)
	seedBatch(t, pool, "B-9001", 0 /* ACTIVE */, "ORD-9002")
	f := newFakeJava(map[string]fulfillmentv1.BatchStatus{
		"ORD-9002": fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING,
	})
	r := newReconciler(f, pool)
	r.Tick(context.Background())

	if len(f.mutCalls) != 0 {
		t.Fatalf("mutate calls = %d, want 0 (order in ACTIVE batch)", len(f.mutCalls))
	}
	// batch vẫn nguyên trạng trong DB.
	var status int
	if err := pool.QueryRow(context.Background(),
		`SELECT status FROM batches WHERE batch_code='B-9001'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != 0 {
		t.Fatalf("batch status = %d, want 0 (ACTIVE, untouched)", status)
	}
}

// (c) idempotent: tick 2 lần — lần 2 zero revert (đơn đã NOT_PREPARED sau
// revert lần 1 → FilterOrders không còn trả).
func TestTick_IdempotentSecondTickZeroRevert(t *testing.T) {
	pool := setupPool(t)
	f := newFakeJava(map[string]fulfillmentv1.BatchStatus{
		"ORD-9003": fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING,
	})
	r := newReconciler(f, pool)
	r.Tick(context.Background())
	first := len(f.mutCalls)
	if first != 1 {
		t.Fatalf("tick 1 mutate calls = %d, want 1", first)
	}
	r.Tick(context.Background())
	if got := len(f.mutCalls); got != first {
		t.Fatalf("tick 2 mutate calls = %d (total), want still %d — not idempotent", got, first)
	}
}

// (d) batch CANCELLED chứa code → VẪN revert (orphan criteria: chỉ ACTIVE
// tính là match).
func TestTick_CancelledBatchStillOrphan(t *testing.T) {
	pool := setupPool(t)
	seedBatch(t, pool, "B-9002", 2 /* CANCELLED */, "ORD-9004")
	f := newFakeJava(map[string]fulfillmentv1.BatchStatus{
		"ORD-9004": fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING,
	})
	r := newReconciler(f, pool)
	r.Tick(context.Background())

	if len(f.mutCalls) != 1 {
		t.Fatalf("mutate calls = %d, want 1 (CANCELLED batch không cứu orphan)", len(f.mutCalls))
	}
	if f.mutCalls[0].target != fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED {
		t.Fatalf("target = %v, want NOT_PREPARED", f.mutCalls[0].target)
	}
}

// (d2) COMPLETED cũng KHÔNG tính match (contract: chỉ ACTIVE).
func TestTick_CompletedBatchStillOrphan(t *testing.T) {
	pool := setupPool(t)
	seedBatch(t, pool, "B-9003", 1 /* COMPLETED */, "ORD-9005")
	f := newFakeJava(map[string]fulfillmentv1.BatchStatus{
		"ORD-9005": fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING,
	})
	r := newReconciler(f, pool)
	r.Tick(context.Background())

	if len(f.mutCalls) != 1 {
		t.Fatalf("mutate calls = %d, want 1 (COMPLETED batch không cứu orphan)", len(f.mutCalls))
	}
}

// Ticker loop: chạy Run với interval nhỏ, cancel ctx → return (không treo);
// skip-tick path không panic.
func TestRun_StopsOnContextCancel(t *testing.T) {
	pool := setupPool(t)
	f := newFakeJava(nil)
	r := newReconciler(f, pool)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		r.Run(ctx)
		close(done)
	}()
	time.Sleep(120 * time.Millisecond) // >2 tick
	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Run did not stop after ctx cancel")
	}
}

// IntervalFromEnv: unset / rác / <= 0 → 0 (không start); giá trị dương → giây.
func TestIntervalFromEnv(t *testing.T) {
	cases := []struct {
		val  string
		want time.Duration
	}{
		{"", 0},
		{"0", 0},
		{"-5", 0},
		{"abc", 0},
		{"30", 30 * time.Second},
	}
	for _, c := range cases {
		t.Setenv("RECONCILE_INTERVAL", c.val) // "" ≡ unset với IntervalFromEnv
		if got := IntervalFromEnv(); got != c.want {
			t.Errorf("RECONCILE_INTERVAL=%q → %v, want %v", c.val, got, c.want)
		}
	}
}
