// Package reconcile — SF-12 (FI-257) reconciliation job: dọn orphan PREPARING.
//
// Orphan criteria (spec §3.6, CONTRACT): đơn PREPARING là orphan ⇔ KHÔNG tồn
// tại batch ACTIVE nào chứa fulfill_code đó. Batch CANCELLED/COMPLETED KHÔNG
// tính là match (đơn bị bỏ lại PREPARING sau cancel/complete là lỗi state) —
// drift chiều ngược (batch ACTIVE chứa đơn không PREPARING) out-of-scope.
//
// Tick: Java FilterOrders(batch_statuses=[PREPARING]) → với từng fulfill_code
// query batching DB (bảng thật: batch_items.order_code giữ fulfill_code —
// buildItems SF-2) — nếu không có batch ACTIVE chứa code → revert batchStatus
// → NOT_PREPARED qua Java MutateOrderStatus (cùng path CancelBatch
// batching_server.go; CHỈ Java mutate order — rule spec §3.3). Actor audit:
// metadata x-user-name=reconciler → Java ActorInterceptor ghi activity_log.
//
// Idempotent: sau revert, đơn không còn PREPARING → tick sau không thấy lại.
// Off mặc định: RECONCILE_INTERVAL (giây) ≤ 0 / unset = KHÔNG start.
package reconcile

import (
	"context"
	"os"
	"strconv"
	"sync/atomic"
	"time"

	"hubstore/batching-service/internal/logging"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// Java — narrow surface của fulfillment-service mà reconciler cần (gen stub
// thỏa mãn; fake trong test). Metadata auth gắn ở callCtx (pattern T1
// internal/fulfillment/client.go — forward authorization nếu có, ngược lại
// x-internal-token từ env) + x-user-name=reconciler cho actor/audit Java.
// Signature khớp gen stub (grpc.CallOption) để FulfillmentServiceClient
// implement trực tiếp.
type Java interface {
	FilterOrders(ctx context.Context, in *fulfillmentv1.FilterOrdersRequest, opts ...grpc.CallOption) (*fulfillmentv1.FilterOrdersResponse, error)
	MutateOrderStatus(ctx context.Context, in *fulfillmentv1.MutateOrderStatusRequest, opts ...grpc.CallOption) (*fulfillmentv1.MutateOrderStatusResponse, error)
}

// Reconciler chạy tick định kỳ. Zero-value không dùng — qua New.
type Reconciler struct {
	fulfill  Java
	pool     *pgxpool.Pool // batching DB (batches/batch_items)
	interval time.Duration
	timeout  time.Duration // deadline 1 tick (chặn tick treo vĩnh viễn)
}

// New — interval <= 0 không hợp lệ (main.go chỉ start khi > 0).
// timeout <= 0 → default 30s (test inject giá trị nhỏ).
func New(f Java, pool *pgxpool.Pool, interval, timeout time.Duration) *Reconciler {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Reconciler{fulfill: f, pool: pool, interval: interval, timeout: timeout}
}

// IntervalFromEnv đọc RECONCILE_INTERVAL (giây). Unset / lỗi / <= 0 → 0
// (= không start reconciler).
func IntervalFromEnv() time.Duration {
	v := os.Getenv("RECONCILE_INTERVAL")
	if v == "" {
		return 0
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0
	}
	return time.Duration(n) * time.Second
}

// Run — ticker loop. Tick trước chưa xong → skip (atomic CAS, không chồng
// tick). ctx.Done → stop.
func (r *Reconciler) Run(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	var busy atomic.Bool
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !busy.CompareAndSwap(false, true) {
				logging.Warn("reconcile: tick trước chưa xong — skip",
					"component", "reconciler", "event", "tick_skipped")
				continue
			}
			tctx, cancel := context.WithTimeout(ctx, r.timeout)
			r.Tick(tctx)
			cancel()
			busy.Store(false)
		}
	}
}

// Tick — 1 lần quét: filter PREPARING → cross-DB check → revert orphan.
func (r *Reconciler) Tick(ctx context.Context) {
	codes := r.preparingCodes(ctx)
	if len(codes) == 0 {
		return
	}
	active, err := activeBatchCodes(ctx, r.pool, codes)
	if err != nil {
		logging.Warn("reconcile: query batches failed",
			"component", "reconciler", "err", err.Error())
		return
	}
	for _, c := range codes {
		if active[c] {
			continue // có phiếu ACTIVE chứa đơn — không orphan
		}
		r.revert(ctx, c)
	}
}

// preparingCodes — Java FilterOrders batch_statuses=[PREPARING], paginate
// hết (guard maxPages chống server lỗi trả total sai).
func (r *Reconciler) preparingCodes(ctx context.Context) []string {
	const pageSize = int32(200)
	const maxPages = 1000
	var codes []string
	for page := int32(1); page <= maxPages; page++ {
		resp, err := r.fulfill.FilterOrders(callCtx(ctx), &fulfillmentv1.FilterOrdersRequest{
			BatchStatuses: []fulfillmentv1.BatchStatus{
				fulfillmentv1.BatchStatus_BATCH_STATUS_PREPARING},
			Page: page, PageSize: pageSize,
		})
		if err != nil {
			logging.Warn("reconcile: filter orders failed",
				"component", "reconciler", "err", err.Error())
			return nil // tick này bỏ — tick sau thử lại (fail-open cho nghiệp vụ)
		}
		for _, it := range resp.GetItems() {
			codes = append(codes, it.GetFulfillCode())
		}
		if int32(len(resp.GetItems())) < pageSize {
			return codes
		}
	}
	return codes
}

// activeBatchCodes — tập fulfill_code trong codes đang nằm trong ≥1 batch
// ACTIVE. Schema thật (golang-migrate V1): batch_items.order_code giữ
// fulfill_code; batches.status int (0=ACTIVE — BatchEntityStatus).
func activeBatchCodes(ctx context.Context, pool *pgxpool.Pool, codes []string) (map[string]bool, error) {
	rows, err := pool.Query(ctx, `SELECT DISTINCT bi.order_code
		FROM batch_items bi
		JOIN batches b ON b.batch_code = bi.batch_code
		WHERE b.status = $1 AND bi.order_code = ANY($2)`,
		int(batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE), codes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out[c] = true
	}
	return out, rows.Err()
}

// revert — 1 orphan qua Java (path CancelBatch: target NOT_PREPARED, batchCode
// rỗng — không có phiếu đích). Per-code: 1 lỗi không chặn các orphan khác.
// logging.Warn JSON {orphan, ...} — đây là event vận hành quan trọng (state
// lệch vừa được sửa), không phải noise.
func (r *Reconciler) revert(ctx context.Context, code string) {
	reason := "reconciler: PREPARING orphan — không còn batch ACTIVE chứa đơn"
	resp, err := r.fulfill.MutateOrderStatus(callCtx(ctx), &fulfillmentv1.MutateOrderStatusRequest{
		FulfillCodes:      []string{code},
		TargetBatchStatus: fulfillmentv1.BatchStatus_BATCH_STATUS_NOT_PREPARED,
		Reason:            &reason,
	})
	if err != nil {
		logging.Warn("reconcile: revert failed",
			"component", "reconciler", "orphan", code, "err", err.Error())
		return
	}
	for _, res := range resp.GetResults() {
		if !res.GetSuccess() {
			logging.Warn("reconcile: revert rejected",
				"component", "reconciler", "orphan", code, "err", res.GetMessage())
			continue
		}
		logging.Warn("reconcile: orphan reverted",
			"component", "reconciler", "orphan", code,
			"batch_status", "NOT_PREPARED", "actor", "reconciler")
	}
}

// callCtx — outbound metadata cho call Java (pattern T1 client.go SF-12 §3.1):
// luồng có incoming authorization → forward Bearer; ngược lại (reconciler
// chạy nền) → x-internal-token từ INTERNAL_SERVICE_TOKEN. x-user-name luôn
// gắn — Java ActorInterceptor dùng làm actor ghi activity_log/audit.
func callCtx(ctx context.Context) context.Context {
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if vals := md.Get("authorization"); len(vals) > 0 && vals[0] != "" {
			return metadata.AppendToOutgoingContext(ctx,
				"authorization", vals[0], "x-user-name", "reconciler")
		}
	}
	if tok := os.Getenv("INTERNAL_SERVICE_TOKEN"); tok != "" {
		ctx = metadata.AppendToOutgoingContext(ctx, "x-internal-token", tok)
	}
	return metadata.AppendToOutgoingContext(ctx, "x-user-name", "reconciler")
}
