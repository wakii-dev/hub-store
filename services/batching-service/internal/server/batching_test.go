package server

// Integration tests — REAL gRPC wire qua bufconn: batching server + mock Java
// fulfillment server đều chạy gRPC thật (context pack: "unit test mock Java
// server — KHÔNG cần Java thật"; chain Go→Java thật = SF-11).

import (
	"context"
	"net"
	"os"
	"testing"
	"time"

	"hubstore/batching-service/internal/fulfillment"
	"hubstore/batching-service/internal/mockfulfillment"
	"hubstore/batching-service/internal/store"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const seedPath = "../../../../api/seed/canonical-seed.json"

// wireClient adapts the generated stub (dialed over bufconn) to the
// fulfillment.Client interface — exercises the REAL client code path.
type wireClient struct {
	stub fulfillmentv1.FulfillmentServiceClient
}

func (w *wireClient) GetOrdersByCodes(ctx context.Context, codeList []string) ([]*fulfillmentv1.HubStoreOrderFilterItem, error) {
	resp, err := w.stub.GetOrdersByCodes(ctx, &fulfillmentv1.GetOrdersByCodesRequest{FulfillCodes: codeList})
	if err != nil {
		return nil, err
	}
	return resp.Orders, nil
}

func (w *wireClient) MutateOrderStatus(ctx context.Context, codeList []string, target fulfillmentv1.BatchStatus, reason string) error {
	req := &fulfillmentv1.MutateOrderStatusRequest{FulfillCodes: codeList, TargetBatchStatus: target}
	if reason != "" {
		r := reason
		req.Reason = &r
	}
	resp, err := w.stub.MutateOrderStatus(ctx, req)
	if err != nil {
		return err
	}
	for _, r := range resp.Results {
		if !r.Success {
			return status.Errorf(codes.Internal, "mutate %s: %s", r.FulfillCode, r.Message)
		}
	}
	return nil
}

func (w *wireClient) Close() error { return nil }

var _ fulfillment.Client = (*wireClient)(nil)

func insecureCreds() credentials.TransportCredentials { return insecure.NewCredentials() }

type fixture struct {
	t        *testing.T
	client   batchingv1.BatchingServiceClient
	java     *mockfulfillment.Server
	batching *BatchingServer
}

func startFixture(t *testing.T) *fixture {
	t.Helper()
	java, err := mockfulfillment.New(seedPath)
	if err != nil {
		t.Fatalf("mock java: %v", err)
	}
	jlis := bufconn.Listen(1024 * 1024)
	jgrpc := grpc.NewServer()
	fulfillmentv1.RegisterFulfillmentServiceServer(jgrpc, java)
	go func() { _ = jgrpc.Serve(jlis) }()
	t.Cleanup(jgrpc.Stop)

	jconn, err := grpc.DialContext(context.Background(), "bufnet-java",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return jlis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecureCreds()),
		grpc.WithBlock(), grpc.WithTimeout(5*time.Second),
	)
	if err != nil {
		t.Fatalf("dial mock java: %v", err)
	}
	t.Cleanup(func() { _ = jconn.Close() })

	st, err := store.LoadSeedFile(seedPath)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	srv := New(st, &wireClient{stub: fulfillmentv1.NewFulfillmentServiceClient(jconn)})

	blis := bufconn.Listen(1024 * 1024)
	bgrpc := grpc.NewServer()
	batchingv1.RegisterBatchingServiceServer(bgrpc, srv)
	go func() { _ = bgrpc.Serve(blis) }()
	t.Cleanup(bgrpc.Stop)

	bconn, err := grpc.DialContext(context.Background(), "bufnet-batching",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return blis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecureCreds()),
		grpc.WithBlock(), grpc.WithTimeout(5*time.Second),
	)
	if err != nil {
		t.Fatalf("dial batching: %v", err)
	}
	t.Cleanup(func() { _ = bconn.Close() })

	return &fixture{
		t:        t,
		client:   batchingv1.NewBatchingServiceClient(bconn),
		java:     java,
		batching: srv,
	}
}

func (f *fixture) mustCode(err error) codes.Code {
	f.t.Helper()
	return status.Code(err)
}

// --- Filter / detail / criteria (seed evidence) ---

func TestFilterBatches_SeedHasAllThreeStatuses(t *testing.T) {
	f := startFixture(t)
	resp, err := f.client.FilterBatches(context.Background(), &batchingv1.FilterBatchesRequest{})
	if err != nil {
		t.Fatalf("FilterBatches: %v", err)
	}
	if resp.GetTotal() != 7 {
		t.Fatalf("total = %d, want 7", resp.GetTotal())
	}
	seen := map[batchingv1.BatchEntityStatus]bool{}
	for _, b := range resp.GetItems() {
		seen[b.GetStatus()] = true
	}
	if !seen[batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE] ||
		!seen[batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED] ||
		!seen[batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED] {
		t.Fatalf("seed filter không đủ 3 trạng thái: %v (ACCEPTANCE)", seen)
	}
}

func TestFilterBatches_StatusAndSearchAndPagination(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()

	resp, err := f.client.FilterBatches(ctx, &batchingv1.FilterBatchesRequest{
		Statuses: []batchingv1.BatchEntityStatus{batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE},
	})
	if err != nil || resp.GetTotal() != 3 {
		t.Fatalf("ACTIVE filter: total=%d err=%v", resp.GetTotal(), err)
	}

	// search theo số đơn (item.orderCode).
	resp, err = f.client.FilterBatches(ctx, &batchingv1.FilterBatchesRequest{Search: "700107"})
	if err != nil || resp.GetTotal() != 1 || resp.GetItems()[0].GetBatchCode() != "BATCH-0001" {
		t.Fatalf("search orderCode: total=%d err=%v", resp.GetTotal(), err)
	}
	// search theo số phiếu.
	resp, _ = f.client.FilterBatches(ctx, &batchingv1.FilterBatchesRequest{Search: "batch-0003"})
	if resp.GetTotal() != 1 || resp.GetItems()[0].GetBatchCode() != "BATCH-0003" {
		t.Fatalf("search batchCode case-insensitive failed")
	}

	// createdTime range = 2026-09-02 → BATCH-0001/0003/0006.
	resp, err = f.client.FilterBatches(ctx, &batchingv1.FilterBatchesRequest{
		CreatedTime: &fulfillmentv1.TimeRange{
			From: "2026-09-01T00:00:00+07:00",
			To:   "2026-09-02T23:59:59+07:00",
		},
	})
	if err != nil || resp.GetTotal() != 3 {
		t.Fatalf("createdTime filter: total=%d err=%v", resp.GetTotal(), err)
	}

	// pagination: 7 batches, pageSize=3, page=2 → 3 items.
	resp, err = f.client.FilterBatches(ctx, &batchingv1.FilterBatchesRequest{Page: 2, PageSize: 3})
	if err != nil || len(resp.GetItems()) != 3 || resp.GetPage() != 2 || resp.GetPageSize() != 3 {
		t.Fatalf("pagination: n=%d page=%d err=%v", len(resp.GetItems()), resp.GetPage(), err)
	}
}

func TestGetBatchDetail_FoundAnd404(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()
	resp, err := f.client.GetBatchDetail(ctx, &batchingv1.GetBatchDetailRequest{BatchCode: "BATCH-0001"})
	if err != nil || len(resp.GetBatch().GetItems()) != 3 {
		t.Fatalf("detail BATCH-0001: err=%v items=%d", err, len(resp.GetBatch().GetItems()))
	}
	if resp.GetBatch().GetItems()[0].GetStopOrder() != 1 {
		t.Fatalf("first item stopOrder = %d, want 1", resp.GetBatch().GetItems()[0].GetStopOrder())
	}
	_, err = f.client.GetBatchDetail(ctx, &batchingv1.GetBatchDetailRequest{BatchCode: "BATCH-9999"})
	if f.mustCode(err) != codes.NotFound {
		t.Fatalf("404 expected, got %v", err)
	}
}

func TestGetBatchCriteria_OnlyActive(t *testing.T) {
	f := startFixture(t)
	resp, err := f.client.GetBatchCriteria(context.Background(), &batchingv1.GetBatchCriteriaRequest{})
	if err != nil {
		t.Fatalf("criteria: %v", err)
	}
	got := resp.GetCancellableStatuses()
	if len(got) != 1 || got[0] != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE {
		t.Fatalf("criteria = %v, want [ACTIVE]", got)
	}
}

// --- Create: rule 1 hydration + mutate PREPARING ---

func TestCreateBatch_Success_HydratesAndMutates(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()
	resp, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		ShopCode:     "", // BFF gửi trống → Go derive từ hydration
		ShipperId:    "STAFF-001",
		DeliveryTime: &fulfillmentv1.TimeRange{From: "2026-09-03T08:00:00+07:00", To: "2026-09-03T12:00:00+07:00"},
		FulfillCodes: []string{"ORD-3001", "ORD-3002"},
	})
	if err != nil {
		t.Fatalf("CreateBatch: %v", err)
	}
	b := resp.GetBatch()
	if b.GetBatchCode() != "BATCH-0008" {
		t.Fatalf("batchCode = %s, want BATCH-0008 (ACCEPTANCE: sinh batchCode)", b.GetBatchCode())
	}
	if b.GetShopCode() != "30201" {
		t.Fatalf("shopCode derived = %s, want 30201", b.GetShopCode())
	}
	if b.GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE {
		t.Fatalf("status = %s, want ACTIVE", b.GetStatus())
	}
	for i, it := range b.GetItems() {
		if it.GetStopOrder() != int32(i+1) {
			t.Fatalf("item %d stopOrder = %d (ACCEPTANCE: stopOrder theo thứ tự DnD)", i, it.GetStopOrder())
		}
		wantCode := []string{"ORD-3001", "ORD-3002"}[i]
		if it.GetOrderCode() != wantCode {
			t.Fatalf("item %d orderCode = %s, want %s (echo request code)", i, it.GetOrderCode(), wantCode)
		}
	}

	// Hydration + mutation mock-verify: MutateOrderStatus → Java với PREPARING.
	muts := f.java.Mutations()
	if len(muts) != 1 || muts[0].Target != fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING {
		t.Fatalf("mutations = %+v, want 1x PREPARING (hydration call mock-verified)", muts)
	}
	if bs, _ := f.java.BatchStatusOf("ORD-3001"); bs != fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING {
		t.Fatalf("mock order batchStatus = %s, want PREPARING", bs)
	}

	// batch đã store — detail thấy.
	d, err := f.client.GetBatchDetail(ctx, &batchingv1.GetBatchDetailRequest{BatchCode: "BATCH-0008"})
	if err != nil || d.GetBatch().GetBatchCode() != "BATCH-0008" {
		t.Fatalf("detail after create: %v", err)
	}
}

func TestCreateBatch_RejectsMixedShops(t *testing.T) {
	f := startFixture(t)
	_, err := f.client.CreateBatch(context.Background(), &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001", "ORD-3013"}, // 30201 + 30202
	})
	if f.mustCode(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (rule 1), got %v", err)
	}
	if len(f.java.Mutations()) != 0 {
		t.Fatal("mutation must NOT fire on rule-1 reject")
	}
}

func TestCreateBatch_RejectsNonNotPrepared(t *testing.T) {
	f := startFixture(t)
	_, err := f.client.CreateBatch(context.Background(), &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3007"}, // batchStatus=1 (đang trong BATCH-0001)
	})
	if f.mustCode(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (rule 1 batchStatus), got %v", err)
	}
}

func TestCreateBatch_RejectsUnknownCode(t *testing.T) {
	f := startFixture(t)
	_, err := f.client.CreateBatch(context.Background(), &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001", "ORD-9999"},
	})
	if f.mustCode(err) != codes.InvalidArgument {
		t.Fatalf("want InvalidArgument (unknown), got %v", err)
	}
}

func TestCreateBatch_MutationFailure_Compensates(t *testing.T) {
	f := startFixture(t)
	f.java.FailMutation = true
	_, err := f.client.CreateBatch(context.Background(), &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001"},
	})
	if f.mustCode(err) != codes.Unavailable {
		t.Fatalf("want Unavailable, got %v", err)
	}
	// compensation: batch không được giữ lại.
	_, err = f.client.GetBatchDetail(context.Background(), &batchingv1.GetBatchDetailRequest{BatchCode: "BATCH-0008"})
	if f.mustCode(err) != codes.NotFound {
		t.Fatalf("batch must be rolled back, got %v", err)
	}
}

func TestCreateBatch_HydrationFailure_Unavailable(t *testing.T) {
	f := startFixture(t)
	f.java.FailHydration = true
	_, err := f.client.CreateBatch(context.Background(), &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001"},
	})
	if f.mustCode(err) != codes.Unavailable {
		t.Fatalf("want Unavailable, got %v", err)
	}
}

// --- Cancel (rule 4) + revert ---

func TestCancelBatch_RevertsOrders(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()
	cr, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001", "ORD-3002"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	resp, err := f.client.CancelBatch(ctx, &batchingv1.CancelBatchRequest{
		BatchCode: cr.GetBatch().GetBatchCode(),
		Reason:    "khách hủy",
	})
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if resp.GetBatch().GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED {
		t.Fatalf("status = %s, want CANCELLED", resp.GetBatch().GetStatus())
	}
	// ACCEPTANCE: cancel revert — đơn batchStatus→0 qua Java.
	muts := f.java.Mutations()
	last := muts[len(muts)-1]
	if last.Target != fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED || last.Reason != "khách hủy" {
		t.Fatalf("revert mutation = %+v, want NOT_PREPARED + reason", last)
	}
	if bs, _ := f.java.BatchStatusOf("ORD-3001"); bs != fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED {
		t.Fatalf("reverted batchStatus = %s, want NOT_PREPARED", bs)
	}
}

func TestCancelBatch_RejectsNonActive_Rule4(t *testing.T) {
	f := startFixture(t)
	_, err := f.client.CancelBatch(context.Background(), &batchingv1.CancelBatchRequest{
		BatchCode: "BATCH-0002", // COMPLETED
		Reason:    "x",
	})
	if f.mustCode(err) != codes.FailedPrecondition {
		t.Fatalf("want FailedPrecondition (rule 4), got %v", err)
	}
	_, err = f.client.CancelBatch(context.Background(), &batchingv1.CancelBatchRequest{
		BatchCode: "BATCH-0005", // CANCELLED
	})
	if f.mustCode(err) != codes.FailedPrecondition {
		t.Fatalf("want FailedPrecondition (rule 4), got %v", err)
	}
}

// --- Complete picking ---

func TestCompletePicking_MutatesPrepared(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()
	cr, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3003", "ORD-3004"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	resp, err := f.client.CompletePicking(ctx, &batchingv1.CompletePickingRequest{
		BatchCode: cr.GetBatch().GetBatchCode(),
	})
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	if resp.GetBatch().GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED {
		t.Fatalf("status = %s, want COMPLETED", resp.GetBatch().GetStatus())
	}
	if bs, _ := f.java.BatchStatusOf("ORD-3003"); bs != fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARED {
		t.Fatalf("mock batchStatus = %s, want PREPARED", bs)
	}
	// hoàn tất xong không hủy được nữa (rule 4).
	_, err = f.client.CancelBatch(ctx, &batchingv1.CancelBatchRequest{BatchCode: cr.GetBatch().GetBatchCode()})
	if f.mustCode(err) != codes.FailedPrecondition {
		t.Fatalf("cancel after complete must reject, got %v", err)
	}
}

// --- Packing suggest + recalc (hydration-based) ---

func TestPackingSuggest_GroupsByDistance(t *testing.T) {
	f := startFixture(t)
	// distances: ORD-3010=1.8, ORD-3007=2.5 (gap 0.7 → cùng nhóm), ORD-3021=7.9 (tách nhóm).
	resp, err := f.client.PackingSuggest(context.Background(), &batchingv1.PackingSuggestRequest{
		FulfillCodes: []string{"ORD-3021", "ORD-3007", "ORD-3010"},
	})
	if err != nil {
		t.Fatalf("packing-suggest: %v", err)
	}
	if len(resp.GetGroups()) != 2 {
		t.Fatalf("groups = %d, want 2: %+v", len(resp.GetGroups()), resp.GetGroups())
	}
	g1 := resp.GetGroups()[0]
	if len(g1.GetFulfillCodes()) != 2 || g1.GetFulfillCodes()[0] != "ORD-3010" || g1.GetFulfillCodes()[1] != "ORD-3007" {
		t.Fatalf("group1 = %v, want [ORD-3010 ORD-3007] (thứ tự = đề xuất giao)", g1.GetFulfillCodes())
	}
	if g1.GetTotalDistanceKm() != 4.3 {
		t.Fatalf("group1 total = %v, want 4.3", g1.GetTotalDistanceKm())
	}
	if resp.GetGroups()[1].GetFulfillCodes()[0] != "ORD-3021" {
		t.Fatalf("group2 = %v, want [ORD-3021]", resp.GetGroups()[1].GetFulfillCodes())
	}
}

func TestRecalculateDistance(t *testing.T) {
	f := startFixture(t)
	resp, err := f.client.RecalculateDistance(context.Background(), &batchingv1.RecalculateDistanceRequest{
		FulfillCodes: []string{"ORD-3021", "ORD-3001"},
	})
	if err != nil {
		t.Fatalf("recalc: %v", err)
	}
	byCode := map[string]float64{}
	for _, d := range resp.GetDistances() {
		byCode[d.GetFulfillCode()] = d.GetDistanceKm()
	}
	if byCode["ORD-3021"] != 7.9 {
		t.Fatalf("ORD-3021 = %v, want 7.9 (truth từ hydration)", byCode["ORD-3021"])
	}
	if byCode["ORD-3001"] <= 0 {
		t.Fatalf("ORD-3001 phải derive distance dương, got %v", byCode["ORD-3001"])
	}
}

// --- metadata x-user-role (spec §3.9: services tin BFF) ---

func TestRoleFromContext(t *testing.T) {
	ctx := metadata.NewIncomingContext(context.Background(),
		metadata.Pairs("x-user-role", "HubStoreManager"))
	if got := RoleFromContext(ctx); got != "HubStoreManager" {
		t.Fatalf("RoleFromContext = %q, want HubStoreManager", got)
	}
	if got := RoleFromContext(context.Background()); got != "" {
		t.Fatalf("empty context role = %q, want \"\"", got)
	}
}

// --- REAL-TCP smoke (acceptance: service chạy standalone :50052, smoke gRPC
// call thành công). Skip trừ khi SMOKE_ADDR được set — chạy:
//
//	SMOKE_ADDR=localhost:50052 go test -run TestSmokeRealServer ./internal/server
func TestSmokeRealServer(t *testing.T) {
	addr := os.Getenv("SMOKE_ADDR")
	if addr == "" {
		t.Skip("SMOKE_ADDR not set")
	}
	conn, err := grpc.DialContext(context.Background(), addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(), grpc.WithTimeout(5*time.Second))
	if err != nil {
		t.Fatalf("dial %s: %v", addr, err)
	}
	defer conn.Close()
	c := batchingv1.NewBatchingServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// criteria + filter seed + detail.
	cr, err := c.GetBatchCriteria(ctx, &batchingv1.GetBatchCriteriaRequest{})
	if err != nil || len(cr.GetCancellableStatuses()) != 1 {
		t.Fatalf("criteria: %v", err)
	}
	fl, err := c.FilterBatches(ctx, &batchingv1.FilterBatchesRequest{})
	if err != nil || fl.GetTotal() != 7 {
		t.Fatalf("filter: total=%v err=%v", fl.GetTotal(), err)
	}
	dt, err := c.GetBatchDetail(ctx, &batchingv1.GetBatchDetailRequest{BatchCode: "BATCH-0001"})
	if err != nil || len(dt.GetBatch().GetItems()) != 3 {
		t.Fatalf("detail: %v", err)
	}
	// create thật qua TCP: hydration + mutate sang mock Java :50051.
	cresp, err := c.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		ShipperId:    "STAFF-001",
		DeliveryTime: &fulfillmentv1.TimeRange{From: "2026-09-03T08:00:00+07:00", To: "2026-09-03T12:00:00+07:00"},
		FulfillCodes: []string{"ORD-3001", "ORD-3002"},
	})
	if err != nil || cresp.GetBatch().GetBatchCode() != "BATCH-0008" {
		t.Fatalf("smoke create: batch=%s err=%v", cresp.GetBatch().GetBatchCode(), err)
	}
	t.Logf("SMOKE OK: criteria + filter(7) + detail + create %s (stopOrder=%d)",
		cresp.GetBatch().GetBatchCode(), cresp.GetBatch().GetItems()[1].GetStopOrder())
}
