// Package server — BatchingService gRPC impl (proto SF-2, FROZEN).
//
// Semantics per spec §3.3/§3.4/§3.6 + context pack:
//   - Go owns batches store; Java owns orders. Rule 1 validate là server-side
//     thật: GetOrdersByCodes → Java, KHÔNG tin payload FE.
//   - Mutations chain: create → đơn PREPARING; cancel (chỉ ACTIVE, rule 4) →
//     đơn NOT_PREPARED; complete-picking → đơn PREPARED.
//   - criteria trả states cho phép hủy = [ACTIVE].
package server

import (
	"context"
	"log"
	"sort"
	"strings"
	"time"

	"hubstore/batching-service/internal/fulfillment"
	"hubstore/batching-service/internal/kafka"
	"hubstore/batching-service/internal/store"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"google.golang.org/grpc"
	grpccodes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// Config cho packing-suggest: đơn cách nhau ≤ GroupThresholdKm thuộc cùng
// nhóm giao (greedy theo khoảng cách tăng dần).
const (
	GroupThresholdKm = 2.0
	defaultPageSize  = 10
)

// BatchingServer implements hubstore.batching.v1.BatchingService.
type BatchingServer struct {
	batchingv1.UnimplementedBatchingServiceServer
	store   store.BatchStore
	fulfill fulfillment.Client
	now     func() time.Time // injectable for tests
	events  kafka.BatchEventPublisher // SF-27 side-channel; mặc định Noop
}

// New constructs the server over the batches store + Java client.
func New(s store.BatchStore, f fulfillment.Client) *BatchingServer {
	return &BatchingServer{store: s, fulfill: f, now: time.Now, events: kafka.NoopPublisher{}}
}

// SetClock overrides time source (tests).
func (s *BatchingServer) SetClock(now func() time.Time) { s.now = now }

// SetEventPublisher replaces the event publisher (SF-27; main.go wiring + tests).
func (s *BatchingServer) SetEventPublisher(p kafka.BatchEventPublisher) { s.events = p }

// ---------------------------------------------------------------------------
// Create — rule 1 server-side (hydration) + mutate PREPARING
// ---------------------------------------------------------------------------

func (s *BatchingServer) CreateBatch(ctx context.Context, req *batchingv1.CreateBatchRequest) (*batchingv1.CreateBatchResponse, error) {
	orderCodes := dedupeNonEmpty(req.GetFulfillCodes())
	if len(orderCodes) == 0 {
		return nil, status.Error(grpccodes.InvalidArgument, "fulfill_codes is required")
	}

	// Rule 1 §3.6 — truth từ Java, không tin payload FE.
	orders, err := s.fulfill.GetOrdersByCodes(ctx, orderCodes)
	if err != nil {
		return nil, status.Errorf(grpccodes.Unavailable, "hydration failed: %v", err)
	}
	byCode, err := correlate(orderCodes, orders)
	if err != nil {
		return nil, err
	}
	if err := validateRule1(orderCodes, byCode); err != nil {
		return nil, err
	}

	batch, ok, err := s.store.CreateWithNextCode(ctx, func(_ context.Context, code string) *batchingv1.Batch {
		// shopCode trống từ BFF → derive từ orders truth (spec §3.3).
		return &batchingv1.Batch{
			BatchCode: code,
			ShopCode:  orders[0].GetShopAssignment().GetShopCode(),
			ShipperId: req.GetShipperId(),
			DeliveryTime: &fulfillmentv1.TimeRange{
				From: req.GetDeliveryTime().GetFrom(),
				To:   req.GetDeliveryTime().GetTo(),
			},
			Status:    batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE,
			Items:     buildItems(code, orderCodes, byCode),
			CreatedAt: s.now().Format(time.RFC3339),
		}
	})
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "create batch: %v", err)
	}
	if !ok {
		return nil, status.Error(grpccodes.Internal, "batchCode collision")
	}

	// Mutate chain: đơn batchStatus NOT_PREPARED → PREPARING qua Java.
	if err := s.fulfill.MutateOrderStatus(ctx, orderCodes, fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING, ""); err != nil {
		// Compensation KHÔNG dùng request ctx — mutate fail có thể do deadline
		// ctx hết (spec: client deadline) → compensation trên ctx chết sẽ orphan
		// batch ACTIVE trong DB.
		compCtx, compCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer compCancel()
		if delErr := s.store.Delete(compCtx, batch.GetBatchCode()); delErr != nil { // compensation
			log.Printf("batching-service: compensation delete %s failed: %v", batch.GetBatchCode(), delErr)
		}
		return nil, status.Errorf(grpccodes.Unavailable, "order mutation failed: %v", err)
	}
	// SF-27 side-channel — best-effort, không chặn path nghiệp vụ.
	s.events.BatchCreated(ctx, batch.GetBatchCode(), len(orderCodes))
	return &batchingv1.CreateBatchResponse{Batch: batch}, nil
}

// correlate maps request-side codes (opaque — BFF forwards FE orderCodes) to
// hydrated Java truth. Proto v1 chỉ expose fulfill_code trên
// HubStoreOrderFilterItem nên match theo fulfill_code — Java (SF-3) resolve
// code nào FE gửi là semantics của SF-3/SF-11 (flag trong run report).
// Unknown code → InvalidArgument (rule 1).
func correlate(wantCodes []string, orders []*fulfillmentv1.HubStoreOrderFilterItem) (map[string]*fulfillmentv1.HubStoreOrderFilterItem, error) {
	byFulfill := map[string]*fulfillmentv1.HubStoreOrderFilterItem{}
	for _, o := range orders {
		byFulfill[o.GetFulfillCode()] = o
	}
	out := make(map[string]*fulfillmentv1.HubStoreOrderFilterItem, len(wantCodes))
	for _, c := range wantCodes {
		o, ok := byFulfill[c]
		if !ok {
			return nil, status.Errorf(grpccodes.InvalidArgument, "order %s not found", c)
		}
		out[c] = o
	}
	return out, nil
}

// validateRule1: mọi đơn tồn tại, CÙNG kho, batchStatus=0 (§3.6 rule 1).
func validateRule1(wantCodes []string, byCode map[string]*fulfillmentv1.HubStoreOrderFilterItem) error {
	var shop string
	for _, c := range wantCodes {
		o := byCode[c]
		sc := o.GetShopAssignment().GetShopCode()
		if sc == "" {
			return status.Errorf(grpccodes.InvalidArgument,
				"rule 1 violated: order %s has no shop assignment", o.GetFulfillCode())
		}
		if shop == "" {
			shop = sc
		} else if sc != shop {
			return status.Errorf(grpccodes.InvalidArgument,
				"rule 1 violated: orders span shops %s and %s", shop, sc)
		}
		if o.GetBatchStatus() != fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED {
			return status.Errorf(grpccodes.InvalidArgument,
				"rule 1 violated: order %s batchStatus=%d (must be NOT_PREPARED)",
				o.GetFulfillCode(), o.GetBatchStatus())
		}
	}
	return nil
}

// buildItems maps hydrated orders → BatchingItems. Thứ tự trong
// fulfill_codes = stopOrder (D1b drag-drop sort pin). item.order_code giữ
// NGUYÊN code phía request (D2 hiển thị đúng mã user đã chọn).
func buildItems(batchCode string, wantCodes []string, byCode map[string]*fulfillmentv1.HubStoreOrderFilterItem) []*batchingv1.BatchingItem {
	items := make([]*batchingv1.BatchingItem, 0, len(wantCodes))
	for i, c := range wantCodes {
		o := byCode[c]
		items = append(items, &batchingv1.BatchingItem{
			BatchCode:        batchCode,
			StopOrder:        int32(i + 1),
			OrderCode:        c,
			CustomerAddress:  o.GetCustomerAddress(),
			Distance:         o.GetDistance(),
			FromDeliveryTime: o.GetDeliveryTime().GetFrom(),
			ToDeliveryTime:   o.GetDeliveryTime().GetTo(),
			OrderStatus:      o.GetOrderStatus(),
			OrderType:        1, // seed không mang orderType — hub-store order mặc định 1
			Items:            o.GetItems(),
			TotalQuantity:    o.GetTotalQuantity(),
			CodAmount:        o.GetCodAmount(),
		})
	}
	return items
}

// ---------------------------------------------------------------------------
// Filter + detail
// ---------------------------------------------------------------------------

func (s *BatchingServer) FilterBatches(ctx context.Context, req *batchingv1.FilterBatchesRequest) (*batchingv1.FilterBatchesResponse, error) {
	all, err := s.store.List(ctx)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "list batches: %v", err)
	}

	search := strings.ToLower(strings.TrimSpace(req.GetSearch()))
	statuses := map[batchingv1.BatchEntityStatus]bool{}
	for _, st := range req.GetStatuses() {
		statuses[st] = true
	}
	fromT, toT := store.ParseTime(req.GetCreatedTime().GetFrom()), store.ParseTime(req.GetCreatedTime().GetTo())

	filtered := make([]*batchingv1.Batch, 0, len(all))
	for _, b := range all {
		if search != "" && !matchesSearch(b, search) {
			continue
		}
		if len(statuses) > 0 && !statuses[b.GetStatus()] {
			continue
		}
		if !withinRange(b.GetCreatedAt(), fromT, toT) {
			continue
		}
		filtered = append(filtered, b)
	}

	total := int64(len(filtered))
	page := int(req.GetPage())
	if page < 1 {
		page = 1
	}
	pageSize := int(req.GetPageSize())
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	start := (page - 1) * pageSize
	if start >= len(filtered) {
		filtered = nil
	} else {
		end := start + pageSize
		if end > len(filtered) {
			end = len(filtered)
		}
		filtered = filtered[start:end]
	}
	return &batchingv1.FilterBatchesResponse{
		Items:    filtered,
		Total:    total,
		Page:     int32(page),
		PageSize: int32(pageSize),
	}, nil
}

// matchesSearch: text search theo số phiếu HOẶC số đơn (D2 filter 1).
func matchesSearch(b *batchingv1.Batch, search string) bool {
	if strings.Contains(strings.ToLower(b.GetBatchCode()), search) {
		return true
	}
	for _, it := range b.GetItems() {
		if strings.Contains(strings.ToLower(it.GetOrderCode()), search) {
			return true
		}
	}
	return false
}

func withinRange(createdAt string, from, to time.Time) bool {
	if from.IsZero() && to.IsZero() {
		return true
	}
	t := store.ParseTime(createdAt)
	if !from.IsZero() && t.Before(from) {
		return false
	}
	if !to.IsZero() && t.After(to) {
		return false
	}
	return true
}

func (s *BatchingServer) GetBatchDetail(ctx context.Context, req *batchingv1.GetBatchDetailRequest) (*batchingv1.GetBatchDetailResponse, error) {
	b, err := s.store.Get(ctx, req.GetBatchCode())
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "get batch: %v", err)
	}
	if b == nil {
		return nil, status.Errorf(grpccodes.NotFound, "batch %s not found", req.GetBatchCode())
	}
	return &batchingv1.GetBatchDetailResponse{Batch: b}, nil
}

// ---------------------------------------------------------------------------
// Cancel (rule 4) / complete-picking / criteria
// ---------------------------------------------------------------------------

func (s *BatchingServer) CancelBatch(ctx context.Context, req *batchingv1.CancelBatchRequest) (*batchingv1.CancelBatchResponse, error) {
	// Rule 4 §3.6: chỉ batch ACTIVE được hủy — CAS atomic chặn double-cancel
	// và cancel-vs-complete race.
	b, err := s.store.Transition(ctx, req.GetBatchCode(),
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE,
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "cancel transition: %v", err)
	}
	if b == nil {
		cur, gerr := s.store.Get(ctx, req.GetBatchCode())
		if gerr != nil {
			return nil, status.Errorf(grpccodes.Internal, "get batch: %v", gerr)
		}
		if cur == nil {
			return nil, status.Errorf(grpccodes.NotFound, "batch %s not found", req.GetBatchCode())
		}
		return nil, status.Errorf(grpccodes.FailedPrecondition,
			"rule 4 violated: batch %s is %s (only ACTIVE cancellable)",
			cur.GetBatchCode(), cur.GetStatus())
	}

	itemCodes := itemOrderCodes(b)
	// Revert đơn batchStatus → 0 qua Java; fail → hoàn tác phiếu về ACTIVE
	// (compensation trên context riêng — không dùng request ctx có thể đã deadline).
	if err := s.fulfill.MutateOrderStatus(ctx, itemCodes, fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED, req.GetReason()); err != nil {
		compCtx, compCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer compCancel()
		if _, trErr := s.store.Transition(compCtx, req.GetBatchCode(),
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED,
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE); trErr != nil {
			log.Printf("batching-service: revert transition %s failed: %v", req.GetBatchCode(), trErr)
		}
		return nil, status.Errorf(grpccodes.Unavailable, "order revert failed: %v", err)
	}
	// SF-27 side-channel — chỉ success path (compensation KHÔNG publish).
	s.events.BatchTransitioned(ctx, req.GetBatchCode(), "active", "cancelled", req.GetReason())
	return &batchingv1.CancelBatchResponse{Batch: b}, nil
}

func (s *BatchingServer) CompletePicking(ctx context.Context, req *batchingv1.CompletePickingRequest) (*batchingv1.CompletePickingResponse, error) {
	b, err := s.store.Transition(ctx, req.GetBatchCode(),
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE,
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED)
	if err != nil {
		return nil, status.Errorf(grpccodes.Internal, "complete transition: %v", err)
	}
	if b == nil {
		cur, gerr := s.store.Get(ctx, req.GetBatchCode())
		if gerr != nil {
			return nil, status.Errorf(grpccodes.Internal, "get batch: %v", gerr)
		}
		if cur == nil {
			return nil, status.Errorf(grpccodes.NotFound, "batch %s not found", req.GetBatchCode())
		}
		return nil, status.Errorf(grpccodes.FailedPrecondition,
			"batch %s is %s (only ACTIVE can complete picking)",
			cur.GetBatchCode(), cur.GetStatus())
	}
	itemCodes := itemOrderCodes(b)
	if err := s.fulfill.MutateOrderStatus(ctx, itemCodes, fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARED, ""); err != nil {
		// Compensation trên context riêng (request ctx có thể đã deadline).
		compCtx, compCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer compCancel()
		if _, trErr := s.store.Transition(compCtx, req.GetBatchCode(),
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED,
			batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE); trErr != nil {
			log.Printf("batching-service: revert transition %s failed: %v", req.GetBatchCode(), trErr)
		}
		return nil, status.Errorf(grpccodes.Unavailable, "order mutation failed: %v", err)
	}
	// SF-27 side-channel — chỉ success path (compensation KHÔNG publish).
	s.events.BatchTransitioned(ctx, req.GetBatchCode(), "active", "completed", "")
	return &batchingv1.CompletePickingResponse{Batch: b}, nil
}

func (s *BatchingServer) GetBatchCriteria(ctx context.Context, _ *batchingv1.GetBatchCriteriaRequest) (*batchingv1.GetBatchCriteriaResponse, error) {
	return &batchingv1.GetBatchCriteriaResponse{
		CancellableStatuses: []batchingv1.BatchEntityStatus{batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE},
	}, nil
}

func itemOrderCodes(b *batchingv1.Batch) []string {
	itemCodes := make([]string, 0, len(b.GetItems()))
	for _, it := range b.GetItems() {
		itemCodes = append(itemCodes, it.GetOrderCode())
	}
	return itemCodes
}

// ---------------------------------------------------------------------------
// Packing suggest + recalculate-distance
// ---------------------------------------------------------------------------

func (s *BatchingServer) PackingSuggest(ctx context.Context, req *batchingv1.PackingSuggestRequest) (*batchingv1.PackingSuggestResponse, error) {
	pairs, err := s.hydrate(ctx, req.GetFulfillCodes())
	if err != nil {
		return nil, err
	}
	groups := groupByDistance(pairs)
	respGroups := make([]*batchingv1.PackingGroup, 0, len(groups))
	for _, g := range groups {
		codesInGroup := make([]string, 0, len(g))
		var total float64
		for _, p := range g {
			codesInGroup = append(codesInGroup, p.code)
			total += p.order.GetDistance()
		}
		respGroups = append(respGroups, &batchingv1.PackingGroup{
			FulfillCodes:    codesInGroup,
			TotalDistanceKm: round1(total),
		})
	}
	return &batchingv1.PackingSuggestResponse{Groups: respGroups}, nil
}

// codeOrder — cặp code-phía-request + order truth từ Java.
type codeOrder struct {
	code  string
	order *fulfillmentv1.HubStoreOrderFilterItem
}

// groupByDistance: sort theo khoảng cách tăng dần rồi greedy chia nhóm —
// đơn liên tiếp cách nhau ≤ GroupThresholdKm rơi cùng nhóm. Thứ tự trong
// nhóm = thứ tự giao đề xuất.
func groupByDistance(pairs []codeOrder) [][]codeOrder {
	sorted := make([]codeOrder, len(pairs))
	copy(sorted, pairs)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].order.GetDistance() < sorted[j].order.GetDistance()
	})
	var groups [][]codeOrder
	for _, p := range sorted {
		if n := len(groups); n > 0 &&
			p.order.GetDistance()-lastDistance(groups[n-1]) <= GroupThresholdKm {
			groups[n-1] = append(groups[n-1], p)
		} else {
			groups = append(groups, []codeOrder{p})
		}
	}
	return groups
}

func lastDistance(g []codeOrder) float64 {
	return g[len(g)-1].order.GetDistance()
}

func (s *BatchingServer) RecalculateDistance(ctx context.Context, req *batchingv1.RecalculateDistanceRequest) (*batchingv1.RecalculateDistanceResponse, error) {
	pairs, err := s.hydrate(ctx, req.GetFulfillCodes())
	if err != nil {
		return nil, err
	}
	out := make([]*batchingv1.OrderDistance, 0, len(pairs))
	for _, p := range pairs {
		out = append(out, &batchingv1.OrderDistance{
			FulfillCode: p.code,
			DistanceKm:  distanceOf(p.order),
		})
	}
	return &batchingv1.RecalculateDistanceResponse{Distances: out}, nil
}

// distanceOf: km truth từ Java khi có; đơn thiếu distance → derive
// deterministic từ địa chỉ (stub-world: không có distance API thật).
func distanceOf(o *fulfillmentv1.HubStoreOrderFilterItem) float64 {
	if d := o.GetDistance(); d > 0 {
		return d
	}
	return round1(1.0 + float64(len(o.GetCustomerAddress())%90)/10.0)
}

func (s *BatchingServer) hydrate(ctx context.Context, reqCodes []string) ([]codeOrder, error) {
	clean := dedupeNonEmpty(reqCodes)
	if len(clean) == 0 {
		return nil, status.Error(grpccodes.InvalidArgument, "fulfill_codes is required")
	}
	orders, err := s.fulfill.GetOrdersByCodes(ctx, clean)
	if err != nil {
		return nil, status.Errorf(grpccodes.Unavailable, "hydration failed: %v", err)
	}
	byCode, err := correlate(clean, orders)
	if err != nil {
		return nil, err
	}
	pairs := make([]codeOrder, 0, len(clean))
	for _, c := range clean {
		pairs = append(pairs, codeOrder{code: c, order: byCode[c]})
	}
	return pairs, nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func dedupeNonEmpty(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, c := range in {
		c = strings.TrimSpace(c)
		if c == "" || seen[c] {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	return out
}

func round1(f float64) float64 {
	return float64(int(f*10+0.5)) / 10
}

// RoleUnaryInterceptor extracts x-user-role từ incoming metadata (BFF gắn —
// services trust BFF, spec §3.9) và gắn vào context để mọi call sang Java
// (hydration/mutate) forward tiếp outgoing metadata.
func RoleUnaryInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if vals := md.Get("x-user-role"); len(vals) > 0 && vals[0] != "" {
			ctx = fulfillment.NewRoleContext(ctx, vals[0])
		}
	}
	return handler(ctx, req)
}

// RoleFromContext đọc x-user-role đã extract từ context (wrapper tiện test).
func RoleFromContext(ctx context.Context) string {
	return fulfillment.RoleFromContext(ctx)
}
