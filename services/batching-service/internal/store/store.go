// Package store — batches store (FI-245 SF-3): Postgres qua pgx v5.
//
// Data batches do seed pipeline SF-1 nạp sẵn vào DB (scripts/seed-db.sh,
// emptiness-gate) — Go chỉ migrate schema rồi đọc DB (LoadSeedFile đã bỏ).
// gRPC Batch message GIỮ NGUYÊN (hydration payload shape không đổi).
package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BatchStore là surface server dùng cho batches. Method có ctx + error vì
// Postgres là I/O thật; CAS miss (Transition) trả (nil, nil) — caller phân
// biệt not-found vs wrong-status qua Get (giữ nguyên hợp đồng cũ).
type BatchStore interface {
	// List — snapshot batches sort createdAt → batchCode (ORDER BY tường minh).
	List(ctx context.Context) ([]*batchingv1.Batch, error)
	// Get — (nil, nil) nếu không thấy.
	Get(ctx context.Context, batchCode string) (*batchingv1.Batch, error)
	// Put — upsert batch + thay toàn bộ items (dùng chủ yếu trong tests).
	Put(ctx context.Context, b *batchingv1.Batch) error
	// Delete — compensation path của CreateBatch (mutate Java fail → hoàn tác).
	Delete(ctx context.Context, batchCode string) error
	// CreateWithNextCode — cấp code từ sequence (atomic) + insert trong MỘT
	// transaction; build nhận code vừa cấp. (nil, false, nil) nếu trùng code.
	CreateWithNextCode(ctx context.Context, build func(ctx context.Context, code string) *batchingv1.Batch) (*batchingv1.Batch, bool, error)
	// Transition — CAS UPDATE ... WHERE status=$from; rowsAffected=0 → (nil, nil).
	Transition(ctx context.Context, batchCode string, from, to batchingv1.BatchEntityStatus) (*batchingv1.Batch, error)
	// NextBatchCode — preview code kế tiếp (KHÔNG tiêu thụ sequence).
	NextBatchCode(ctx context.Context) (string, error)
}

// PostgresStore implements BatchStore trên DB `batching` (schema V1 —
// services/batching-service/migrations, column contract scripts/seed-db.sh).
type PostgresStore struct {
	pool *pgxpool.Pool
}

// OpenPostgres kết nối pool + bootstrap sequence: setval = max numeric suffix
// của batchCode hiện có (seed nạp BATCH-0001..0007 sau khi migrate → lần boot
// đầu tiên bump sequence lên 7; bảng rỗng → setval 1,is_called=false → create
// đầu = BATCH-0001). Idempotent với setval phía seed pipeline (SF-1).
func OpenPostgres(ctx context.Context, dsn string) (*PostgresStore, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse batching DB DSN: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect batching DB: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping batching DB: %w", err)
	}
	s := &PostgresStore{pool: pool}
	if err := s.bootstrapSequence(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("bootstrap batches_code_seq: %w", err)
	}
	return s, nil
}

func (s *PostgresStore) bootstrapSequence(ctx context.Context) error {
	var maxCode int
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(max(substring(batch_code from '[0-9]+$')::int), 0) FROM batches`,
	).Scan(&maxCode); err != nil {
		return err
	}
	if maxCode == 0 {
		_, err := s.pool.Exec(ctx, `SELECT setval('batches_code_seq', 1, false)`)
		return err
	}
	_, err := s.pool.Exec(ctx, `SELECT setval('batches_code_seq', $1, true)`, maxCode)
	return err
}

// Close giải phóng pool.
func (s *PostgresStore) Close() { s.pool.Close() }

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

func (s *PostgresStore) List(ctx context.Context) ([]*batchingv1.Batch, error) {
	rows, err := s.pool.Query(ctx, `SELECT batch_code, shop_code, shipper_id,
		delivery_time_from, delivery_time_to, status, created_at
		FROM batches ORDER BY created_at ASC, batch_code ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*batchingv1.Batch
	var codes []string
	for rows.Next() {
		b, err := scanBatch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
		codes = append(codes, b.BatchCode)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := s.attachItems(ctx, out, codes); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *PostgresStore) Get(ctx context.Context, batchCode string) (*batchingv1.Batch, error) {
	row := s.pool.QueryRow(ctx, `SELECT batch_code, shop_code, shipper_id,
		delivery_time_from, delivery_time_to, status, created_at
		FROM batches WHERE batch_code = $1`, batchCode)
	b, err := scanBatch(row)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := s.attachItems(ctx, []*batchingv1.Batch{b}, []string{batchCode}); err != nil {
		return nil, err
	}
	return b, nil
}

// attachItems nạp batch_items cho danh sách codes (1 query — không N+1) rồi
// gắn vào từng batch theo thứ tự stop_order.
func (s *PostgresStore) attachItems(ctx context.Context, batches []*batchingv1.Batch, codes []string) error {
	if len(codes) == 0 {
		return nil
	}
	rows, err := s.pool.Query(ctx, `SELECT batch_code, stop_order, order_code,
		customer_address, distance, from_delivery_time, to_delivery_time,
		order_status, order_type, items, total_quantity, cod_amount
		FROM batch_items WHERE batch_code = ANY($1) ORDER BY batch_code ASC, stop_order ASC`, codes)
	if err != nil {
		return err
	}
	defer rows.Close()

	byCode := make(map[string]*batchingv1.Batch, len(batches))
	for _, b := range batches {
		byCode[b.BatchCode] = b
	}
	for rows.Next() {
		var code string
		it := &batchingv1.BatchingItem{}
		var fromT, toT *time.Time
		var itemsJSON []byte
		if err := rows.Scan(&code, &it.StopOrder, &it.OrderCode, &it.CustomerAddress,
			&it.Distance, &fromT, &toT, &it.OrderStatus, &it.OrderType,
			&itemsJSON, &it.TotalQuantity, &it.CodAmount); err != nil {
			return err
		}
		it.BatchCode = code
		if fromT != nil {
			it.FromDeliveryTime = fromT.UTC().Format(time.RFC3339)
		}
		if toT != nil {
			it.ToDeliveryTime = toT.UTC().Format(time.RFC3339)
		}
		products, err := unmarshalProducts(itemsJSON)
		if err != nil {
			return fmt.Errorf("batch %s stop %d items: %w", code, it.StopOrder, err)
		}
		it.Items = products
		if b := byCode[code]; b != nil {
			b.Items = append(b.Items, it)
		}
	}
	return rows.Err()
}

type productJSON struct {
	ProductCode string `json:"productCode"`
	ProductName string `json:"productName"`
	Quantity    int32  `json:"quantity"`
}

// unmarshalProducts — items jsonb shape [{productCode, productName, quantity}]
// (canonical-seed.json — trùng JSON shape của fulfillmentv1.Product).
func unmarshalProducts(data []byte) ([]*fulfillmentv1.Product, error) {
	if len(data) == 0 {
		return nil, nil
	}
	var ps []productJSON
	if err := json.Unmarshal(data, &ps); err != nil {
		return nil, err
	}
	out := make([]*fulfillmentv1.Product, 0, len(ps))
	for _, p := range ps {
		out = append(out, &fulfillmentv1.Product{
			ProductCode: p.ProductCode,
			ProductName: p.ProductName,
			Quantity:    p.Quantity,
		})
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

func (s *PostgresStore) Put(ctx context.Context, b *batchingv1.Batch) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if err := upsertBatch(ctx, tx, b); err != nil {
		return err
	}
	if err := replaceItems(ctx, tx, b); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) Delete(ctx context.Context, batchCode string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `DELETE FROM batch_items WHERE batch_code = $1`, batchCode); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM batches WHERE batch_code = $1`, batchCode); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) CreateWithNextCode(ctx context.Context, build func(ctx context.Context, code string) *batchingv1.Batch) (*batchingv1.Batch, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var n int64
	if err := tx.QueryRow(ctx, `SELECT nextval('batches_code_seq')`).Scan(&n); err != nil {
		return nil, false, err
	}
	code := fmt.Sprintf("BATCH-%04d", n)
	b := build(ctx, code)
	b.BatchCode = code
	if err := insertBatch(ctx, tx, b); err != nil {
		return nil, false, err
	}
	if err := replaceItems(ctx, tx, b); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return b, true, nil
}

func (s *PostgresStore) Transition(ctx context.Context, batchCode string, from, to batchingv1.BatchEntityStatus) (*batchingv1.Batch, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE batches SET status = $1 WHERE batch_code = $2 AND status = $3`,
		int(to), batchCode, int(from))
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, nil // CAS miss: không thấy code HOẶC status hiện ≠ from
	}
	return s.Get(ctx, batchCode)
}

func (s *PostgresStore) NextBatchCode(ctx context.Context) (string, error) {
	var maxNum int
	if err := s.pool.QueryRow(ctx, `SELECT GREATEST(
			COALESCE((SELECT max(substring(batch_code from '[0-9]+$')::int) FROM batches), 0),
			CASE WHEN is_called THEN last_value ELSE 0 END
		) FROM batches_code_seq`).Scan(&maxNum); err != nil {
		return "", err
	}
	return fmt.Sprintf("BATCH-%04d", maxNum+1), nil
}

// ---------------------------------------------------------------------------
// row mapping + insert helpers
// ---------------------------------------------------------------------------

type row interface {
	Scan(dest ...any) error
}

func scanBatch(r row) (*batchingv1.Batch, error) {
	b := &batchingv1.Batch{}
	var fromT, toT, createdAt *time.Time
	if err := r.Scan(&b.BatchCode, &b.ShopCode, &b.ShipperId, &fromT, &toT, &b.Status, &createdAt); err != nil {
		return nil, err
	}
	if fromT != nil {
		b.DeliveryTime = &fulfillmentv1.TimeRange{From: fromT.UTC().Format(time.RFC3339)}
	}
	if toT != nil {
		if b.DeliveryTime == nil {
			b.DeliveryTime = &fulfillmentv1.TimeRange{}
		}
		b.DeliveryTime.To = toT.UTC().Format(time.RFC3339)
	}
	if createdAt != nil {
		b.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	}
	return b, nil
}

func insertBatch(ctx context.Context, tx pgx.Tx, b *batchingv1.Batch) error {
	_, err := tx.Exec(ctx, `INSERT INTO batches
		(batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		b.BatchCode, b.ShopCode, b.ShipperId,
		timePtr(b.GetDeliveryTime().GetFrom()), timePtr(b.GetDeliveryTime().GetTo()),
		int(b.GetStatus()), tsOrNow(b.GetCreatedAt()))
	return err
}

func upsertBatch(ctx context.Context, tx pgx.Tx, b *batchingv1.Batch) error {
	_, err := tx.Exec(ctx, `INSERT INTO batches
		(batch_code, shop_code, shipper_id, delivery_time_from, delivery_time_to, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (batch_code) DO UPDATE SET
			shop_code = EXCLUDED.shop_code, shipper_id = EXCLUDED.shipper_id,
			delivery_time_from = EXCLUDED.delivery_time_from, delivery_time_to = EXCLUDED.delivery_time_to,
			status = EXCLUDED.status, created_at = EXCLUDED.created_at`,
		b.BatchCode, b.ShopCode, b.ShipperId,
		timePtr(b.GetDeliveryTime().GetFrom()), timePtr(b.GetDeliveryTime().GetTo()),
		int(b.GetStatus()), tsOrNow(b.GetCreatedAt()))
	return err
}

// replaceItems —xoá items cũ rồi insert lại theo stop_order (trong tx caller).
func replaceItems(ctx context.Context, tx pgx.Tx, b *batchingv1.Batch) error {
	if _, err := tx.Exec(ctx, `DELETE FROM batch_items WHERE batch_code = $1`, b.BatchCode); err != nil {
		return err
	}
	for _, it := range b.GetItems() {
		itemsJSON, err := marshalProducts(it.GetItems())
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO batch_items
			(batch_code, stop_order, order_code, customer_address, distance,
			 from_delivery_time, to_delivery_time, order_status, order_type,
			 items, total_quantity, cod_amount)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			b.BatchCode, it.GetStopOrder(), it.GetOrderCode(), it.GetCustomerAddress(),
			it.GetDistance(), timePtr(it.GetFromDeliveryTime()), timePtr(it.GetToDeliveryTime()),
			int(it.GetOrderStatus()), int(it.GetOrderType()), itemsJSON,
			it.GetTotalQuantity(), it.GetCodAmount()); err != nil {
			return err
		}
	}
	return nil
}

func marshalProducts(items []*fulfillmentv1.Product) (string, error) {
	ps := make([]productJSON, 0, len(items))
	for _, p := range items {
		ps = append(ps, productJSON{ProductCode: p.GetProductCode(), ProductName: p.GetProductName(), Quantity: p.GetQuantity()})
	}
	data, err := json.Marshal(ps)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func timePtr(s string) *time.Time {
	t := ParseTime(s)
	if t.IsZero() {
		return nil
	}
	return &t
}

func tsOrNow(s string) time.Time {
	t := ParseTime(s)
	if t.IsZero() {
		return time.Now()
	}
	return t
}

// ParseTime parses an ISO-8601 datetime from the contract; zero time on
// failure (callers decide whether that is fatal).
func ParseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}
