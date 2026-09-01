// Package store — in-memory batches store owned by batching-service (spec §3.3).
//
// Seed: deserialized from the canonical fixture api/seed/canonical-seed.json
// at boot (ONE source — no private seeding, context pack rule). Seed
// validation enforces the context-pack contract:
//   - batches cover all 3 BatchEntityStatus values,
//   - every items[].orderCode resolves to an orderCode in the orders seed.
package store

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"google.golang.org/protobuf/proto"
)

// seedFile mirrors api/seed/canonical-seed.json top-level shape. Only the
// parts this service consumes are modeled; orders are kept raw because the
// orders store belongs to Java (SF-3) — Go only cross-checks orderCode keys.
type seedFile struct {
	Orders []seedOrder `json:"orders"`
	Batches []seedBatch `json:"batches"`
}

type seedOrder struct {
	FulfillCode string `json:"fulfillCode"` // ORD-xxxx
	OrderCode   string `json:"orderCode"`   // RSA-7xxxxx (BatchingItem.order_code)
	BatchStatus int32  `json:"batchStatus"`
}

type seedBatch struct {
	BatchCode    string          `json:"batchCode"`
	ShopCode     string          `json:"shopCode"`
	ShipperID    string          `json:"shipperId"`
	DeliveryTime seedTimeRange   `json:"deliveryTime"`
	Status       int32           `json:"status"`
	Items        []seedBatchItem `json:"items"`
	CreatedAt    string          `json:"createdAt"`
}

type seedTimeRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type seedBatchItem struct {
	BatchCode        string          `json:"batchCode"`
	StopOrder        int32           `json:"stopOrder"`
	OrderCode        string          `json:"orderCode"`
	CustomerAddress  string          `json:"customerAddress"`
	Distance         float64         `json:"distance"`
	FromDeliveryTime string          `json:"fromDeliveryTime"`
	ToDeliveryTime   string          `json:"toDeliveryTime"`
	OrderStatus      int32           `json:"orderStatus"`
	OrderType        int32           `json:"orderType"`
	Items            []seedProduct   `json:"items"`
	TotalQuantity    int32           `json:"totalQuantity"`
	CodAmount        int64           `json:"codAmount"`
}

type seedProduct struct {
	ProductCode string `json:"productCode"`
	ProductName string `json:"productName"`
	Quantity    int32  `json:"quantity"`
}

// Store is a mutex-guarded in-memory batches store. Keyed by batchCode.
type Store struct {
	mu      sync.RWMutex
	batches map[string]*batchingv1.Batch
}

// New returns an empty store.
func New() *Store {
	return &Store{batches: map[string]*batchingv1.Batch{}}
}

// LoadSeedFile reads the canonical seed fixture from path and populates the
// store, validating the context-pack seed contract.
func LoadSeedFile(path string) (*Store, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read canonical seed %s: %w", path, err)
	}
	var f seedFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parse canonical seed %s: %w", path, err)
	}
	orderCodes := make(map[string]bool, len(f.Orders))
	for _, o := range f.Orders {
		orderCodes[o.OrderCode] = true
	}

	s := New()
	seenStatus := map[batchingv1.BatchEntityStatus]bool{}
	for i := range f.Batches {
		b := f.Batches[i]
		status := batchingv1.BatchEntityStatus(b.Status)
		if _, ok := batchingv1.BatchEntityStatus_name[int32(status)]; !ok {
			return nil, fmt.Errorf("seed batch %s: unknown status %d", b.BatchCode, b.Status)
		}
		seenStatus[status] = true
		pb := &batchingv1.Batch{
			BatchCode: b.BatchCode,
			ShopCode:  b.ShopCode,
			ShipperId: b.ShipperID,
			DeliveryTime: &fulfillmentv1.TimeRange{
				From: b.DeliveryTime.From,
				To:   b.DeliveryTime.To,
			},
			Status:    status,
			CreatedAt: b.CreatedAt,
		}
		for _, it := range b.Items {
			if !orderCodes[it.OrderCode] {
				return nil, fmt.Errorf("seed batch %s: item orderCode %s not in orders seed", b.BatchCode, it.OrderCode)
			}
			pb.Items = append(pb.Items, mapSeedItem(&b, &it))
		}
		s.batches[b.BatchCode] = pb
	}
	// Contract: phiếu đủ 3 trạng thái (context pack spec slice §2).
	for st := batchingv1.BatchEntityStatus(0); st <= 2; st++ {
		if !seenStatus[st] {
			return nil, fmt.Errorf("seed batches missing status %s", st)
		}
	}
	return s, nil
}

func mapSeedItem(b *seedBatch, it *seedBatchItem) *batchingv1.BatchingItem {
	items := make([]*fulfillmentv1.Product, 0, len(it.Items))
	for _, p := range it.Items {
		items = append(items, &fulfillmentv1.Product{
			ProductCode: p.ProductCode,
			ProductName: p.ProductName,
			Quantity:    p.Quantity,
		})
	}
	return &batchingv1.BatchingItem{
		BatchCode:        b.BatchCode,
		StopOrder:        it.StopOrder,
		OrderCode:        it.OrderCode,
		CustomerAddress:  it.CustomerAddress,
		Distance:         it.Distance,
		FromDeliveryTime: it.FromDeliveryTime,
		ToDeliveryTime:   it.ToDeliveryTime,
		OrderStatus:      fulfillmentv1.OrderStatus(it.OrderStatus),
		OrderType:        it.OrderType,
		Items:            items,
		TotalQuantity:    it.TotalQuantity,
		CodAmount:        it.CodAmount,
	}
}

// List returns a snapshot of all batches sorted by createdAt then batchCode.
func (s *Store) List() []*batchingv1.Batch {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*batchingv1.Batch, 0, len(s.batches))
	for _, b := range s.batches {
		out = append(out, b)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt != out[j].CreatedAt {
			return out[i].CreatedAt < out[j].CreatedAt
		}
		return out[i].BatchCode < out[j].BatchCode
	})
	return out
}

// Get returns a deep copy of the batch with the given code (nil if absent) —
// proto messages embed a lock; callers may mutate the returned value freely.
func (s *Store) Get(batchCode string) *batchingv1.Batch {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.batches[batchCode]
	if !ok {
		return nil
	}
	return proto.Clone(b).(*batchingv1.Batch)
}

// Put stores a batch.
func (s *Store) Put(b *batchingv1.Batch) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.batches[b.BatchCode] = b
}

// Delete removes a batch (compensation when the Java mutation fails).
func (s *Store) Delete(batchCode string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.batches, batchCode)
}

// NextBatchCode derives BATCH-%04d from the max numeric suffix in the store.
func (s *Store) NextBatchCode() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	max := 0
	for code := range s.batches {
		if !strings.HasPrefix(code, "BATCH-") {
			continue
		}
		if n, err := strconv.Atoi(strings.TrimPrefix(code, "BATCH-")); err == nil && n > max {
			max = n
		}
	}
	return fmt.Sprintf("BATCH-%04d", max+1)
}

// ParseTime parses an ISO-8601 datetime from the seed/contract; zero time on
// failure (callers decide whether that is fatal).
func ParseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}
