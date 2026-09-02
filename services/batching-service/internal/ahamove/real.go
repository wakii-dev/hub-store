// real.go — implementation REAL: Ahamove v3 public API.
//
// DOCUMENTED ASSUMPTIONS (chưa verify được — KHÔNG có credential Ahamove):
//
//   - Path theo docs public Ahamove v3:
//
//	POST   /v3/order/estimate   → bảng giá
//	POST   /v3/order            → đặt vận đơn (1 call per item)
//	DELETE /v3/order/{id}       → hủy (reason truyền qua query param)
//	GET    /v3/order/{id}       → chi tiết + timeline
//
//   - Headers auth: API_KEY + PARTNER_TOKEN (partner auth model của Ahamove).
//   - Wire field names là best-effort từ docs public; nếu thực tế khác, chỉ
//     cần sửa wire structs ở file này — contract Client không đổi.
//   - Fee ĐÓNG BĂNG tại thời điểm confirm (spec §3.2): server persist fee từ
//     Quotes lúc confirm; Ahamove có thể re-quote sau đó → drift so với fee
//     chốt là chấp nhận ở quy mô batch dev.
//   - KHÔNG network call trong unit test: base URL injectable — contract
//     tests chạy với httptest server (real_test.go).
package ahamove

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// RealClient — Ahamove v3 public API client.
type RealClient struct {
	base   string // không trailing "/", vd https://api.ahamove.com
	apiKey string
	token  string
	http   *http.Client
}

// NewReal — hc=nil dùng http.Client mặc định. baseURL injectable cho httptest.
func NewReal(baseURL, apiKey, partnerToken string, hc *http.Client) *RealClient {
	return &RealClient{
		base:   strings.TrimRight(baseURL, "/"),
		apiKey: apiKey,
		token:  partnerToken,
		http:   hc,
	}
}

// --- Wire structs (assumptions — xem comment đầu file) ---

type realEstimateReq struct {
	ShopCode   string  `json:"shop_code"`
	DistanceKm float64 `json:"distance_km"`
	CodAmount  int64   `json:"cod_amount"`
	TotalBill  int64   `json:"total_bill"`
}

type realQuote struct {
	ServiceID   string `json:"service_id"`
	Name        string `json:"name"`
	VehicleType string `json:"vehicle_type"`
	BaseFee     int64  `json:"base_fee"`
	FeePerKm    int64  `json:"fee_per_km"`
	EtaMinutes  int32  `json:"eta_minutes"`
}

type realBookItem struct {
	StopOrder  int32   `json:"stop_order"`
	Address    string  `json:"address"`
	DistanceKm float64 `json:"distance_km"`
	CodAmount  int64   `json:"cod_amount"`
}

type realBookReq struct {
	ShopCode string        `json:"shop_code"`
	Items    []realBookItem `json:"items"`
}

type realBookingResp struct {
	OrderID      string `json:"_id"`
	Status       string `json:"status"`
	DriverName   string `json:"driver_name"`
	DriverPhone  string `json:"driver_phone"`
	LicensePlate string `json:"license_plate"`
}

type realEvent struct {
	Status string `json:"status"`
	Time   string `json:"time"` // RFC3339 (assumption)
	Note   string `json:"note"`
}

type realDetailResp struct {
	OrderID string      `json:"_id"`
	Status  string      `json:"status"`
	Events  []realEvent `json:"events"`
}

// Quotes — POST /v3/order/estimate.
func (c *RealClient) Quotes(ctx context.Context, req QuoteRequest) ([]Quote, error) {
	var wire []realQuote
	if err := c.do(ctx, http.MethodPost, "/v3/order/estimate", realEstimateReq{
		ShopCode:   req.ShopCode,
		DistanceKm: req.DistanceKm,
		CodAmount:  req.CodAmount,
		TotalBill:  req.TotalBill,
	}, &wire); err != nil {
		return nil, fmt.Errorf("ahamove estimate: %w", err)
	}
	out := make([]Quote, len(wire))
	for i, q := range wire {
		out[i] = Quote(q)
	}
	return out, nil
}

// Book — POST /v3/order, 1 call per item (mock tạo 1 booking/item — real
// giữ cùng 1:1 để server xử lý đồng nhất).
func (c *RealClient) Book(ctx context.Context, req BookingRequest) ([]Booking, error) {
	out := make([]Booking, 0, len(req.Items))
	for _, item := range req.Items {
		var wire realBookingResp
		if err := c.do(ctx, http.MethodPost, "/v3/order", realBookReq{
			ShopCode: req.ShopCode,
			Items:    []realBookItem{{StopOrder: item.StopOrder, Address: item.Address, DistanceKm: item.DistanceKm, CodAmount: item.CodAmount}},
		}, &wire); err != nil {
			return nil, fmt.Errorf("ahamove book stop=%d: %w", item.StopOrder, err)
		}
		out = append(out, Booking{
			CarrierBookingID: wire.OrderID,
			DriverName:       wire.DriverName,
			DriverPhone:      wire.DriverPhone,
			LicensePlate:     wire.LicensePlate,
			Status:           wire.Status,
		})
	}
	return out, nil
}

// Cancel — DELETE /v3/order/{id}?reason=... (assumption: reason qua query).
func (c *RealClient) Cancel(ctx context.Context, carrierBookingID, reason string) error {
	return c.do(ctx, http.MethodDelete,
		"/v3/order/"+url.PathEscape(carrierBookingID)+"?reason="+url.QueryEscape(reason), nil, nil)
}

// Detail — GET /v3/order/{id}. stopAddresses bị bỏ qua (timeline do
// provider lưu — khác mock; chữ ký theo contract chung).
func (c *RealClient) Detail(ctx context.Context, carrierBookingID string, bookedAt time.Time, cancelled bool, stopAddresses []string) (string, []TrackEvent, error) {
	var wire realDetailResp
	if err := c.do(ctx, http.MethodGet, "/v3/order/"+carrierBookingID, nil, &wire); err != nil {
		return "", nil, fmt.Errorf("ahamove detail id=%s: %w", carrierBookingID, err)
	}
	events := make([]TrackEvent, 0, len(wire.Events))
	for _, ev := range wire.Events {
		at, err := time.Parse(time.RFC3339, ev.Time)
		if err != nil {
			return "", nil, fmt.Errorf("ahamove detail id=%s: parse event time %q: %w", carrierBookingID, ev.Time, err)
		}
		events = append(events, TrackEvent{Status: ev.Status, At: at, Note: ev.Note})
	}
	return wire.Status, events, nil
}

// do — 1 HTTP call với headers API_KEY + PARTNER_TOKEN; decode JSON khi out
// khác nil; non-2xx → error kèm snippet body.
func (c *RealClient) do(ctx context.Context, method, path string, body any, out any) error {
	var rd io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal body: %w", err)
		}
		rd = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("API_KEY", c.apiKey)
	req.Header.Set("PARTNER_TOKEN", c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status %d: %s", resp.StatusCode, snippet)
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
