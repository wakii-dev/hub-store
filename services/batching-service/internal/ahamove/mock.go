// mock.go — implementation MOCK (mặc định) của ahamove.Client.
//
// Nguyên tắc (spec §3.1):
//   - Bảng giá deterministic — cùng input ra cùng output, 6 tải trọng phí
//     phân biệt (acceptance: cùng distance → 6 mức phí khác nhau).
//   - Book gán driver từ pool TUẦN HOÀN, carrierBookingID = "MOCK-" + seq.
//   - Cancel no-op (server owns persistence) — chỉ log.
//   - Detail STATELESS: timeline tính từ bookedAt + now (không lưu state),
//     nhánh FAILED qua substring "FAILED" trong stop address (contract có
//     chủ đích cho e2e/SF-16).
//
// Mọi response/meta log với tag [MOCK]. Milestones nhanh (giây thay phút)
// qua AHAMOVE_MOCK_FAST=1 — test/E2E seam.
package ahamove

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// mockFleet — bảng giá mock: 6 tải trọng, baseFee và feePerKm tăng dần
// (cùng distance → 6 mức phí khác nhau, tăng theo tải trọng). ETA tăng theo
// tải trọng. Đơn vị: VND, km float.
var mockFleet = []Quote{
	{ServiceID: "SGCN", Name: "Xe máy", VehicleType: "SGCN", BaseFee: 10000, FeePerKm: 3000, EtaMinutes: 20},
	{ServiceID: "500KG", Name: "Xe tải 500kg", VehicleType: "500KG", BaseFee: 25000, FeePerKm: 4500, EtaMinutes: 35},
	{ServiceID: "1T", Name: "Xe tải 1 tấn", VehicleType: "1T", BaseFee: 40000, FeePerKm: 6000, EtaMinutes: 45},
	{ServiceID: "2T", Name: "Xe tải 2 tấn", VehicleType: "2T", BaseFee: 60000, FeePerKm: 8000, EtaMinutes: 60},
	{ServiceID: "3.5T", Name: "Xe tải 3.5 tấn", VehicleType: "3.5T", BaseFee: 85000, FeePerKm: 10000, EtaMinutes: 80},
	{ServiceID: "8T", Name: "Xe tải 8 tấn", VehicleType: "8T", BaseFee: 120000, FeePerKm: 13000, EtaMinutes: 100},
}

// mockDriver — 1 tài xế giả trong pool.
type mockDriver struct{ name, phone, plate string }

// mockDrivers — pool tài xế VN, Book gán tuần hoàn (seq % len).
var mockDrivers = []mockDriver{
	{"Nguyễn Văn A", "0901234501", "51A-123.45"},
	{"Trần Quốc B", "0912345602", "51B-234.56"},
	{"Lê Văn C", "0923456703", "59C-345.67"},
	{"Phạm Văn D", "0934567804", "43D-456.78"},
	{"Hoàng Văn E", "0945678905", "30E-567.89"},
	{"Vũ Văn F", "0956789006", "72F-678.90"},
}

// Trạng thái timeline mock (canonical strings — server/e2e dựa vào đây).
const (
	statusOrderCreated = "ORDER_CREATED"
	statusDriverFound  = "DRIVER_FOUND"
	statusDelivering   = "DELIVERING"
	statusCompleted    = "COMPLETED"
	statusFailed       = "FAILED"
	statusCancelled    = "CANCELLED"
)

// MockClient — mock implementation; stateless trừ seq (tạo bookingID unique)
// và Now (clock inject cho test).
type MockClient struct {
	mu  sync.Mutex
	seq int

	// Fast — milestones theo giây thay phút (AHAMOVE_MOCK_FAST=1, test/E2E seam).
	fast bool
	// Now — inject clock cho test; mặc định time.Now.
	Now func() time.Time
}

// NewMock — fast=true → milestones giây (AHAMOVE_MOCK_FAST=1).
func NewMock(fast bool) *MockClient {
	return &MockClient{seq: 1000, fast: fast, Now: time.Now}
}

// Quotes — bảng giá deterministic 6 tải trọng (mockFleet).
func (m *MockClient) Quotes(ctx context.Context, req QuoteRequest) ([]Quote, error) {
	out := make([]Quote, len(mockFleet))
	for i, q := range mockFleet {
		out[i] = q
	}
	log.Printf("[MOCK] quotes shop=%s distance=%.2fkm cod=%d → 6 phí: %s",
		req.ShopCode, req.DistanceKm, req.CodAmount, mockFeeSummary(req.DistanceKm))
	return out, nil
}

func mockFeeSummary(distanceKm float64) string {
	parts := make([]string, len(mockFleet))
	for i, q := range mockFleet {
		parts[i] = fmt.Sprintf("%s=%d", q.ServiceID, q.Fee(distanceKm))
	}
	return strings.Join(parts, " ")
}

// Book — 1 booking per item; driver từ pool tuần hoàn, ID "MOCK-<seq>".
func (m *MockClient) Book(ctx context.Context, req BookingRequest) ([]Booking, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Booking, 0, len(req.Items))
	for _, item := range req.Items {
		m.seq++
		d := mockDrivers[m.seq%len(mockDrivers)]
		b := Booking{
			CarrierBookingID: fmt.Sprintf("MOCK-%d", m.seq),
			DriverName:       d.name,
			DriverPhone:      d.phone,
			LicensePlate:     d.plate,
			Status:           statusDriverFound, // mock gán driver ngay lúc đặt
		}
		out = append(out, b)
		log.Printf("[MOCK] book shop=%s stop=%d id=%s driver=%s %s %s (dist=%.2fkm cod=%d)",
			req.ShopCode, item.StopOrder, b.CarrierBookingID, d.name, d.phone, d.plate,
			item.DistanceKm, item.CodAmount)
	}
	return out, nil
}

// Cancel — no-op state: server owns persistence; mock chỉ log + nil.
func (m *MockClient) Cancel(ctx context.Context, carrierBookingID, reason string) error {
	log.Printf("[MOCK] cancel id=%s reason=%q (no-op — server owns persistence)", carrierBookingID, reason)
	return nil
}

// Detail — timeline STATELESS từ bookedAt:
//
//	ORDER_CREATED (t0) → DRIVER_FOUND (+1m) → DELIVERING (+5m) → COMPLETED (+30m)
//	Nhánh FAILED: stop address chứa substring "FAILED" → COMPLETED thay bằng
//	FAILED (+35m, note lý do).
//	cancelled=true → chỉ trả event CANCELLED.
//	fast=true (AHAMOVE_MOCK_FAST=1) → giây: +2s / +5s / +10s, FAILED +14s.
//
// Trạng thái hiện tại = mốc mới nhất ≤ now (inject qua m.Now).
func (m *MockClient) Detail(ctx context.Context, carrierBookingID string, bookedAt time.Time, cancelled bool, stopAddresses []string) (string, []TrackEvent, error) {
	var dDriverFound, dDelivering, dCompleted, dFailed time.Duration
	if m.fast {
		dDriverFound, dDelivering, dCompleted, dFailed = 2*time.Second, 5*time.Second, 10*time.Second, 14*time.Second
	} else {
		dDriverFound, dDelivering, dCompleted, dFailed = 1*time.Minute, 5*time.Minute, 30*time.Minute, 35*time.Minute
	}

	var events []TrackEvent
	switch {
	case cancelled:
		events = []TrackEvent{{
			Status: statusCancelled,
			At:     bookedAt,
			Note:   "Vận đơn đã hủy (mock)",
		}}
	default:
		events = []TrackEvent{
			{Status: statusOrderCreated, At: bookedAt, Note: "Đơn đã tạo (mock)"},
			{Status: statusDriverFound, At: bookedAt.Add(dDriverFound), Note: "Đã tìm thấy tài xế (mock)"},
			{Status: statusDelivering, At: bookedAt.Add(dDelivering), Note: "Đang giao hàng (mock)"},
		}
		if hasFailedMarker(stopAddresses) {
			events = append(events, TrackEvent{
				Status: statusFailed,
				At:     bookedAt.Add(dFailed),
				Note:   "Giao hàng thất bại — stop address chứa marker FAILED (mock, contract có chủ đích e2e/SF-16)",
			})
		} else {
			events = append(events, TrackEvent{
				Status: statusCompleted,
				At:     bookedAt.Add(dCompleted),
				Note:   "Giao hàng thành công (mock)",
			})
		}
	}

	// Trạng thái hiện tại = mốc mới nhất đã đến (≤ now); now < bookedAt →
	// ORDER_CREATED; cancelled → luôn CANCELLED (event đầu tiên là CANCELLED).
	status := statusOrderCreated
	now := m.Now()
	for _, ev := range events {
		if ev.At.After(now) {
			break
		}
		status = ev.Status
	}
	if cancelled {
		status = statusCancelled
	}

	log.Printf("[MOCK] detail id=%s bookedAt=%s cancelled=%v → status=%s (%d events, fast=%v)",
		carrierBookingID, bookedAt.Format(time.RFC3339), cancelled, status, len(events), m.fast)
	return status, events, nil
}

// hasFailedMarker — nhánh FAILED: bất kỳ stop address chứa substring "FAILED"
// (case-sensitive, contract có chủ đích cho e2e/SF-16).
func hasFailedMarker(stopAddresses []string) bool {
	for _, a := range stopAddresses {
		if strings.Contains(a, "FAILED") {
			return true
		}
	}
	return false
}

// IsMock — luôn true (meta.mock=true cho mọi response, spec §3.6).
func (m *MockClient) IsMock() bool { return true }
