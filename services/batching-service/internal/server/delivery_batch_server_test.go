package server

// Integration tests DeliveryBatchService (SF-15 T4) — per-package testdb
// pattern (SF-3): test DB riêng cho package server, migrations V2 áp dụng sẵn
// (testdb.Pool), skip khi không có Postgres. Mock adapter (deterministic —
// bảng giá mockFleet: fee = baseFee + feePerKm×km).

import (
	"context"
	"testing"

	"hubstore/batching-service/internal/ahamove"
	"hubstore/batching-service/internal/testdb"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Fixture: mock adapter + pool test DB. V2 tables truncate giữa các test
// (testdb.Pool chỉ truncate batches/batch_items V1).
func nvcFixture(t *testing.T) (*DeliveryBatchServer, *pgxpool.Pool) {
	t.Helper()
	pool := testdb.Pool(t)
	if _, err := pool.Exec(context.Background(),
		`TRUNCATE shipment_plannings, bookings, shipment_tracking_events`); err != nil {
		t.Fatalf("truncate V2 tables: %v", err)
	}
	return NewDeliveryBatch(pool, ahamove.NewMock(false)), pool
}

// insertBatch — batch + 1 stop vào V1 tables (fee_limits seed sẵn shops
// 30201..30205 limit 150000 qua migration V2).
func insertBatch(t *testing.T, ctx context.Context, pool *pgxpool.Pool, batchCode, shopCode, orderCode string, stopOrder int32, distanceKm float64, codAmount int64) {
	t.Helper()
	if _, err := pool.Exec(ctx, `INSERT INTO batches
		(batch_code, shop_code, shipper_id, status, created_at)
		VALUES ($1, $2, 'shipper-test', 1, now())`, batchCode, shopCode); err != nil {
		t.Fatalf("seed batch: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO batch_items
		(batch_code, stop_order, order_code, customer_address, distance,
		 order_status, order_type, items, total_quantity, cod_amount)
		VALUES ($1, $2, $3, '123 Lê Lợi, Q1', $4, 0, 1, '[]'::jsonb, 0, $5)`,
		batchCode, stopOrder, orderCode, distanceKm, codAmount); err != nil {
		t.Fatalf("seed batch_items: %v", err)
	}
}

func confirmReq(batchCode, orderCode, vehicle, serviceID string, stop int32) *batchingv1.ConfirmPlanningRequest {
	return &batchingv1.ConfirmPlanningRequest{
		BatchCode: batchCode,
		Plannings: []*batchingv1.PlanningInput{{
			StopOrder:   stop,
			OrderCode:   orderCode,
			VehicleType: vehicle,
			ServiceId:   serviceID,
			Addons:      []string{"DOCUMENT"},
		}},
	}
}

// Bảng giá mock: SGCN 10000+3000/km, 2T 60000+8000/km, 8T 120000+13000/km.

func TestGetQuotes_SixVehiclesAndFeeLimitFlags(t *testing.T) {
	srv, _ := nvcFixture(t)
	ctx := context.Background()

	resp, err := srv.GetQuotes(ctx, &batchingv1.GetQuotesRequest{
		ShopCode: "30201", // seed fee_limit = 150000
		StopOrders: []*batchingv1.StopOrderQuote{
			{Address: "A", DistanceKm: 10, CodAmount: 500000},
			{Address: "B", DistanceKm: 20, CodAmount: 0},
		},
	})
	if err != nil {
		t.Fatalf("GetQuotes: %v", err)
	}
	if !resp.GetMeta().GetMock() {
		t.Fatalf("meta.mock = false, want true (mock adapter)")
	}
	// 2 stops × 6 tải trọng.
	if got := len(resp.GetQuotes()); got != 12 {
		t.Fatalf("quotes = %d, want 12", got)
	}
	// Cùng distance → 6 mức phí khác nhau (acceptance mock §3.1).
	fees := map[int64]bool{}
	dist10 := 0
	for _, q := range resp.GetQuotes() {
		if q.GetFee() <= 0 {
			t.Fatalf("fee = %d, want > 0 (%s)", q.GetFee(), q.GetServiceId())
		}
		if q.GetServiceId() == "SGCN" {
			dist10++
		}
		fees[q.GetFee()] = true
	}
	if dist10 != 2 {
		t.Fatalf("SGCN count = %d, want 2 (1/stop)", dist10)
	}
	if len(fees) < 6 {
		t.Fatalf("distinct fees = %d, want ≥ 6 (6 tải trọng phí khác nhau)", len(fees))
	}
	// Fee server-truth: SGCN @10km = 10000 + 3000×10 = 40000 ≤ 150000 → không vượt.
	if q := findQuote(resp, "SGCN"); q.GetFee() != 40000 || q.GetIsExceedFeeLimit() {
		t.Fatalf("SGCN fee=%d exceed=%v, want 40000/false", q.GetFee(), q.GetIsExceedFeeLimit())
	}
	// 8T @10km (stop đầu) = 120000 + 13000×10 = 250000 > 150000 → vượt.
	if q := findQuote(resp, "8T"); q.GetFee() != 250000 || !q.GetIsExceedFeeLimit() {
		t.Fatalf("8T fee=%d exceed=%v, want 250000/true", q.GetFee(), q.GetIsExceedFeeLimit())
	}
}

func TestGetQuotes_FeeLimitMissingShopMeansNoLimit(t *testing.T) {
	srv, _ := nvcFixture(t)

	resp, err := srv.GetQuotes(context.Background(), &batchingv1.GetQuotesRequest{
		ShopCode: "99999", // không có row fee_limits → không giới hạn
		StopOrders: []*batchingv1.StopOrderQuote{
			{Address: "A", DistanceKm: 100, CodAmount: 0}, // mọi fee > 150000
		},
	})
	if err != nil {
		t.Fatalf("GetQuotes: %v", err)
	}
	for _, q := range resp.GetQuotes() {
		if q.GetIsExceedFeeLimit() {
			t.Fatalf("%s exceed=true, want false (shop không có limit)", q.GetServiceId())
		}
	}
}

func TestGetQuotes_FeeExactlyLimitIsNotExceeded(t *testing.T) {
	srv, _ := nvcFixture(t)
	// 2T @11.25km = 60000 + 8000×11.25 = 150000 = limit → strict > ⇒ false.
	resp, err := srv.GetQuotes(context.Background(), &batchingv1.GetQuotesRequest{
		ShopCode:   "30201",
		StopOrders: []*batchingv1.StopOrderQuote{{Address: "A", DistanceKm: 11.25}},
	})
	if err != nil {
		t.Fatalf("GetQuotes: %v", err)
	}
	if q := findQuote(resp, "2T"); q.GetFee() != 150000 || q.GetIsExceedFeeLimit() {
		t.Fatalf("2T fee=%d exceed=%v, want 150000/false (strict >)", q.GetFee(), q.GetIsExceedFeeLimit())
	}
}

func TestGetQuotes_RequiresStopOrders(t *testing.T) {
	srv, _ := nvcFixture(t)
	_, err := srv.GetQuotes(context.Background(), &batchingv1.GetQuotesRequest{ShopCode: "30201"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument", status.Code(err))
	}
}

func TestConfirmPlanning_PersistsFeeAndIsIdempotent(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT4-IDEM", "30201", "HD-001", 1, 10, 500000)

	resp, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-IDEM", "HD-001", "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm 1: %v", err)
	}
	p := resp.GetPlannings()[0]
	if p.GetStatus() != "CONFIRMED" || p.GetFee() != 40000 { // 10000+3000×10
		t.Fatalf("status=%s fee=%d, want CONFIRMED/40000", p.GetStatus(), p.GetFee())
	}
	if p.GetCodAmount() != 500000 {
		t.Fatalf("cod=%d, want 500000 (hydrate từ batch_items)", p.GetCodAmount())
	}

	// Confirm lần 2 — idempotent no-op: cùng planning, KHÔNG thêm row.
	resp2, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-IDEM", "HD-001", "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm 2 (idempotent): %v", err)
	}
	p2 := resp2.GetPlannings()[0]
	if p2.GetId() != p.GetId() || p2.GetPlanningId() != p.GetPlanningId() {
		t.Fatalf("idempotent confirm trả planning khác: %d vs %d", p2.GetId(), p.GetId())
	}
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM shipment_plannings WHERE batch_code='BT4-IDEM'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("rows = %d, want 1 (no-op không insert)", n)
	}
	if p2.GetStatus() != "CONFIRMED" || p2.GetFee() != 40000 {
		t.Fatalf("status/fee sau no-op = %s/%d, want CONFIRMED/40000", p2.GetStatus(), p2.GetFee())
	}
}

func TestConfirmPlanning_CancelledRebookPath(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT4-REBOOK", "30201", "HD-002", 1, 10, 0)

	// Confirm → CANCELLED (hủy per-đơn T5) → confirm lại = rebook.
	if _, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-REBOOK", "HD-002", "SGCN", "SGCN", 1)); err != nil {
		t.Fatalf("confirm 1: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE shipment_plannings SET status='CANCELLED' WHERE batch_code='BT4-REBOOK'`); err != nil {
		t.Fatal(err)
	}

	resp, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-REBOOK", "HD-002", "1T", "1T", 1))
	if err != nil {
		t.Fatalf("rebook confirm: %v", err)
	}
	p := resp.GetPlannings()[0]
	// 1T @10km = 40000 + 6000×10 = 100000 — fee re-persist theo service mới.
	if p.GetStatus() != "CONFIRMED" || p.GetFee() != 100000 || p.GetServiceId() != "1T" {
		t.Fatalf("rebook: status=%s fee=%d service=%s, want CONFIRMED/100000/1T",
			p.GetStatus(), p.GetFee(), p.GetServiceId())
	}
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM shipment_plannings WHERE batch_code='BT4-REBOOK'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("rows = %d, want 1 (rebook update row, không insert mới)", n)
	}
}

func TestConfirmPlanning_FeeOverLimitBlocked(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT4-LIMIT", "30201", "HD-003", 1, 10, 0)

	// 8T @10km = 120000 + 13000×10 = 250000 > limit 150000 → FailedPrecondition.
	_, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-LIMIT", "HD-003", "8T", "8T", 1))
	if status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("code = %v, want FailedPrecondition", status.Code(err))
	}
	// Không persist row bị chặn.
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM shipment_plannings WHERE batch_code='BT4-LIMIT'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("rows = %d, want 0 (blocked confirm không persist)", n)
	}
}

func TestConfirmPlanning_UnknownServiceIDInvalidArgument(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT4-SVC", "30201", "HD-004", 1, 10, 0)

	_, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-SVC", "HD-004", "SGCN", "NOPE-9X", 1))
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument", status.Code(err))
	}
}

func TestConfirmPlanning_OrderCodeMismatchInvalidArgument(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT4-MISMATCH", "30201", "HD-005", 1, 10, 0)

	// order_code request lệch batch_items → InvalidArgument (rule hydration).
	_, err := srv.ConfirmPlanning(ctx, confirmReq("BT4-MISMATCH", "HD-WRONG", "SGCN", "SGCN", 1))
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument", status.Code(err))
	}
	// Stop không tồn tại trong batch → InvalidArgument.
	_, err = srv.ConfirmPlanning(ctx, confirmReq("BT4-MISMATCH", "HD-005", "SGCN", "SGCN", 99))
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument (stop missing)", status.Code(err))
	}
}

func TestListAddonServices_FilterByVehicle(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	// Extra addon chỉ cho 8T (seed migration toàn '[]' = mọi xe). DB test
	// persist giữa các run → ON CONFLICT cho idempotent.
	if _, err := pool.Exec(ctx, `INSERT INTO addon_services (code, name, grp, fee, vehicle_types, sort)
		VALUES ('T4_HEAVY_ONLY', 'Chỉ xe nặng', 'LOADING', 5000, '["8T"]'::jsonb, 99)
		ON CONFLICT (code) DO NOTHING`); err != nil {
		t.Fatal(err)
	}

	all, err := srv.ListAddonServices(ctx, &batchingv1.ListAddonServicesRequest{})
	if err != nil {
		t.Fatalf("ListAddonServices: %v", err)
	}
	if got := len(all.GetAddons()); got != 5 { // 4 seed + 1 extra
		t.Fatalf("all addons = %d, want 5", got)
	}

	heavy, err := srv.ListAddonServices(ctx, &batchingv1.ListAddonServicesRequest{VehicleType: "8T"})
	if err != nil {
		t.Fatalf("ListAddonServices(8T): %v", err)
	}
	if got := len(heavy.GetAddons()); got != 5 {
		t.Fatalf("8T addons = %d, want 5", got)
	}

	light, err := srv.ListAddonServices(ctx, &batchingv1.ListAddonServicesRequest{VehicleType: "SGCN"})
	if err != nil {
		t.Fatalf("ListAddonServices(SGCN): %v", err)
	}
	if got := len(light.GetAddons()); got != 4 {
		t.Fatalf("SGCN addons = %d, want 4 (loại T4_HEAVY_ONLY)", got)
	}
	for _, a := range light.GetAddons() {
		if a.GetCode() == "T4_HEAVY_ONLY" {
			t.Fatal("SGCN filter vẫn trả addon chỉ-cho-8T")
		}
	}
	if !all.GetMeta().GetMock() {
		t.Fatal("meta.mock = false, want true")
	}
}

// findQuote — quote đầu tiên khớp serviceId (stop 10km xuất hiện trước).
func findQuote(resp *batchingv1.GetQuotesResponse, serviceID string) *batchingv1.Quote {
	for _, q := range resp.GetQuotes() {
		if q.GetServiceId() == serviceID {
			return q
		}
	}
	return nil
}
