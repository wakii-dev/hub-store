package server

// Integration tests DeliveryBatchService (SF-15 T4) — per-package testdb
// pattern (SF-3): test DB riêng cho package server, migrations V2 áp dụng sẵn
// (testdb.Pool), skip khi không có Postgres. Mock adapter (deterministic —
// bảng giá mockFleet: fee = baseFee + feePerKm×km).

import (
	"context"
	"strconv"
	"testing"
	"time"

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

// ---------------------------------------------------------------------------
// T5 — CreateBooking / CancelDeliveryOrder / CancelDeliveryBatch
// ---------------------------------------------------------------------------

// bookReq — CreateBooking request cho 1 planning (cod/bill từ request).
func bookReq(batchCode, planningID string, cod, totalBill int64, stop int32) *batchingv1.CreateBookingRequest {
	return &batchingv1.CreateBookingRequest{
		BatchCode: batchCode,
		ShipmentPlannings: []*batchingv1.ShipmentPlanningBookingInput{{
			PlanningId: planningID,
			CodAmount:  cod,
			TotalBill:  totalBill,
			StopOrder:  stop,
		}},
	}
}

// confirmAndBook — path chuẩn: confirm (SGCN @10km → fee 40000 ≤ limit) + book.
func confirmAndBook(t *testing.T, srv *DeliveryBatchServer, ctx context.Context, batch, order string) string {
	t.Helper()
	conf, err := srv.ConfirmPlanning(ctx, confirmReq(batch, order, "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	pid := conf.GetPlannings()[0].GetPlanningId()
	if _, err := srv.CreateBooking(ctx, bookReq(batch, pid, 500000, 1200000, 1)); err != nil {
		t.Fatalf("book: %v", err)
	}
	return pid
}

func TestCreateBooking_PersistsBookingTimelineAndBooked(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT5-BOOK", "30201", "HD-101", 1, 10, 500000)
	conf, err := srv.ConfirmPlanning(ctx, confirmReq("BT5-BOOK", "HD-101", "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	p := conf.GetPlannings()[0]

	resp, err := srv.CreateBooking(ctx, bookReq("BT5-BOOK", p.GetPlanningId(), 500000, 1200000, 1))
	if err != nil {
		t.Fatalf("CreateBooking: %v", err)
	}
	if !resp.GetMeta().GetMock() {
		t.Fatal("meta.mock = false, want true")
	}
	if got := len(resp.GetBookings()); got != 1 {
		t.Fatalf("bookings = %d, want 1", got)
	}
	br := resp.GetBookings()[0]
	if br.GetPlanningId() != p.GetPlanningId() {
		t.Fatalf("planning_id = %s, want %s", br.GetPlanningId(), p.GetPlanningId())
	}
	if len(br.GetCarrierBookingId()) < 5 || br.GetCarrierBookingId()[:5] != "MOCK-" {
		t.Fatalf("carrier_booking_id = %s, want MOCK-* prefix", br.GetCarrierBookingId())
	}
	if br.GetDriverName() == "" || br.GetDriverPhone() == "" || br.GetLicensePlate() == "" {
		t.Fatalf("driver snapshot thiếu: %+v", br)
	}
	if br.GetStatus() != "DRIVER_FOUND" {
		t.Fatalf("status = %s, want DRIVER_FOUND (mock gán driver ngay)", br.GetStatus())
	}

	// bookings row — driver snapshot + planning_id FK + is_mock.
	var (
		bStatus, bDriver, bPlate string
		bPlanning                int64
		bMock                    bool
		cancelledAt              *time.Time
	)
	if err := pool.QueryRow(ctx, `SELECT planning_id, status, driver_name,
		license_plate, is_mock, cancelled_at FROM bookings
		WHERE carrier_booking_id = $1`, br.GetCarrierBookingId()).
		Scan(&bPlanning, &bStatus, &bDriver, &bPlate, &bMock, &cancelledAt); err != nil {
		t.Fatalf("load booking: %v", err)
	}
	if bPlanning != p.GetId() || bStatus != "DRIVER_FOUND" || !bMock || cancelledAt != nil {
		t.Fatalf("booking row: planning=%d status=%s mock=%v cancelled_at=%v, want %d/DRIVER_FOUND/true/nil",
			bPlanning, bStatus, bMock, cancelledAt, p.GetId())
	}

	// planning → BOOKED + cod/total_bill từ request.
	var status string
	var cod, bill int64
	if err := pool.QueryRow(ctx, `SELECT status, cod_amount, total_bill
		FROM shipment_plannings WHERE id = $1`, p.GetId()).Scan(&status, &cod, &bill); err != nil {
		t.Fatal(err)
	}
	if status != "BOOKED" || cod != 500000 || bill != 1200000 {
		t.Fatalf("planning: status=%s cod=%d bill=%d, want BOOKED/500000/1200000", status, cod, bill)
	}

	// Timeline đầu: 2 events — ORDER_CREATED (BE) + DRIVER_FOUND (PARTNER).
	type evRow struct {
		status, source string
	}
	var evs []evRow
	rows, err := pool.Query(ctx, `SELECT status, source FROM shipment_tracking_events
		WHERE booking_id = (SELECT id FROM bookings WHERE carrier_booking_id = $1)
		ORDER BY id`, br.GetCarrierBookingId())
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var e evRow
		if err := rows.Scan(&e.status, &e.source); err != nil {
			t.Fatal(err)
		}
		evs = append(evs, e)
	}
	if len(evs) != 2 || evs[0].status != "ORDER_CREATED" || evs[0].source != "BE" ||
		evs[1].status != "DRIVER_FOUND" || evs[1].source != "PARTNER" {
		t.Fatalf("events = %+v, want [ORDER_CREATED/BE DRIVER_FOUND/PARTNER]", evs)
	}
}

func TestCreateBooking_WrongStatusFailedPrecondition(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()

	// DRAFT — chưa confirm.
	insertBatch(t, ctx, pool, "BT5-DRAFT", "30201", "HD-102", 1, 10, 0)
	var draftID int64
	if err := pool.QueryRow(ctx, `INSERT INTO shipment_plannings
		(batch_code, stop_order, order_code, vehicle_type, carrier_service_id, status)
		VALUES ('BT5-DRAFT', 1, 'HD-102', 'SGCN', 'SGCN', 'DRAFT') RETURNING id`).Scan(&draftID); err != nil {
		t.Fatal(err)
	}
	_, err := srv.CreateBooking(ctx, bookReq("BT5-DRAFT", strconv.FormatInt(draftID, 10), 0, 0, 1))
	if status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("DRAFT: code = %v, want FailedPrecondition", status.Code(err))
	}

	// BOOKED — book lần 2 trên cùng planning.
	insertBatch(t, ctx, pool, "BT5-TWICE", "30201", "HD-103", 1, 10, 0)
	pid := confirmAndBook(t, srv, ctx, "BT5-TWICE", "HD-103")
	_, err = srv.CreateBooking(ctx, bookReq("BT5-TWICE", pid, 0, 0, 1))
	if status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("BOOKED: code = %v, want FailedPrecondition", status.Code(err))
	}
}

func TestCreateBooking_FeeLimitRecheckBlocked(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT5-LIMIT", "30201", "HD-104", 1, 10, 0)
	conf, err := srv.ConfirmPlanning(ctx, confirmReq("BT5-LIMIT", "HD-104", "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	pid := conf.GetPlannings()[0].GetPlanningId()

	// Fee trôi sau confirm (persisted fee = server truth) vượt limit 150000.
	if _, err := pool.Exec(ctx,
		`UPDATE shipment_plannings SET fee = 250000 WHERE id = $1`, conf.GetPlannings()[0].GetId()); err != nil {
		t.Fatal(err)
	}

	_, err = srv.CreateBooking(ctx, bookReq("BT5-LIMIT", pid, 0, 0, 1))
	if status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("code = %v, want FailedPrecondition (fee-limit re-check)", status.Code(err))
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM bookings`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("bookings = %d, want 0 (blocked booking không persist)", n)
	}
	var st string
	if err := pool.QueryRow(ctx, `SELECT status FROM shipment_plannings WHERE id = $1`,
		conf.GetPlannings()[0].GetId()).Scan(&st); err != nil {
		t.Fatal(err)
	}
	if st != "CONFIRMED" {
		t.Fatalf("planning status = %s, want CONFIRMED (không đổi khi bị chặn)", st)
	}
}

func TestCancelDeliveryOrder_CancelsBookingPlanningAndTimeline(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT5-CANCEL", "30201", "HD-105", 1, 10, 0)
	pid := confirmAndBook(t, srv, ctx, "BT5-CANCEL", "HD-105")

	resp, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: pid, Reason: "khách hủy đơn",
	})
	if err != nil {
		t.Fatalf("CancelDeliveryOrder: %v", err)
	}
	if resp.GetStatus() != "CANCELLED" || !resp.GetMeta().GetMock() {
		t.Fatalf("status=%s mock=%v, want CANCELLED/true", resp.GetStatus(), resp.GetMeta().GetMock())
	}

	// Booking → CANCELLED + cancelled_at/reason.
	var (
		bStatus, bReason string
		cancelledAt      *time.Time
	)
	if err := pool.QueryRow(ctx, `SELECT status, cancelled_at, cancel_reason
		FROM bookings WHERE planning_id = (SELECT id FROM shipment_plannings WHERE batch_code = 'BT5-CANCEL')`).
		Scan(&bStatus, &cancelledAt, &bReason); err != nil {
		t.Fatal(err)
	}
	if bStatus != "CANCELLED" || cancelledAt == nil || bReason != "khách hủy đơn" {
		t.Fatalf("booking: status=%s cancelled_at=%v reason=%s", bStatus, cancelledAt, bReason)
	}
	// Planning → CANCELLED.
	var pStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM shipment_plannings
		WHERE batch_code = 'BT5-CANCEL'`).Scan(&pStatus); err != nil {
		t.Fatal(err)
	}
	if pStatus != "CANCELLED" {
		t.Fatalf("planning status = %s, want CANCELLED", pStatus)
	}
	// Timeline: 2 events đầu + CANCELLED (BE) = 3.
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shipment_tracking_events
		WHERE status = 'CANCELLED' AND source = 'BE'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("CANCELLED events = %d, want 1", n)
	}

	// Hủy lần 2 — no-op trả hiện trạng, không thêm event/row.
	resp2, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: pid, Reason: "lần 2",
	})
	if err != nil {
		t.Fatalf("cancel lần 2: %v", err)
	}
	if resp2.GetStatus() != "CANCELLED" {
		t.Fatalf("lần 2 status = %s, want CANCELLED (no-op)", resp2.GetStatus())
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shipment_tracking_events`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("events = %d, want 3 (no-op không thêm)", n)
	}
	var nb int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM bookings`).Scan(&nb); err != nil {
		t.Fatal(err)
	}
	if nb != 1 {
		t.Fatalf("bookings = %d, want 1", nb)
	}
}

func TestCancelDeliveryOrder_RebookTwoStepsCreatesNewBookingRow(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT5-REBOOK", "30201", "HD-106", 1, 10, 0)
	pid := confirmAndBook(t, srv, ctx, "BT5-REBOOK", "HD-106")

	if _, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: pid, Reason: "đổi xe",
	}); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	// Rebook 2 BƯỚC: confirm lại (CANCELLED → CONFIRMED, fee re-persist) rồi book.
	if _, err := srv.ConfirmPlanning(ctx, confirmReq("BT5-REBOOK", "HD-106", "SGCN", "SGCN", 1)); err != nil {
		t.Fatalf("rebook confirm: %v", err)
	}
	resp, err := srv.CreateBooking(ctx, bookReq("BT5-REBOOK", pid, 100000, 200000, 1))
	if err != nil {
		t.Fatalf("rebook booking: %v", err)
	}

	// 2 bookings rows cho planning; current = id DESC chưa CANCELLED.
	rows, err := pool.Query(ctx, `SELECT carrier_booking_id, status FROM bookings
		WHERE planning_id = (SELECT id FROM shipment_plannings WHERE batch_code = 'BT5-REBOOK')
		ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	type bRow struct {
		id     string
		status string
	}
	var bs []bRow
	for rows.Next() {
		var b bRow
		if err := rows.Scan(&b.id, &b.status); err != nil {
			t.Fatal(err)
		}
		bs = append(bs, b)
	}
	rows.Close()
	if len(bs) != 2 {
		t.Fatalf("bookings = %d, want 2 (rebook = row mới)", len(bs))
	}
	if bs[0].status != "CANCELLED" {
		t.Fatalf("booking cũ status = %s, want CANCELLED", bs[0].status)
	}
	if bs[1].status != "DRIVER_FOUND" || bs[1].id != resp.GetBookings()[0].GetCarrierBookingId() {
		t.Fatalf("booking mới (%s/%s) không khớp response (%s/DRIVER_FOUND)",
			bs[1].id, bs[1].status, resp.GetBookings()[0].GetCarrierBookingId())
	}
	// Current booking = row mới nhất (id DESC).
	var currentID string
	if err := pool.QueryRow(ctx, `SELECT carrier_booking_id FROM bookings
		WHERE planning_id = (SELECT id FROM shipment_plannings WHERE batch_code = 'BT5-REBOOK')
		AND status <> 'CANCELLED' ORDER BY id DESC LIMIT 1`).Scan(&currentID); err != nil {
		t.Fatal(err)
	}
	if currentID != bs[1].id {
		t.Fatalf("current = %s, want %s (id DESC)", currentID, bs[1].id)
	}
	var pStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM shipment_plannings
		WHERE batch_code = 'BT5-REBOOK'`).Scan(&pStatus); err != nil {
		t.Fatal(err)
	}
	if pStatus != "BOOKED" {
		t.Fatalf("planning status = %s, want BOOKED", pStatus)
	}
}

func TestCancelDeliveryOrder_UnbookedPlanningCancelled(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT5-UNBOOK", "30201", "HD-109", 1, 10, 0)
	conf, err := srv.ConfirmPlanning(ctx, confirmReq("BT5-UNBOOK", "HD-109", "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	pid := conf.GetPlannings()[0].GetPlanningId()

	// Hủy planning CHƯA từng book (§3.6): CANCELLED, không crash, không đụng
	// bookings/timeline (không có row nào để đụng).
	resp, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: pid, Reason: "chưa book",
	})
	if err != nil {
		t.Fatalf("CancelDeliveryOrder (unbooked): %v", err)
	}
	if resp.GetStatus() != "CANCELLED" || !resp.GetMeta().GetMock() {
		t.Fatalf("status=%s mock=%v, want CANCELLED/true", resp.GetStatus(), resp.GetMeta().GetMock())
	}
	var pStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM shipment_plannings
		WHERE batch_code = 'BT5-UNBOOK'`).Scan(&pStatus); err != nil {
		t.Fatal(err)
	}
	if pStatus != "CANCELLED" {
		t.Fatalf("planning status = %s, want CANCELLED", pStatus)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM bookings`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("bookings = %d, want 0 (chưa book)", n)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shipment_tracking_events`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("events = %d, want 0 (chưa book → không timeline)", n)
	}
}

func TestCancelDeliveryOrder_NotFoundAndInvalidPlanningID(t *testing.T) {
	srv, _ := nvcFixture(t)
	ctx := context.Background()

	// planning không tồn tại → NotFound.
	_, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: "99999999",
	})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("code = %v, want NotFound (unknown planning)", status.Code(err))
	}
	// planning_id không parse được → InvalidArgument.
	_, err = srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: "abc",
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument (parse fail)", status.Code(err))
	}
}

// TestCancelDeliveryOrder_CurrentBookingNewestID — P1 review fix: hai booking
// đều <> CANCELLED (A COMPLETED qua timeline advance + B active sau rebook 2
// bước) → CancelDeliveryOrder phải hủy booking MỚI NHẤT (ORDER BY id DESC
// LIMIT 1), không phải row tùy ý của Postgres.
func TestCancelDeliveryOrder_CurrentBookingNewestID(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT5-NEWEST", "30201", "HD-110", 1, 10, 0)
	pid := confirmAndBook(t, srv, ctx, "BT5-NEWEST", "HD-110")

	// Booking A COMPLETED (timeline sync — planning vẫn BOOKED).
	first := bookingCarrierOfBatch(t, ctx, pool, "BT5-NEWEST")
	if _, err := pool.Exec(ctx,
		`UPDATE bookings SET status = 'COMPLETED' WHERE carrier_booking_id = $1`, first); err != nil {
		t.Fatal(err)
	}
	// Trở lại CONFIRMED (rebook path — như sau CancelDeliveryBatch) rồi book B.
	if _, err := pool.Exec(ctx,
		`UPDATE shipment_plannings SET status = 'CONFIRMED' WHERE batch_code = 'BT5-NEWEST'`); err != nil {
		t.Fatal(err)
	}
	resp, err := srv.CreateBooking(ctx, bookReq("BT5-NEWEST", pid, 0, 0, 1))
	if err != nil {
		t.Fatalf("rebook booking: %v", err)
	}
	newest := resp.GetBookings()[0].GetCarrierBookingId()

	// Cancel: A (COMPLETED) + B (active) đều khớp `status <> 'CANCELLED'` →
	// phải chọn B (id DESC) — B bị hủy, A giữ COMPLETED nguyên vẹn.
	if _, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: pid, Reason: "hủy booking mới nhất",
	}); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	var aStatus, bStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM bookings WHERE carrier_booking_id = $1`, first).
		Scan(&aStatus); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT status FROM bookings WHERE carrier_booking_id = $1`, newest).
		Scan(&bStatus); err != nil {
		t.Fatal(err)
	}
	if aStatus != "COMPLETED" {
		t.Fatalf("booking A (cũ) status = %s, want COMPLETED (không đụng)", aStatus)
	}
	if bStatus != "CANCELLED" {
		t.Fatalf("booking B (mới nhất) status = %s, want CANCELLED (id DESC)", bStatus)
	}
}

// bookingCarrierOfBatch — carrier_booking_id duy nhất của batch 1-stop.
func bookingCarrierOfBatch(t *testing.T, ctx context.Context, pool *pgxpool.Pool, batch string) string {
	t.Helper()
	var carrierID string
	if err := pool.QueryRow(ctx, `SELECT b.carrier_booking_id FROM bookings b
		JOIN shipment_plannings p ON p.id = b.planning_id
		WHERE p.batch_code = $1`, batch).Scan(&carrierID); err != nil {
		t.Fatalf("load booking của batch %s: %v", batch, err)
	}
	return carrierID
}

func TestCancelDeliveryBatch_ResultsAndIdempotent(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	// 2 stops: stop 1 book, stop 2 chỉ confirm.
	insertBatch(t, ctx, pool, "BT5-BATCH", "30201", "HD-107", 1, 10, 0)
	if _, err := pool.Exec(ctx, `INSERT INTO batch_items
		(batch_code, stop_order, order_code, customer_address, distance,
		 order_status, order_type, items, total_quantity, cod_amount)
		VALUES ('BT5-BATCH', 2, 'HD-108', '45 Nguyễn Trãi, Q1', 15, 0, 1, '[]'::jsonb, 0, 0)`); err != nil {
		t.Fatalf("seed stop 2: %v", err)
	}
	conf, err := srv.ConfirmPlanning(ctx, &batchingv1.ConfirmPlanningRequest{
		BatchCode: "BT5-BATCH",
		Plannings: []*batchingv1.PlanningInput{
			{StopOrder: 1, OrderCode: "HD-107", VehicleType: "SGCN", ServiceId: "SGCN"},
			{StopOrder: 2, OrderCode: "HD-108", VehicleType: "SGCN", ServiceId: "SGCN"},
		},
	})
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	byStop := map[int32]string{}
	for _, p := range conf.GetPlannings() {
		byStop[p.GetStopOrder()] = p.GetPlanningId()
	}
	if _, err := srv.CreateBooking(ctx, bookReq("BT5-BATCH", byStop[1], 0, 0, 1)); err != nil {
		t.Fatalf("book stop 1: %v", err)
	}

	resp, err := srv.CancelDeliveryBatch(ctx, &batchingv1.CancelDeliveryBatchRequest{
		BatchCode: "BT5-BATCH", Reason: "hủy cả batch",
	})
	if err != nil {
		t.Fatalf("CancelDeliveryBatch: %v", err)
	}
	if got := len(resp.GetResults()); got != 2 {
		t.Fatalf("results = %d, want 2", got)
	}
	statusByPlanning := map[string]string{}
	for _, r := range resp.GetResults() {
		statusByPlanning[r.GetPlanningId()] = r.GetStatus()
	}
	if statusByPlanning[byStop[1]] != "CANCELLED" || statusByPlanning[byStop[2]] != "DRAFT" {
		t.Fatalf("statuses = %v, want stop1 CANCELLED + stop2 DRAFT", statusByPlanning)
	}
	if resp.GetCancelledCount() != 1 {
		t.Fatalf("cancelled_count = %d, want 1 (1 booking bị hủy)", resp.GetCancelledCount())
	}
	// DB: booking stop 1 CANCELLED.
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM bookings WHERE status = 'CANCELLED'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("cancelled bookings = %d, want 1", n)
	}

	// Chạy lần 2 — idempotent no-op: cùng statuses, cancelled_count 0.
	resp2, err := srv.CancelDeliveryBatch(ctx, &batchingv1.CancelDeliveryBatchRequest{
		BatchCode: "BT5-BATCH", Reason: "lần 2",
	})
	if err != nil {
		t.Fatalf("cancel lần 2: %v", err)
	}
	for _, r := range resp2.GetResults() {
		if statusByPlanning[r.GetPlanningId()] != r.GetStatus() {
			t.Fatalf("lần 2 planning %s: %s, want %s (no-op)",
				r.GetPlanningId(), r.GetStatus(), statusByPlanning[r.GetPlanningId()])
		}
	}
	if resp2.GetCancelledCount() != 0 {
		t.Fatalf("lần 2 cancelled_count = %d, want 0 (idempotent)", resp2.GetCancelledCount())
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shipment_tracking_events
		WHERE status = 'CANCELLED'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("CANCELLED events = %d, want 1 (lần 2 không thêm)", n)
	}
}

// ---------------------------------------------------------------------------
// T6 — SearchBookingDetail: timeline advance idempotent (spec §3.4/§3.6)
// ---------------------------------------------------------------------------

// setClock — đồng bộ clock server + mock adapter (Detail stateless tính mốc
// theo MockClient.Now — phải cùng thời gian với server.now khi assert advance).
func setClock(t *testing.T, srv *DeliveryBatchServer, at time.Time) {
	t.Helper()
	srv.SetClock(func() time.Time { return at })
	mock, ok := srv.nvc.(*ahamove.MockClient)
	if !ok {
		t.Fatalf("adapter %T không phải *ahamove.MockClient", srv.nvc)
	}
	mock.Now = func() time.Time { return at }
}

// timelineStatuses — status các event của 1 booking theo thứ tự DB.
func timelineStatuses(t *testing.T, ctx context.Context, pool *pgxpool.Pool, carrierID string) []string {
	t.Helper()
	rows, err := pool.Query(ctx, `SELECT status FROM shipment_tracking_events
		WHERE booking_id = (SELECT id FROM bookings WHERE carrier_booking_id = $1)
		ORDER BY occurred_at, id`, carrierID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func TestSearchBookingDetail_NotBookedAndInvalidPlanningIDs(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT6-NOBOOK", "30201", "HD-201", 1, 10, 0)
	conf, err := srv.ConfirmPlanning(ctx, confirmReq("BT6-NOBOOK", "HD-201", "SGCN", "SGCN", 1))
	if err != nil {
		t.Fatalf("confirm: %v", err)
	}
	pid := conf.GetPlannings()[0].GetPlanningId()

	resp, err := srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{pid}})
	if err != nil {
		t.Fatalf("SearchBookingDetail: %v", err)
	}
	if !resp.GetMeta().GetMock() {
		t.Fatal("meta.mock = false, want true")
	}
	if got := len(resp.GetBookings()); got != 1 {
		t.Fatalf("bookings = %d, want 1", got)
	}
	e := resp.GetBookings()[0]
	if e.GetPlanningId() != pid || e.GetBooking() != nil || len(e.GetTimeline()) != 0 {
		t.Fatalf("entry = %s booking=%v timeline=%d, want %s/nil/0 (chưa book)",
			e.GetPlanningId(), e.GetBooking(), len(e.GetTimeline()), pid)
	}

	// planning_id không parse được → InvalidArgument.
	_, err = srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{"abc"}})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument (parse fail)", status.Code(err))
	}
	// planning không tồn tại → InvalidArgument (§3.6).
	_, err = srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{"99999999"}})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument (not found)", status.Code(err))
	}
	// rỗng → InvalidArgument.
	_, err = srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("code = %v, want InvalidArgument (empty)", status.Code(err))
	}
}

func TestSearchBookingDetail_RightAfterBookTimelineAndNoDowngrade(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT6-FRESH", "30201", "HD-202", 1, 10, 500000)

	base := time.Now()
	pid := confirmAndBook(t, srv, ctx, "BT6-FRESH", "HD-202")

	// Search ngay (clock = base+10s < bookedAt+1m): timeline có 2 event đầu từ
	// CreateBooking; adapter Detail trả ORDER_CREATED (mốc DRIVER_FOUND +1m
	// chưa đến) — sync forward-only KHÔNG lùi bookings.status về ORDER_CREATED.
	setClock(t, srv, base.Add(10*time.Second))
	resp, err := srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{pid}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	e := resp.GetBookings()[0]
	if e.GetBooking() == nil {
		t.Fatal("booking = nil, want full detail")
	}
	b := e.GetBooking()
	if len(b.GetCarrierBookingId()) < 5 || b.GetCarrierBookingId()[:5] != "MOCK-" {
		t.Fatalf("carrier_booking_id = %s, want MOCK-*", b.GetCarrierBookingId())
	}
	if b.GetDriverName() == "" || b.GetLicensePlate() == "" {
		t.Fatalf("driver snapshot thiếu: %+v", b)
	}
	if _, err := time.Parse(time.RFC3339, b.GetBookedAt()); err != nil {
		t.Fatalf("booked_at %q không parse RFC3339: %v", b.GetBookedAt(), err)
	}
	if b.GetStatus() != "DRIVER_FOUND" {
		t.Fatalf("status = %s, want DRIVER_FOUND (không bị lùi về ORDER_CREATED)", b.GetStatus())
	}
	if got := timelineStatuses(t, ctx, pool, b.GetCarrierBookingId()); len(got) != 2 ||
		got[0] != "ORDER_CREATED" || got[1] != "DRIVER_FOUND" {
		t.Fatalf("timeline = %v, want [ORDER_CREATED DRIVER_FOUND]", got)
	}
	// Timeline proto có source + occurred_at RFC3339.
	ev := e.GetTimeline()[1]
	if ev.GetSource() != "PARTNER" {
		t.Fatalf("DRIVER_FOUND source = %s, want PARTNER", ev.GetSource())
	}
	if _, err := time.Parse(time.RFC3339, ev.GetOccurredAt()); err != nil {
		t.Fatalf("occurred_at %q không parse RFC3339: %v", ev.GetOccurredAt(), err)
	}
}

func TestSearchBookingDetail_AdvancesToDeliveringThenIdempotent(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT6-ADV", "30201", "HD-203", 1, 10, 0)

	base := time.Now()
	pid := confirmAndBook(t, srv, ctx, "BT6-ADV", "HD-203")

	// Lùi thời điểm tra cứu quá mốc DELIVERING (bookedAt + 5m — §3.1 mock):
	// clock = base + 6m ⇒ bookedAt (≈ now) + 5m đã qua → event DELIVERING.
	setClock(t, srv, base.Add(6*time.Minute))
	resp, err := srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{pid}})
	if err != nil {
		t.Fatalf("search advance: %v", err)
	}
	carrierID := resp.GetBookings()[0].GetBooking().GetCarrierBookingId()
	if resp.GetBookings()[0].GetBooking().GetStatus() != "DELIVERING" {
		t.Fatalf("status = %s, want DELIVERING (advance qua mốc +5m)",
			resp.GetBookings()[0].GetBooking().GetStatus())
	}
	// bookings.status sync đúng trong DB.
	var dbStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM bookings WHERE carrier_booking_id = $1`,
		carrierID).Scan(&dbStatus); err != nil {
		t.Fatal(err)
	}
	if dbStatus != "DELIVERING" {
		t.Fatalf("bookings.status = %s, want DELIVERING", dbStatus)
	}
	if got := timelineStatuses(t, ctx, pool, carrierID); len(got) != 3 ||
		got[2] != "DELIVERING" {
		t.Fatalf("timeline = %v, want [ORDER_CREATED DRIVER_FOUND DELIVERING]", got)
	}

	// Search lần 2 — idempotent: KHÔNG thêm event, status giữ nguyên.
	resp2, err := srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{pid}})
	if err != nil {
		t.Fatalf("search lần 2: %v", err)
	}
	if got := timelineStatuses(t, ctx, pool, carrierID); len(got) != 3 {
		t.Fatalf("timeline lần 2 = %d events, want 3 (idempotent)", len(got))
	}
	if resp2.GetBookings()[0].GetBooking().GetStatus() != "DELIVERING" {
		t.Fatalf("lần 2 status = %s, want DELIVERING",
			resp2.GetBookings()[0].GetBooking().GetStatus())
	}
}

func TestSearchBookingDetail_FailedBranchViaAddressMarker(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT6-FAIL", "30201", "HD-204", 1, 10, 0)
	// Contract có chủ đích (§3.1): address chứa substring "FAILED" → nhánh
	// FAILED của mock Detail.
	if _, err := pool.Exec(ctx, `UPDATE batch_items SET customer_address = 'Kho FAILED 12, Q1'
		WHERE batch_code = 'BT6-FAIL'`); err != nil {
		t.Fatal(err)
	}

	base := time.Now()
	pid := confirmAndBook(t, srv, ctx, "BT6-FAIL", "HD-204")

	// Clock quá mốc FAILED (+35m — mock thay COMPLETED bằng FAILED).
	setClock(t, srv, base.Add(36*time.Minute))
	resp, err := srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{pid}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	b := resp.GetBookings()[0].GetBooking()
	if b.GetStatus() != "FAILED" {
		t.Fatalf("status = %s, want FAILED (address marker)", b.GetStatus())
	}
	if got := timelineStatuses(t, ctx, pool, b.GetCarrierBookingId()); len(got) != 4 ||
		got[3] != "FAILED" {
		t.Fatalf("timeline = %v, want [... FAILED]", got)
	}
	var dbStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM bookings WHERE carrier_booking_id = $1`,
		b.GetCarrierBookingId()).Scan(&dbStatus); err != nil {
		t.Fatal(err)
	}
	if dbStatus != "FAILED" {
		t.Fatalf("bookings.status = %s, want FAILED", dbStatus)
	}
}

func TestSearchBookingDetail_CancelledBookingNoPartnerEvents(t *testing.T) {
	srv, pool := nvcFixture(t)
	ctx := context.Background()
	insertBatch(t, ctx, pool, "BT6-CXL", "30201", "HD-205", 1, 10, 0)
	pid := confirmAndBook(t, srv, ctx, "BT6-CXL", "HD-205")

	if _, err := srv.CancelDeliveryOrder(ctx, &batchingv1.CancelDeliveryOrderRequest{
		PlanningId: pid, Reason: "guard test",
	}); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	var nBefore int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shipment_tracking_events`).Scan(&nBefore); err != nil {
		t.Fatal(err)
	}

	// Search sau hủy: booking CANCELLED bị loại khỏi current booking (§3.4
	// guard) → entry booking=null, timeline=[] — KHÔNG event nào từ adapter.
	setClock(t, srv, time.Now().Add(2*time.Hour))
	resp, err := srv.SearchBookingDetail(ctx, &batchingv1.SearchBookingDetailRequest{PlanningIds: []string{pid}})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	e := resp.GetBookings()[0]
	if e.GetBooking() != nil || len(e.GetTimeline()) != 0 {
		t.Fatalf("entry booking=%v timeline=%d, want nil/0 (guard CANCELLED)",
			e.GetBooking(), len(e.GetTimeline()))
	}
	var nAfter int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shipment_tracking_events`).Scan(&nAfter); err != nil {
		t.Fatal(err)
	}
	if nAfter != nBefore {
		t.Fatalf("events %d → %d, want không đổi (guard CANCELLED)", nBefore, nAfter)
	}
}
