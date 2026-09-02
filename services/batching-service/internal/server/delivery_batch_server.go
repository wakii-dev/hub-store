// Package server — DeliveryBatchService gRPC impl (SF-15, spec §3.1–§3.5).
//
// Semantics:
//   - Fee là SERVER-SIDE truth (§3.2): ConfirmPlanning gọi adapter.Quotes cho
//     từng stop, chọn quote khớp serviceId, persist fee vào shipment_plannings
//     — fee trên request chỉ là display hint, không tin FE.
//   - Fee-limit BE-authoritative (§3.2): row thiếu trong fee_limits → không
//     giới hạn; strict `>` (đúng limit = OK). Quotes gắn flag
//     is_exceed_fee_limit; ConfirmPlanning chặn FailedPrecondition.
//   - Idempotency (§3.4): planning CONFIRMED/BOOKED → no-op trả trạng thái
//     hiện có; DRAFT/CANCELLED → confirm lại (rebook path — update row).
//   - Hydrate distance từ batch_items (V1 truth) + kiểm order_code khớp —
//     lệch → InvalidArgument.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"hubstore/batching-service/internal/ahamove"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	grpccodes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Trạng thái shipment_plannings (spec §3.4 — canonical strings trong DB).
const (
	planningDraft     = "DRAFT"
	planningConfirmed = "CONFIRMED"
	planningBooked    = "BOOKED"
	planningCancelled = "CANCELLED"
)

// Trạng thái bookings/timeline (canonical strings trong DB + adapter).
const (
	bookingCancelled  = "CANCELLED"
	bookingCompleted  = "COMPLETED"
	bookingFailed     = "FAILED"
	eventOrderCreated = "ORDER_CREATED"
	eventDriverFound  = "DRIVER_FOUND"
	eventDelivering   = "DELIVERING"
	eventCancelled    = "CANCELLED"
	sourceBE          = "BE"
	sourcePartner     = "PARTNER"
)

// DeliveryBatchServer implements hubstore.batching.v1.DeliveryBatchService.
type DeliveryBatchServer struct {
	batchingv1.UnimplementedDeliveryBatchServiceServer
	pool *pgxpool.Pool
	nvc  ahamove.Client
	now  func() time.Time // injectable for tests
}

// NewDeliveryBatch constructs the server over the V2 schema pool + NVC adapter.
func NewDeliveryBatch(pool *pgxpool.Pool, nvc ahamove.Client) *DeliveryBatchServer {
	return &DeliveryBatchServer{pool: pool, nvc: nvc, now: time.Now}
}

// SetClock overrides time source (tests).
func (s *DeliveryBatchServer) SetClock(now func() time.Time) { s.now = now }

// ---------------------------------------------------------------------------
// GetQuotes — bảng giá per stop + fee-limit flag + addon catalog theo xe
// ---------------------------------------------------------------------------

func (s *DeliveryBatchServer) GetQuotes(ctx context.Context, req *batchingv1.GetQuotesRequest) (*batchingv1.GetQuotesResponse, error) {
	if len(req.GetStopOrders()) == 0 {
		return nil, status.Error(grpccodes.InvalidArgument, "stop_orders is required")
	}
	limit, hasLimit, err := s.feeLimit(ctx, req.GetShopCode())
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "fee limit lookup: %v", err)
	}
	catalog, err := s.queryAddons(ctx, s.pool, "")
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "addon catalog: %v", err)
	}

	out := make([]*batchingv1.Quote, 0, len(req.GetStopOrders())*6)
	for _, stop := range req.GetStopOrders() {
		quotes, err := s.nvc.Quotes(ctx, ahamove.QuoteRequest{
			ShopCode:   req.GetShopCode(),
			DistanceKm: stop.GetDistanceKm(),
			CodAmount:  stop.GetCodAmount(),
			TotalBill:  stop.GetTotalBill(),
		})
		if err != nil {
			return nil, status.Errorf(grpccodes.Unavailable, "carrier quotes: %v", err)
		}
		for _, q := range quotes {
			fee := q.Fee(stop.GetDistanceKm())
			out = append(out, &batchingv1.Quote{
				ServiceId:        q.ServiceID,
				Name:             q.Name,
				VehicleType:      q.VehicleType,
				BaseFee:          q.BaseFee,
				FeePerKm:         q.FeePerKm,
				Fee:              fee,
				EtaMinutes:       q.EtaMinutes,
				IsExceedFeeLimit: hasLimit && fee > limit, // strict > (§3.2)
				AddonServices:    addonsForVehicle(catalog, q.VehicleType),
			})
		}
	}
	return &batchingv1.GetQuotesResponse{Quotes: out, Meta: meta(s.nvc)}, nil
}

// addonsForVehicle — filter catalog theo xe: vehicle_types rỗng ('[]' jsonb)
// = áp dụng mọi loại xe; ngược lại chỉ khi danh sách chứa vehicleType.
func addonsForVehicle(catalog []addonRow, vehicleType string) []*batchingv1.AddonService {
	out := make([]*batchingv1.AddonService, 0, len(catalog))
	for _, a := range catalog {
		if !a.supports(vehicleType) {
			continue
		}
		out = append(out, &batchingv1.AddonService{Code: a.Code, Name: a.Name, Grp: a.Grp, Fee: a.Fee})
	}
	return out
}

// ---------------------------------------------------------------------------
// ConfirmPlanning — persist fee server-truth + fee-limit chặn + idempotency
// ---------------------------------------------------------------------------

func (s *DeliveryBatchServer) ConfirmPlanning(ctx context.Context, req *batchingv1.ConfirmPlanningRequest) (*batchingv1.ConfirmPlanningResponse, error) {
	if req.GetBatchCode() == "" {
		return nil, status.Error(grpccodes.InvalidArgument, "batch_code is required")
	}
	if len(req.GetPlannings()) == 0 {
		return nil, status.Error(grpccodes.InvalidArgument, "plannings is required")
	}

	// Transaction per batch confirm (spec §3.4) — tất cả planning trong 1 tx.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var shopCode string
	err = tx.QueryRow(ctx, `SELECT shop_code FROM batches WHERE batch_code = $1`, req.GetBatchCode()).Scan(&shopCode)
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.NotFound, "batch %s not found", req.GetBatchCode())
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "get batch: %v", err)
	}
	limit, hasLimit, err := s.feeLimit(ctx, shopCode)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "fee limit lookup: %v", err)
	}

	out := make([]*batchingv1.ShipmentPlanning, 0, len(req.GetPlannings()))
	for _, p := range req.GetPlannings() {
		sp, err := s.confirmOne(ctx, tx, req.GetBatchCode(), shopCode, p, limit, hasLimit)
		if err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "commit confirm: %v", err)
	}
	return &batchingv1.ConfirmPlanningResponse{Plannings: out, Meta: meta(s.nvc)}, nil
}

// confirmOne — 1 planning trong tx của batch: hydrate → quote → fee-limit →
// idempotency → upsert (DRAFT/CANCELLED → CONFIRMED rebook path).
func (s *DeliveryBatchServer) confirmOne(
	ctx context.Context,
	tx pgx.Tx,
	batchCode, shopCode string,
	p *batchingv1.PlanningInput,
	limit int64, hasLimit bool,
) (*batchingv1.ShipmentPlanning, error) {
	// Hydrate distance từ batch_items (V1 truth) + kiểm order_code khớp.
	var (
		itemOrderCode string
		distanceKm    float64
		codAmount     int64
	)
	err := tx.QueryRow(ctx, `SELECT order_code, distance, COALESCE(cod_amount, 0)
		FROM batch_items WHERE batch_code = $1 AND stop_order = $2`,
		batchCode, p.GetStopOrder()).Scan(&itemOrderCode, &distanceKm, &codAmount)
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.InvalidArgument,
			"stop %d not found in batch %s", p.GetStopOrder(), batchCode)
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "hydrate stop %d: %v", p.GetStopOrder(), err)
	}
	if itemOrderCode != p.GetOrderCode() {
		return nil, status.Errorf(grpccodes.InvalidArgument,
			"order_code mismatch at stop %d: batch has %s, request %s",
			p.GetStopOrder(), itemOrderCode, p.GetOrderCode())
	}

	// Idempotency (§3.4): CONFIRMED/BOOKED → no-op trả trạng thái hiện có.
	// FOR UPDATE: khoá row trước check status (confirm đồng thời không race —
	// rebook DRAFT/CANCELLED 2 lần không update/insert đè nhau).
	existing, err := scanPlanningRow(tx.QueryRow(ctx, `SELECT id, batch_code, stop_order,
		order_code, vehicle_type, carrier_service_id, addon_services, status,
		cod_amount, total_bill, fee FROM shipment_plannings
		WHERE batch_code = $1 AND stop_order = $2 FOR UPDATE`, batchCode, p.GetStopOrder()))
	if err != nil && err != pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.Internal, "load planning stop %d: %v", p.GetStopOrder(), err)
	}
	if existing != nil && (existing.GetStatus() == planningConfirmed || existing.GetStatus() == planningBooked) {
		return existing, nil
	}

	// Server-side truth (§3.2): gọi adapter.Quotes, chọn quote khớp serviceId.
	quotes, err := s.nvc.Quotes(ctx, ahamove.QuoteRequest{
		ShopCode:   shopCode,
		DistanceKm: distanceKm,
		CodAmount:  codAmount,
	})
	if err != nil {
		return nil, status.Errorf(grpccodes.Unavailable, "carrier quotes: %v", err)
	}
	var chosen *ahamove.Quote
	for i := range quotes {
		if quotes[i].ServiceID == p.GetServiceId() {
			chosen = &quotes[i]
			break
		}
	}
	if chosen == nil {
		return nil, status.Errorf(grpccodes.InvalidArgument,
			"service %s not available for stop %d (carrier returned %d quotes)",
			p.GetServiceId(), p.GetStopOrder(), len(quotes))
	}
	fee := chosen.Fee(distanceKm)

	// Fee-limit chặn (§3.2) — BE chốt, không tin FE.
	if hasLimit && fee > limit {
		return nil, status.Errorf(grpccodes.FailedPrecondition,
			"fee limit exceeded for shop %s: fee %d > limit %d (stop %d, service %s)",
			shopCode, fee, limit, p.GetStopOrder(), p.GetServiceId())
	}

	addonsJSON, err := json.Marshal(p.GetAddons())
	if err != nil {
		return nil, status.Errorf(grpccodes.InvalidArgument, "addons: %v", err)
	}

	var id int64
	if existing != nil {
		// DRAFT/CANCELLED → confirm lại (rebook path): update status + fee +
		// vehicle/service/addons (spec §3.4).
		err = tx.QueryRow(ctx, `UPDATE shipment_plannings SET
			vehicle_type = $1, carrier_service_id = $2, addon_services = $3::jsonb,
			status = $4, fee = $5, cod_amount = $6, updated_at = now()
			WHERE id = $7 RETURNING id`,
			p.GetVehicleType(), p.GetServiceId(), string(addonsJSON),
			planningConfirmed, fee, codAmount, existing.GetId()).Scan(&id)
	} else {
		err = tx.QueryRow(ctx, `INSERT INTO shipment_plannings
			(batch_code, stop_order, order_code, vehicle_type, carrier_service_id,
			 addon_services, status, cod_amount, total_bill, fee)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING id`,
			batchCode, p.GetStopOrder(), p.GetOrderCode(), p.GetVehicleType(),
			p.GetServiceId(), string(addonsJSON), planningConfirmed,
			codAmount, 0, fee).Scan(&id)
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "persist planning stop %d: %v", p.GetStopOrder(), err)
	}
	return &batchingv1.ShipmentPlanning{
		Id:          id,
		PlanningId:  planningID(id),
		BatchCode:   batchCode,
		StopOrder:   p.GetStopOrder(),
		OrderCode:   p.GetOrderCode(),
		VehicleType: p.GetVehicleType(),
		ServiceId:   p.GetServiceId(),
		Addons:      p.GetAddons(),
		Status:      planningConfirmed,
		CodAmount:   codAmount,
		Fee:         fee,
	}, nil
}

// planningID — planning_id = chuỗi id DB (bookings.planning_id bigint tham
// chiếu shipment_plannings.id — parse 2 chiều không mất dữ liệu).
func planningID(id int64) string { return strconv.FormatInt(id, 10) }

// scanPlanningRow — map row shipment_plannings → proto (nil khi ErrNoRows).
func scanPlanningRow(r interface{ Scan(dest ...any) error }) (*batchingv1.ShipmentPlanning, error) {
	var (
		p         batchingv1.ShipmentPlanning
		id        int64
		addonsRaw []byte
	)
	err := r.Scan(&id, &p.BatchCode, &p.StopOrder, &p.OrderCode, &p.VehicleType,
		&p.ServiceId, &addonsRaw, &p.Status, &p.CodAmount, &p.TotalBill, &p.Fee)
	if err != nil {
		return nil, err
	}
	p.Id = id
	p.PlanningId = planningID(id)
	if len(addonsRaw) > 0 {
		_ = json.Unmarshal(addonsRaw, &p.Addons) // jsonb đã valid từ DB
	}
	return &p, nil
}

// ---------------------------------------------------------------------------
// ListAddonServices — catalog (migration seed, spec §3.3)
// ---------------------------------------------------------------------------

func (s *DeliveryBatchServer) ListAddonServices(ctx context.Context, req *batchingv1.ListAddonServicesRequest) (*batchingv1.ListAddonServicesResponse, error) {
	rows, err := s.queryAddons(ctx, s.pool, req.GetVehicleType())
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "addon catalog: %v", err)
	}
	out := make([]*batchingv1.AddonServiceCatalog, 0, len(rows))
	for _, a := range rows {
		out = append(out, &batchingv1.AddonServiceCatalog{
			Code: a.Code, Name: a.Name, Grp: a.Grp, Fee: a.Fee, VehicleTypes: a.VehicleTypes,
		})
	}
	return &batchingv1.ListAddonServicesResponse{Addons: out, Meta: meta(s.nvc)}, nil
}

// ---------------------------------------------------------------------------
// CreateBooking — book loạt planning (spec §3.1/§3.4): CONFIRMED → BOOKED +
// bookings row + timeline đầu, tất cả trong 1 tx. planning_id = chuỗi id DB.
// ---------------------------------------------------------------------------

func (s *DeliveryBatchServer) CreateBooking(ctx context.Context, req *batchingv1.CreateBookingRequest) (*batchingv1.CreateBookingResponse, error) {
	if req.GetBatchCode() == "" {
		return nil, status.Error(grpccodes.InvalidArgument, "batch_code is required")
	}
	if len(req.GetShipmentPlannings()) == 0 {
		return nil, status.Error(grpccodes.InvalidArgument, "shipment_plannings is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var shopCode string
	err = tx.QueryRow(ctx, `SELECT shop_code FROM batches WHERE batch_code = $1`, req.GetBatchCode()).Scan(&shopCode)
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.NotFound, "batch %s not found", req.GetBatchCode())
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "get batch: %v", err)
	}

	out := make([]*batchingv1.BookingResult, 0, len(req.GetShipmentPlannings()))
	for _, in := range req.GetShipmentPlannings() {
		br, err := s.bookOne(ctx, tx, req.GetBatchCode(), shopCode, in)
		if err != nil {
			return nil, err
		}
		out = append(out, br)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "commit booking: %v", err)
	}
	return &batchingv1.CreateBookingResponse{Bookings: out, Meta: meta(s.nvc)}, nil
}

// bookOne — 1 planning trong tx: trạng thái CONFIRMED + fee-limit re-check
// (§3.2 — persisted fee là truth) → adapter.Book → INSERT bookings (row mới —
// rebook = row mới, §3.4) + UPDATE planning BOOKED + 2 tracking events đầu.
func (s *DeliveryBatchServer) bookOne(
	ctx context.Context,
	tx pgx.Tx,
	batchCode, shopCode string,
	in *batchingv1.ShipmentPlanningBookingInput,
) (*batchingv1.BookingResult, error) {
	pid, err := parsePlanningID(in.GetPlanningId())
	if err != nil {
		return nil, status.Errorf(grpccodes.InvalidArgument, "planning_id %q: %v", in.GetPlanningId(), err)
	}

	// Load planning — phải thuộc batch này + đang CONFIRMED (§3.4: Book trên
	// planning không ở CONFIRMED → FailedPrecondition). FOR UPDATE: khoá row
	// trước check-then-act status (2 book đồng thời không thấy cùng CONFIRMED).
	p, err := scanPlanningRow(tx.QueryRow(ctx, `SELECT id, batch_code, stop_order,
		order_code, vehicle_type, carrier_service_id, addon_services, status,
		cod_amount, total_bill, fee FROM shipment_plannings
		WHERE id = $1 AND batch_code = $2 FOR UPDATE`, pid, batchCode))
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.NotFound,
			"planning %s not found in batch %s", in.GetPlanningId(), batchCode)
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "load planning %s: %v", in.GetPlanningId(), err)
	}
	if p.GetStatus() != planningConfirmed {
		return nil, status.Errorf(grpccodes.FailedPrecondition,
			"planning %s status %s, want CONFIRMED", in.GetPlanningId(), p.GetStatus())
	}

	// Fee-limit re-check (§3.2) — chốt chặn cuối BE-authoritative, strict >.
	limit, hasLimit, err := s.feeLimit(ctx, shopCode)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "fee limit lookup: %v", err)
	}
	if hasLimit && p.GetFee() > limit {
		return nil, status.Errorf(grpccodes.FailedPrecondition,
			"fee limit exceeded for shop %s: fee %d > limit %d (planning %s)",
			shopCode, p.GetFee(), limit, in.GetPlanningId())
	}

	// Hydrate stop info từ batch_items (V1 truth — address + distance).
	var address string
	var distanceKm float64
	err = tx.QueryRow(ctx, `SELECT customer_address, distance FROM batch_items
		WHERE batch_code = $1 AND stop_order = $2`, batchCode, p.GetStopOrder()).
		Scan(&address, &distanceKm)
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.InvalidArgument,
			"stop %d not found in batch %s", p.GetStopOrder(), batchCode)
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "hydrate stop %d: %v", p.GetStopOrder(), err)
	}

	bookings, err := s.nvc.Book(ctx, ahamove.BookingRequest{
		ShopCode: shopCode,
		Items: []ahamove.BookingItem{{
			StopOrder:  p.GetStopOrder(),
			Address:    address,
			DistanceKm: distanceKm,
			CodAmount:  in.GetCodAmount(),
		}},
	})
	if err != nil {
		return nil, status.Errorf(grpccodes.Unavailable, "carrier book: %v", err)
	}
	if len(bookings) != 1 {
		return nil, status.Errorf(grpccodes.Internal,
			"carrier book: got %d bookings for 1 stop, want 1", len(bookings))
	}
	b := bookings[0]

	bookedAt := s.now()
	var bookingID int64
	err = tx.QueryRow(ctx, `INSERT INTO bookings
		(planning_id, batch_code, carrier_booking_id, driver_name, driver_phone,
		 license_plate, status, booked_at, is_mock)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		p.GetId(), batchCode, b.CarrierBookingID, b.DriverName, b.DriverPhone,
		b.LicensePlate, b.Status, bookedAt, s.nvc.IsMock()).Scan(&bookingID)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "persist booking %s: %v", b.CarrierBookingID, err)
	}

	// COD/bill từ request (display values do shop nhập lúc book).
	if _, err := tx.Exec(ctx, `UPDATE shipment_plannings SET
		status = $1, cod_amount = $2, total_bill = $3, updated_at = now()
		WHERE id = $4`, planningBooked, in.GetCodAmount(), in.GetTotalBill(), p.GetId()); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "update planning %s: %v", in.GetPlanningId(), err)
	}

	// Timeline đầu (§3.4): ORDER_CREATED (BE) + DRIVER_FOUND (PARTNER — mock
	// gán driver ngay; real chỉ khi provider xác nhận ngay lúc đặt).
	events := []struct {
		status, source string
	}{
		{eventOrderCreated, sourceBE},
	}
	if b.Status == eventDriverFound {
		events = append(events, struct{ status, source string }{eventDriverFound, sourcePartner})
	}
	for _, ev := range events {
		if _, err := tx.Exec(ctx, `INSERT INTO shipment_tracking_events
			(booking_id, status, source, occurred_at) VALUES ($1,$2,$3,$4)`,
			bookingID, ev.status, ev.source, bookedAt); err != nil {
			return nil, status.Errorf(grpccodes.Internal, "tracking event %s: %v", ev.status, err)
		}
	}

	return &batchingv1.BookingResult{
		PlanningId:       in.GetPlanningId(),
		CarrierBookingId: b.CarrierBookingID,
		DriverName:       b.DriverName,
		DriverPhone:      b.DriverPhone,
		LicensePlate:     b.LicensePlate,
		Status:           b.Status,
	}, nil
}

// ---------------------------------------------------------------------------
// CancelDeliveryOrder — hủy 1 đơn (spec §3.6): current booking CANCELLED +
// planning → CANCELLED; planning chưa book → cũng CANCELLED; đã CANCELLED →
// no-op trả hiện trạng.
// ---------------------------------------------------------------------------

func (s *DeliveryBatchServer) CancelDeliveryOrder(ctx context.Context, req *batchingv1.CancelDeliveryOrderRequest) (*batchingv1.CancelDeliveryOrderResponse, error) {
	pid, err := parsePlanningID(req.GetPlanningId())
	if err != nil {
		return nil, status.Errorf(grpccodes.InvalidArgument, "planning_id %q: %v", req.GetPlanningId(), err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// FOR UPDATE: khoá planning trước check-then-act status (cancel đồng thời
	// với book/rebook không đè trạng thái nhau).
	p, err := scanPlanningRow(tx.QueryRow(ctx, `SELECT id, batch_code, stop_order,
		order_code, vehicle_type, carrier_service_id, addon_services, status,
		cod_amount, total_bill, fee FROM shipment_plannings WHERE id = $1 FOR UPDATE`, pid))
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.NotFound, "planning %s not found", req.GetPlanningId())
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "load planning %s: %v", req.GetPlanningId(), err)
	}

	if p.GetStatus() != planningCancelled {
		// Current booking = row mới nhất chưa CANCELLED (§3.4 — id DESC).
		bookingID, carrierID, found, err := currentBooking(ctx, tx, pid, false)
		if err != nil {
			return nil, err
		}
		if found {
			if err := s.cancelBookingRow(ctx, tx, bookingID, carrierID, req.GetReason()); err != nil {
				return nil, err
			}
		}
		// Planning chưa book → cũng CANCELLED (§3.6).
		if _, err := tx.Exec(ctx, `UPDATE shipment_plannings SET
			status = $1, updated_at = now() WHERE id = $2`, planningCancelled, pid); err != nil {
			return nil, status.Errorf(grpccodes.Internal, "cancel planning %s: %v", req.GetPlanningId(), err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "commit cancel order: %v", err)
	}
	return &batchingv1.CancelDeliveryOrderResponse{
		PlanningId: req.GetPlanningId(),
		Status:     planningCancelled,
		Meta:       meta(s.nvc),
	}, nil
}

// ---------------------------------------------------------------------------
// CancelDeliveryBatch — hủy cả batch (spec §3.6): cancel mọi booking ACTIVE
// (planning BOOKED → CANCELLED) + planning CONFIRMED chưa book → DRAFT.
// Idempotent: lần 2 mọi planning đã ở trạng thái đích → no-op.
// ---------------------------------------------------------------------------

func (s *DeliveryBatchServer) CancelDeliveryBatch(ctx context.Context, req *batchingv1.CancelDeliveryBatchRequest) (*batchingv1.CancelDeliveryBatchResponse, error) {
	if req.GetBatchCode() == "" {
		return nil, status.Error(grpccodes.InvalidArgument, "batch_code is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var exists bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM batches WHERE batch_code = $1)`, req.GetBatchCode()).Scan(&exists)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "get batch: %v", err)
	}
	if !exists {
		return nil, status.Errorf(grpccodes.NotFound, "batch %s not found", req.GetBatchCode())
	}

	// FOR UPDATE: khoá toàn bộ planning của batch (thứ tự stop_order — lock
	// order deterministic, tránh deadlock) trước check-then-act status từng row.
	rows, err := tx.Query(ctx, `SELECT id, batch_code, stop_order, order_code,
		vehicle_type, carrier_service_id, addon_services, status, cod_amount,
		total_bill, fee FROM shipment_plannings WHERE batch_code = $1
		ORDER BY stop_order FOR UPDATE`, req.GetBatchCode())
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "load plannings: %v", err)
	}
	var plannings []*batchingv1.ShipmentPlanning
	for rows.Next() {
		p, err := scanPlanningRow(rows)
		if err != nil {
			rows.Close()
			return nil, status.Errorf(grpccodes.Internal, "scan planning: %v", err)
		}
		plannings = append(plannings, p)
	}
	if err := rows.Err(); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "scan plannings: %v", err)
	}
	rows.Close()

	var cancelled int
	results := make([]*batchingv1.CancelDeliveryBatchResult, 0, len(plannings))
	for _, p := range plannings {
		final := p.GetStatus()
		switch p.GetStatus() {
		case planningBooked:
			// Booking ACTIVE (chưa CANCELLED/COMPLETED/FAILED) → hủy.
			bookingID, carrierID, found, err := currentBooking(ctx, tx, p.GetId(), true)
			if err != nil {
				return nil, err
			}
			if found {
				if err := s.cancelBookingRow(ctx, tx, bookingID, carrierID, req.GetReason()); err != nil {
					return nil, err
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE shipment_plannings SET
				status = $1, updated_at = now() WHERE id = $2`, planningCancelled, p.GetId()); err != nil {
				return nil, status.Errorf(grpccodes.Internal, "cancel planning %d: %v", p.GetId(), err)
			}
			final = planningCancelled
			cancelled++
		case planningConfirmed:
			// Chưa book → về DRAFT (chờ cấu hình lại).
			if _, err := tx.Exec(ctx, `UPDATE shipment_plannings SET
				status = $1, updated_at = now() WHERE id = $2`, planningDraft, p.GetId()); err != nil {
				return nil, status.Errorf(grpccodes.Internal, "unconfirm planning %d: %v", p.GetId(), err)
			}
			final = planningDraft
		}
		results = append(results, &batchingv1.CancelDeliveryBatchResult{
			PlanningId: planningID(p.GetId()),
			Status:     final,
		})
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "commit cancel batch: %v", err)
	}
	return &batchingv1.CancelDeliveryBatchResponse{
		Results:        results,
		CancelledCount: int32(cancelled),
		Meta:           meta(s.nvc),
	}, nil
}

// ---------------------------------------------------------------------------
// SearchBookingDetail — timeline advance (spec §3.4/§3.6): per planning —
// current booking (row mới nhất chưa CANCELLED) → adapter.Detail → INSERT
// tracking_events thiếu (idempotent UNIQUE(booking_id,status)) → sync
// bookings.status forward → trả entry {planning_id, booking|null, timeline}.
// ---------------------------------------------------------------------------

// bookingStatusRank — thứ tự tiến triển timeline. Dùng cho sync FORWARD-ONLY:
// bookings.status không bao giờ bị lùi khi adapter trả trạng thái "cũ" hơn DB
// (mock Book gán DRIVER_FOUND ngay lúc đặt, Detail stateless chỉ đạt mốc đó
// sau +1m từ bookedAt — lùi về ORDER_CREATED sẽ sai hiện trạng).
var bookingStatusRank = map[string]int{
	eventOrderCreated: 1,
	eventDriverFound:  2,
	eventDelivering:   3,
	bookingCompleted:  4,
	bookingFailed:     4,
	eventCancelled:    5,
}

func (s *DeliveryBatchServer) SearchBookingDetail(ctx context.Context, req *batchingv1.SearchBookingDetailRequest) (*batchingv1.SearchBookingDetailResponse, error) {
	if len(req.GetPlanningIds()) == 0 {
		return nil, status.Error(grpccodes.InvalidArgument, "planning_ids is required")
	}

	// 1 tx cho cả request: advance = insert events + sync status (ghi), nên
	// nhất quán toàn bộ (1 planning lỗi → rollback cả đợt).
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	out := make([]*batchingv1.BookingEntry, 0, len(req.GetPlanningIds()))
	for _, raw := range req.GetPlanningIds() {
		entry, err := s.searchOne(ctx, tx, raw)
		if err != nil {
			return nil, err
		}
		out = append(out, entry)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "commit search: %v", err)
	}
	return &batchingv1.SearchBookingDetailResponse{Bookings: out, Meta: meta(s.nvc)}, nil
}

// searchOne — 1 planning: current booking → advance timeline → entry đầy đủ.
func (s *DeliveryBatchServer) searchOne(ctx context.Context, tx pgx.Tx, rawPlanningID string) (*batchingv1.BookingEntry, error) {
	pid, err := parsePlanningID(rawPlanningID)
	if err != nil {
		return nil, status.Errorf(grpccodes.InvalidArgument, "planning_id %q: %v", rawPlanningID, err)
	}

	// Planning phải tồn tại — không → InvalidArgument (§3.6 contract SF-16).
	var batchCode string
	var stopOrder int32
	err = tx.QueryRow(ctx, `SELECT batch_code, stop_order FROM shipment_plannings
		WHERE id = $1`, pid).Scan(&batchCode, &stopOrder)
	if err == pgx.ErrNoRows {
		return nil, status.Errorf(grpccodes.InvalidArgument, "planning %s not found", rawPlanningID)
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "load planning %s: %v", rawPlanningID, err)
	}

	// Current booking = row mới nhất chưa CANCELLED (§3.4 — ORDER BY id DESC).
	// Lựa chọn documented: nếu planning CHỈ có bookings CANCELLED (đã hủy,
	// chưa rebook) → coi như chưa có book hiệu lực → entry booking=null,
	// timeline=[] — timeline cũ giữ nguyên DB, KHÔNG advance từ adapter
	// (guard §3.4: booking CANCELLED không nhận event từ partner).
	var (
		bookingID                          int64
		carrierID, bDriver, bPhone, bPlate string
		bStatus                            string
		bookedAt                           time.Time
	)
	err = tx.QueryRow(ctx, `SELECT id, carrier_booking_id, driver_name,
		driver_phone, license_plate, status, booked_at FROM bookings
		WHERE planning_id = $1 AND status <> $2 ORDER BY id DESC LIMIT 1`,
		pid, bookingCancelled).
		Scan(&bookingID, &carrierID, &bDriver, &bPhone, &bPlate, &bStatus, &bookedAt)
	if err == pgx.ErrNoRows {
		// Chưa book (hoặc chỉ còn booking CANCELLED) → entry rỗng.
		return &batchingv1.BookingEntry{
			PlanningId: rawPlanningID,
			Timeline:   []*batchingv1.TrackingEvent{},
		}, nil
	}
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "current booking %s: %v", rawPlanningID, err)
	}

	// stopAddresses cho nhánh FAILED của mock (§3.1 — address chứa substring
	// "FAILED"); real adapter bỏ qua (timeline do provider lưu).
	var stopAddress string
	if err := tx.QueryRow(ctx, `SELECT customer_address FROM batch_items
		WHERE batch_code = $1 AND stop_order = $2`, batchCode, stopOrder).
		Scan(&stopAddress); err == nil || err == pgx.ErrNoRows {
		// batch_items thiếu (dữ liệu lệch) → address rỗng — vẫn advance được.
	} else {
		return nil, status.Errorf(grpccodes.Internal, "hydrate stop %d: %v", stopOrder, err)
	}

	// current booking không bao giờ CANCELLED (query đã loại) → cancelled=false.
	adapterStatus, events, err := s.nvc.Detail(ctx, carrierID, bookedAt, false, []string{stopAddress})
	if err != nil {
		return nil, status.Errorf(grpccodes.Unavailable, "carrier detail: %v", err)
	}

	// Idempotent insert (§3.4): chỉ event CHƯA CÓ mới vào — source=PARTNER,
	// occurred_at từ mốc của adapter. Chỉ persist milestone ĐẠT ĐƯỢC (At ≤ now):
	// mock Detail stateless trả full timeline tính từ bookedAt (kể cả mốc
	// tương lai — COMPLETED +30m); real adapter trả events thật nên filter
	// này là no-op. Không filter → timeline bị ô nhiễm event tương lai.
	now := s.now()
	for _, ev := range events {
		if ev.At.After(now) {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO shipment_tracking_events
			(booking_id, status, source, occurred_at, note) VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (booking_id, status) DO NOTHING`,
			bookingID, ev.Status, sourcePartner, ev.At, ev.Note); err != nil {
			return nil, status.Errorf(grpccodes.Internal, "tracking event %s: %v", ev.Status, err)
		}
	}

	// Sync bookings.status = trạng thái mới nhất — forward-only (không lùi).
	if adapterStatus != bStatus && bookingStatusRank[adapterStatus] > bookingStatusRank[bStatus] {
		if _, err := tx.Exec(ctx, `UPDATE bookings SET status = $1 WHERE id = $2`,
			adapterStatus, bookingID); err != nil {
			return nil, status.Errorf(grpccodes.Internal, "sync booking %d: %v", bookingID, err)
		}
		bStatus = adapterStatus
	}

	// Timeline đầy đủ của current booking từ DB.
	rows, err := tx.Query(ctx, `SELECT status, source, occurred_at,
		COALESCE(note, '') FROM shipment_tracking_events
		WHERE booking_id = $1 ORDER BY occurred_at, id`, bookingID)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "timeline %s: %v", rawPlanningID, err)
	}
	defer rows.Close()
	timeline := make([]*batchingv1.TrackingEvent, 0, len(events))
	for rows.Next() {
		var (
			evStatus, evSource, evNote string
			evAt                       time.Time
		)
		if err := rows.Scan(&evStatus, &evSource, &evAt, &evNote); err != nil {
			return nil, status.Errorf(grpccodes.Internal, "scan timeline %s: %v", rawPlanningID, err)
		}
		timeline = append(timeline, &batchingv1.TrackingEvent{
			Status: evStatus, Source: evSource,
			OccurredAt: evAt.Format(time.RFC3339), Note: evNote,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, status.Errorf(grpccodes.Internal, "scan timeline %s: %v", rawPlanningID, err)
	}

	return &batchingv1.BookingEntry{
		PlanningId: rawPlanningID,
		Booking: &batchingv1.BookingDetail{
			CarrierBookingId: carrierID,
			DriverName:       bDriver,
			DriverPhone:      bPhone,
			LicensePlate:     bPlate,
			Status:           bStatus,
			BookedAt:         bookedAt.Format(time.RFC3339),
			// CancelledAt/CancelReason chỉ set khi CANCELLED — current booking
			// chưa bao giờ CANCELLED nên luôn rỗng (§3.4).
		},
		Timeline: timeline,
	}, nil
}

// ---------------------------------------------------------------------------
// booking/cancel helpers
// ---------------------------------------------------------------------------

// parsePlanningID — planning_id proto = chuỗi id DB (decimal).
func parsePlanningID(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

// currentBooking — booking mới nhất của planning (id DESC — §3.4 tie-break
// deterministic). activeOnly=true (cancel-batch): bỏ cả COMPLETED/FAILED;
// false (cancel order): chỉ bỏ CANCELLED.
func currentBooking(ctx context.Context, tx pgx.Tx, planningID int64, activeOnly bool) (id int64, carrierID string, found bool, err error) {
	var r pgx.Row
	if activeOnly {
		r = tx.QueryRow(ctx, `SELECT id, carrier_booking_id FROM bookings
			WHERE planning_id = $1 AND status NOT IN ($2, $3, $4)
			ORDER BY id DESC LIMIT 1`,
			planningID, bookingCancelled, bookingCompleted, bookingFailed)
	} else {
		r = tx.QueryRow(ctx, `SELECT id, carrier_booking_id FROM bookings
			WHERE planning_id = $1 AND status <> $2
			ORDER BY id DESC LIMIT 1`,
			planningID, bookingCancelled)
	}
	err = r.Scan(&id, &carrierID)
	if err == pgx.ErrNoRows {
		return 0, "", false, nil
	}
	if err != nil {
		return 0, "", false, status.Errorf(grpccodes.Internal, "current booking: %v", err)
	}
	return id, carrierID, true, nil
}

// cancelBookingRow — 1 booking → CANCELLED + tracking event (BE); gọi
// adapter.Cancel best-effort (lỗi provider log, không fail — server owns
// persistence, spec §3.1).
func (s *DeliveryBatchServer) cancelBookingRow(ctx context.Context, tx pgx.Tx, bookingID int64, carrierBookingID, reason string) error {
	now := s.now()
	if _, err := tx.Exec(ctx, `UPDATE bookings SET
		status = $1, cancelled_at = $2, cancel_reason = $3 WHERE id = $4`,
		bookingCancelled, now, reason, bookingID); err != nil {
		return status.Errorf(grpccodes.Internal, "cancel booking %d: %v", bookingID, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO shipment_tracking_events
		(booking_id, status, source, occurred_at, note) VALUES ($1,$2,$3,$4,$5)`,
		bookingID, eventCancelled, sourceBE, now, reason); err != nil {
		return status.Errorf(grpccodes.Internal, "tracking event cancel booking %d: %v", bookingID, err)
	}
	if err := s.nvc.Cancel(ctx, carrierBookingID, reason); err != nil {
		log.Printf("[AHAMOVE] cancel %s best-effort failed (bỏ qua): %v", carrierBookingID, err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func meta(nvc ahamove.Client) *batchingv1.ResponseMeta {
	return &batchingv1.ResponseMeta{Mock: nvc.IsMock()}
}

// feeLimit — limit_amount của shop; row thiếu → (0, false) = không giới hạn.
func (s *DeliveryBatchServer) feeLimit(ctx context.Context, shopCode string) (int64, bool, error) {
	if shopCode == "" {
		return 0, false, nil
	}
	var limit int64
	err := s.pool.QueryRow(ctx, `SELECT limit_amount FROM fee_limits WHERE shop_code = $1`, shopCode).Scan(&limit)
	if err == pgx.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return limit, true, nil
}

// addonRow — 1 entry bảng addon_services (catalog seed, spec §3.3).
type addonRow struct {
	Code         string
	Name         string
	Grp          string
	Fee          int64
	VehicleTypes []string
}

// supports — vehicle_types '[]' = mọi xe; ngược lại phải chứa vehicleType.
func (a addonRow) supports(vehicleType string) bool {
	if len(a.VehicleTypes) == 0 {
		return true
	}
	for _, v := range a.VehicleTypes {
		if v == vehicleType {
			return true
		}
	}
	return false
}

// queryAddons — catalog theo thứ tự sort; vehicleType khác rỗng → lọc SQL
// ('[]' jsonb hoặc chứa vehicleType). Dùng cho ListAddonServices; GetQuotes
// load toàn bộ rồi filter in-Go per quote (addonsForVehicle).
func (s *DeliveryBatchServer) queryAddons(ctx context.Context, q interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}, vehicleType string) ([]addonRow, error) {
	query := `SELECT code, name, grp, fee, vehicle_types FROM addon_services`
	var args []any
	if vehicleType != "" {
		query += ` WHERE vehicle_types = '[]'::jsonb OR vehicle_types @> $1::jsonb`
		args = append(args, fmt.Sprintf(`[%q]`, vehicleType))
	}
	query += ` ORDER BY sort ASC, id ASC`

	rows, err := q.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []addonRow
	for rows.Next() {
		var a addonRow
		var vtRaw []byte
		if err := rows.Scan(&a.Code, &a.Name, &a.Grp, &a.Fee, &vtRaw); err != nil {
			return nil, err
		}
		if len(vtRaw) > 0 {
			if err := json.Unmarshal(vtRaw, &a.VehicleTypes); err != nil {
				return nil, fmt.Errorf("addon %s vehicle_types: %w", a.Code, err)
			}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
