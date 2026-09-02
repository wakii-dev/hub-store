// Package ahamove — NVC (nhà vận chuyển) adapter dual-mode (SF-15, spec §3.1).
//
// Hai implementation của cùng contract Client:
//
//   - mock.go (MẶC ĐỊNH): response shape khớp Ahamove thực tế, dữ liệu
//     deterministic — bảng giá 6 tải trọng, driver pool tuần hoàn, timeline
//     stateless tính từ bookedAt. Không cần credential.
//   - real.go: Ahamove v3 public API — chỉ active khi AHAMOVE_MODE=real +
//     đủ AHAMOVE_API_KEY + AHAMOVE_PARTNER_TOKEN.
//
// Chỉ adapter này đụng provider — server impl (DeliveryBatchService, T4) chỉ
// thấy interface Client. Mode chọn lúc boot qua NewFromEnv (main.go).
package ahamove

import (
	"context"
	"log"
	"math"
	"os"
	"strings"
	"time"
)

// Quote — 1 lựa chọn phương tiện/tải trọng trả về từ Quotes.
type Quote struct {
	ServiceID   string
	Name        string
	VehicleType string
	BaseFee     int64 // VND
	FeePerKm    int64 // VND/km
	EtaMinutes  int32
}

// Fee — phí VND cho distance (đơn vị toàn hệ thống: km float64): baseFee +
// feePerKm×km, làm tròn về int64 VND. Server-side truth (spec §3.2 — BE
// persist fee lúc confirm, không tin FE).
func (q Quote) Fee(distanceKm float64) int64 {
	return q.BaseFee + int64(math.Round(float64(q.FeePerKm)*distanceKm))
}

// QuoteRequest — đầu vào bảng giá (distance đơn vị km float).
type QuoteRequest struct {
	ShopCode  string
	DistanceKm float64
	CodAmount int64
	TotalBill int64
}

// BookingItem — 1 stop cần vận chuyển (1 booking/stop, spec §3.1).
type BookingItem struct {
	StopOrder  int32
	Address    string
	DistanceKm float64
	CodAmount  int64
}

// BookingRequest — yêu cầu đặt vận đơn cho 1 planning.
type BookingRequest struct {
	ShopCode string
	Items    []BookingItem
}

// Booking — kết quả đặt 1 vận đơn.
type Booking struct {
	CarrierBookingID string
	DriverName       string
	DriverPhone      string
	LicensePlate     string
	Status           string
}

// TrackEvent — 1 mốc trạng thái trên timeline vận đơn (Detail trả về).
type TrackEvent struct {
	Status string
	At     time.Time
	Note   string
}

// Client — contract adapter NVC. Mock và real cùng implement; mọi method
// nhận ctx (real dùng cho HTTP, mock bỏ qua).
type Client interface {
	// Quotes — bảng giá cho 1 stop (6 phương thức ở mock, spec §3.2: server
	// chọn quote theo serviceId và persist fee lúc confirm).
	Quotes(ctx context.Context, req QuoteRequest) ([]Quote, error)
	// Book — đặt vận đơn, 1 booking per item.
	Book(ctx context.Context, req BookingRequest) ([]Booking, error)
	// Cancel — hủy vận đơn (mock: no-op state — server owns persistence).
	Cancel(ctx context.Context, carrierBookingID, reason string) error
	// Detail — timeline stateless từ bookedAt (mock); real: GET provider.
	// stopAddresses chỉ mock dùng (nhánh FAILED — address chứa substring
	// "FAILED", contract có chủ đích cho e2e/SF-16); real bỏ qua (timeline
	// do provider lưu).
	Detail(ctx context.Context, carrierBookingID string, bookedAt time.Time, cancelled bool, stopAddresses []string) (status string, events []TrackEvent, err error)
	// IsMock — true khi adapter chạy mock mode (ResponseMeta.mock của mọi
	// RPC DeliveryBatchService, spec §3.6).
	IsMock() bool
}

// NewFromEnv — chọn adapter lúc boot: AHAMOVE_MODE=real + đủ 2 key → real;
// mọi trường hợp khác → mock (mặc định). Luôn log mode rõ ràng.
func NewFromEnv() Client {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("AHAMOVE_MODE")))
	key, token := os.Getenv("AHAMOVE_API_KEY"), os.Getenv("AHAMOVE_PARTNER_TOKEN")
	if mode == "real" && key != "" && token != "" {
		base := envDefault("AHAMOVE_BASE_URL", "https://api.ahamove.com")
		log.Printf("[AHAMOVE] mode=real base_url=%s (v3 public API — assumptions documented ở real.go)", base)
		return NewReal(base, key, token, nil)
	}
	if mode == "real" {
		log.Printf("[AHAMOVE] AHAMOVE_MODE=real nhưng thiếu AHAMOVE_API_KEY/AHAMOVE_PARTNER_TOKEN — fallback mock")
	}
	fast := os.Getenv("AHAMOVE_MOCK_FAST") == "1"
	log.Printf("[AHAMOVE] mode=mock (mặc định; AHAMOVE_MOCK_FAST=%q → milestones theo giây: %v)", os.Getenv("AHAMOVE_MOCK_FAST"), fast)
	return NewMock(fast)
}

func envDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
