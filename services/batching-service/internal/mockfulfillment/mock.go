// Package mockfulfillment — seed-backed mock của Java fulfillment-service.
//
// Dùng cho go test (context pack: "unit test mock Java server — KHÔNG cần
// Java thật") và cmd/mock-fulfillment (dev smoke khi Java chưa chạy). Mock
// giữ đúng contract: GetOrdersByCodes trả truth từ canonical seed,
// MutateOrderStatus đổi batchStatus in-memory + trả per-code results.
package mockfulfillment

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"sync"

	fulfillmentv1 "hubstore/gen/go/hubstore/fulfillment/v1"

	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/proto"
)

// seedFile — chỉ phần orders được mock sử dụng.
type seedFile struct {
	Orders []struct {
		FulfillCode    string  `json:"fulfillCode"`
		OrderCode      string  `json:"orderCode"`
		BatchStatus    int32   `json:"batchStatus"`
		StatusCode     int32   `json:"statusCode"`
		BatchCode      *string `json:"batchCode"`
		ShopAssignment struct {
			ShopCode string `json:"shopCode"`
			ShopName string `json:"shopName"`
			Address  string `json:"address"`
		} `json:"shopAssignment"`
		OriginalTime struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"originalTime"`
		DeliveryTime struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"deliveryTime"`
		OrderStatus          int32                   `json:"orderStatus"`
		Items                []fulfillmentv1.Product `json:"items"`
		TotalQuantity        int32                   `json:"totalQuantity"`
		CodAmount            int64                   `json:"codAmount"`
		IsDebtSplittingOrder bool                    `json:"isDebtSplittingOrder"`
		CustomerAddress      string                  `json:"customerAddress"`
		Distance             *float64                `json:"distance"`
	} `json:"orders"`
}

// MutationCall — 1 lần MutateOrderStatus đã ghi nhận (mock-verify hydration/
// mutation contract trong test). Role = x-user-role metadata Go forward sang.
type MutationCall struct {
	FulfillCodes []string
	Target       fulfillmentv1.BatchStatus
	Reason       string
	Role         string
}

// Server implements fulfillmentv1.FulfillmentServiceServer over the seed.
type Server struct {
	fulfillmentv1.UnimplementedFulfillmentServiceServer

	mu            sync.Mutex
	orders        map[string]*fulfillmentv1.HubStoreOrderFilterItem // by fulfillCode
	mutations     []MutationCall
	FailHydration bool // test hook: GetOrdersByCodes trả lỗi
	FailMutation  bool // test hook: MutateOrderStatus trả lỗi
}

// New builds a mock server from the canonical seed file.
func New(seedPath string) (*Server, error) {
	data, err := os.ReadFile(seedPath)
	if err != nil {
		return nil, fmt.Errorf("read seed: %w", err)
	}
	var f seedFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("parse seed: %w", err)
	}
	s := &Server{orders: map[string]*fulfillmentv1.HubStoreOrderFilterItem{}}
	for _, o := range f.Orders {
		item := &fulfillmentv1.HubStoreOrderFilterItem{
			FulfillCode: o.FulfillCode,
			StatusCode:  fulfillmentv1.CoordinationStatus(o.StatusCode),
			BatchStatus: fulfillmentv1.BatchStatus(o.BatchStatus),
			ShopAssignment: &fulfillmentv1.ShopAssignment{
				ShopCode: o.ShopAssignment.ShopCode,
				ShopName: o.ShopAssignment.ShopName,
				Address:  o.ShopAssignment.Address,
			},
			OriginalTime:         &fulfillmentv1.TimeRange{From: o.OriginalTime.From, To: o.OriginalTime.To},
			DeliveryTime:         &fulfillmentv1.TimeRange{From: o.DeliveryTime.From, To: o.DeliveryTime.To},
			OrderStatus:          fulfillmentv1.OrderStatus(o.OrderStatus),
			Items:                cloneProducts(o.Items),
			TotalQuantity:        o.TotalQuantity,
			CodAmount:            o.CodAmount,
			IsDebtSplittingOrder: o.IsDebtSplittingOrder,
			CustomerAddress:      o.CustomerAddress,
		}
		if o.Distance != nil {
			d := *o.Distance
			item.Distance = &d
		}
		if o.BatchCode != nil {
			bc := *o.BatchCode
			item.BatchCode = &bc
		}
		s.orders[o.FulfillCode] = item
	}
	return s, nil
}

func cloneProducts(in []fulfillmentv1.Product) []*fulfillmentv1.Product {
	out := make([]*fulfillmentv1.Product, 0, len(in))
	for i := range in {
		out = append(out, proto.Clone(&in[i]).(*fulfillmentv1.Product))
	}
	return out
}

// Mutations returns recorded MutateOrderStatus calls (test assertions).
func (s *Server) Mutations() []MutationCall {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]MutationCall(nil), s.mutations...)
}

// BatchStatusOf returns current mock order batchStatus (test assertions).
func (s *Server) BatchStatusOf(fulfillCode string) (fulfillmentv1.BatchStatus, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.orders[fulfillCode]
	if !ok {
		return 0, false
	}
	return o.GetBatchStatus(), true
}

// GetOrdersByCodes implements the hydration RPC — truth từ seed store.
func (s *Server) GetOrdersByCodes(ctx context.Context, req *fulfillmentv1.GetOrdersByCodesRequest) (*fulfillmentv1.GetOrdersByCodesResponse, error) {
	if s.FailHydration {
		return nil, fmt.Errorf("mock hydration failure")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]*fulfillmentv1.HubStoreOrderFilterItem, 0, len(req.GetFulfillCodes()))
	for _, c := range req.GetFulfillCodes() {
		if o, ok := s.orders[c]; ok {
			out = append(out, proto.Clone(o).(*fulfillmentv1.HubStoreOrderFilterItem))
		}
	}
	return &fulfillmentv1.GetOrdersByCodesResponse{Orders: out}, nil
}

// MutateOrderStatus implements the mutation RPC — in-memory, per-code result.
func (s *Server) MutateOrderStatus(ctx context.Context, req *fulfillmentv1.MutateOrderStatusRequest) (*fulfillmentv1.MutateOrderStatusResponse, error) {
	if s.FailMutation {
		return nil, fmt.Errorf("mock mutation failure")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	reason := req.GetReason()
	resp := &fulfillmentv1.MutateOrderStatusResponse{}
	for _, c := range req.GetFulfillCodes() {
		o, ok := s.orders[c]
		if !ok {
			resp.Results = append(resp.Results, &fulfillmentv1.MutateOrderStatusResult{
				FulfillCode: c, Success: false, Message: "not found",
			})
			continue
		}
		o.BatchStatus = req.GetTargetBatchStatus()
		if reason != "" {
			o.Note = &reason
		}
		resp.Results = append(resp.Results, &fulfillmentv1.MutateOrderStatusResult{
			FulfillCode: c, Success: true,
		})
	}
	s.mutations = append(s.mutations, MutationCall{
		FulfillCodes: append([]string(nil), req.GetFulfillCodes()...),
		Target:       req.GetTargetBatchStatus(),
		Reason:       req.GetReason(),
		Role:         incomingRole(ctx),
	})
	return resp, nil
}

// incomingRole đọc x-user-role từ metadata của call đến (mock-verify việc Go
// forward role sang Java).
func incomingRole(ctx context.Context) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	if vals := md.Get("x-user-role"); len(vals) > 0 {
		return vals[0]
	}
	return ""
}

// FulfillCodes returns all seeded fulfill codes sorted (test convenience).
func (s *Server) FulfillCodes() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.orders))
	for c := range s.orders {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}
