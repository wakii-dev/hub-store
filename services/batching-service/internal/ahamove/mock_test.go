package ahamove

import (
	"context"
	"testing"
	"time"
)

// TestQuotes_SixVehiclesDistinctFees — 6 tải trọng, cùng distance → 6 mức
// phí khác nhau, tăng theo tải trọng (acceptance).
func TestQuotes_SixVehiclesDistinctFees(t *testing.T) {
	m := NewMock(false)
	qs, err := m.Quotes(context.Background(), QuoteRequest{ShopCode: "SH-001", DistanceKm: 10})
	if err != nil {
		t.Fatalf("Quotes: %v", err)
	}
	if len(qs) != 6 {
		t.Fatalf("want 6 quotes, got %d", len(qs))
	}
	wantVehicles := []string{"SGCN", "500KG", "1T", "2T", "3.5T", "8T"}
	wantFees := []int64{40000, 70000, 100000, 140000, 185000, 250000}
	prev := int64(-1)
	for i, q := range qs {
		if q.ServiceID != wantVehicles[i] {
			t.Errorf("quote[%d] serviceID=%s want %s", i, q.ServiceID, wantVehicles[i])
		}
		got := q.Fee(10)
		if got != wantFees[i] {
			t.Errorf("quote[%d] fee=%d want %d (base=%d+perKm=%d×10)", i, got, wantFees[i], q.BaseFee, q.FeePerKm)
		}
		if got <= prev {
			t.Errorf("quote[%d] fee %d không tăng so với trước (%d)", i, got, prev)
		}
		prev = got
	}
}

// TestQuotes_FeeRounding — fee = baseFee + feePerKm×km, làm tròn (km float).
func TestQuotes_FeeRounding(t *testing.T) {
	m := NewMock(false)
	qs, _ := m.Quotes(context.Background(), QuoteRequest{DistanceKm: 3.7})
	// SGCN: 10000 + round(3000×3.7=11100) = 21100.
	if got := qs[0].Fee(3.7); got != 21100 {
		t.Errorf("SGCN fee(3.7)=%d want 21100", got)
	}
}

// TestTimeline_Milestones — trạng thái theo mốc (normal mode, phút).
func TestTimeline_Milestones(t *testing.T) {
	bookedAt := time.Date(2026, 9, 2, 8, 0, 0, 0, time.UTC)
	cases := []struct {
		after time.Duration
		want  string
	}{
		{-1 * time.Second, "ORDER_CREATED"},
		{30 * time.Second, "ORDER_CREATED"},
		{1 * time.Minute, "DRIVER_FOUND"},
		{2 * time.Minute, "DRIVER_FOUND"},
		{5 * time.Minute, "DELIVERING"},
		{29 * time.Minute, "DELIVERING"},
		{30 * time.Minute, "COMPLETED"},
		{1 * time.Hour, "COMPLETED"},
	}
	for _, tc := range cases {
		m := NewMock(false)
		m.Now = func() time.Time { return bookedAt.Add(tc.after) }
		status, events, err := m.Detail(context.Background(), "MOCK-1", bookedAt, false, nil)
		if err != nil {
			t.Fatalf("Detail(+%s): %v", tc.after, err)
		}
		if status != tc.want {
			t.Errorf("Detail(+%s) status=%s want %s", tc.after, status, tc.want)
		}
		if len(events) != 4 {
			t.Fatalf("Detail(+%s) events=%d want 4", tc.after, len(events))
		}
		if events[0].Status != "ORDER_CREATED" || !events[0].At.Equal(bookedAt) {
			t.Errorf("events[0]=%+v want ORDER_CREATED@bookedAt", events[0])
		}
		if events[1].Status != "DRIVER_FOUND" || !events[1].At.Equal(bookedAt.Add(time.Minute)) {
			t.Errorf("events[1]=%+v want DRIVER_FOUND@+1m", events[1])
		}
		if events[2].Status != "DELIVERING" || !events[2].At.Equal(bookedAt.Add(5*time.Minute)) {
			t.Errorf("events[2]=%+v want DELIVERING@+5m", events[2])
		}
		if events[3].Status != "COMPLETED" || !events[3].At.Equal(bookedAt.Add(30*time.Minute)) {
			t.Errorf("events[3]=%+v want COMPLETED@+30m", events[3])
		}
	}
}

// TestTimeline_FastMode — AHAMOVE_MOCK_FAST=1 → milestones giây:
// DRIVER_FOUND +2s, DELIVERING +5s, COMPLETED +10s.
func TestTimeline_FastMode(t *testing.T) {
	bookedAt := time.Date(2026, 9, 2, 8, 0, 0, 0, time.UTC)
	cases := []struct {
		after time.Duration
		want  string
	}{
		{1 * time.Second, "ORDER_CREATED"},
		{2 * time.Second, "DRIVER_FOUND"},
		{5 * time.Second, "DELIVERING"},
		{10 * time.Second, "COMPLETED"},
	}
	for _, tc := range cases {
		m := NewMock(true)
		m.Now = func() time.Time { return bookedAt.Add(tc.after) }
		status, events, err := m.Detail(context.Background(), "MOCK-1", bookedAt, false, nil)
		if err != nil {
			t.Fatalf("Detail(+%s): %v", tc.after, err)
		}
		if status != tc.want {
			t.Errorf("fast Detail(+%s) status=%s want %s", tc.after, status, tc.want)
		}
		if len(events) != 4 {
			t.Fatalf("fast Detail events=%d want 4", len(events))
		}
		if !events[3].At.Equal(bookedAt.Add(10 * time.Second)) {
			t.Errorf("fast COMPLETED.At=%v want +10s", events[3].At)
		}
	}
}

// TestTimeline_FastModeFailed — FAILED +14s (thay COMPLETED).
func TestTimeline_FastModeFailed(t *testing.T) {
	bookedAt := time.Date(2026, 9, 2, 8, 0, 0, 0, time.UTC)
	m := NewMock(true)
	m.Now = func() time.Time { return bookedAt.Add(14 * time.Second) }
	status, events, err := m.Detail(context.Background(), "MOCK-1", bookedAt, false,
		[]string{"Kho A", "12 Đường FAILED, Q1"})
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if status != "FAILED" {
		t.Errorf("status=%s want FAILED", status)
	}
	if len(events) != 4 || events[3].Status != "FAILED" {
		t.Fatalf("events=%+v want [..., FAILED]", events)
	}
	if !events[3].At.Equal(bookedAt.Add(14 * time.Second)) {
		t.Errorf("FAILED.At=%v want +14s", events[3].At)
	}
	if events[3].Note == "" {
		t.Error("FAILED event phải có note lý do")
	}
}

// TestTimeline_FailedBranch — stop address chứa "FAILED" → COMPLETED thay
// bằng FAILED (+35m, note lý do).
func TestTimeline_FailedBranch(t *testing.T) {
	bookedAt := time.Date(2026, 9, 2, 8, 0, 0, 0, time.UTC)
	m := NewMock(false)
	m.Now = func() time.Time { return bookedAt.Add(36 * time.Minute) }
	status, events, err := m.Detail(context.Background(), "MOCK-1", bookedAt, false,
		[]string{"Kho trung chuyển", "45 Lý Thường Kiệt — FAILED giao lần 2"})
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if status != "FAILED" {
		t.Errorf("status=%s want FAILED", status)
	}
	if len(events) != 4 || events[3].Status != "FAILED" {
		t.Fatalf("events=%+v want [..., FAILED]", events)
	}
	if !events[3].At.Equal(bookedAt.Add(35 * time.Minute)) {
		t.Errorf("FAILED.At=%v want +35m", events[3].At)
	}
	if events[3].Note == "" {
		t.Error("FAILED event phải có note lý do")
	}
	// Marker case-sensitive: "failed" thường KHÔNG kích hoạt nhánh FAILED.
	m2 := NewMock(false)
	m2.Now = func() time.Time { return bookedAt.Add(36 * time.Minute) }
	status2, _, err := m2.Detail(context.Background(), "MOCK-2", bookedAt, false,
		[]string{"đường failed thường"})
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if status2 != "COMPLETED" {
		t.Errorf("marker thường: status=%s want COMPLETED (case-sensitive contract)", status2)
	}
}

// TestTimeline_Cancelled — cancelled=true → chỉ CANCELLED.
func TestTimeline_Cancelled(t *testing.T) {
	bookedAt := time.Date(2026, 9, 2, 8, 0, 0, 0, time.UTC)
	m := NewMock(false)
	m.Now = func() time.Time { return bookedAt.Add(1 * time.Hour) }
	status, events, err := m.Detail(context.Background(), "MOCK-1", bookedAt, true, nil)
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if status != "CANCELLED" {
		t.Errorf("status=%s want CANCELLED", status)
	}
	if len(events) != 1 || events[0].Status != "CANCELLED" {
		t.Fatalf("events=%+v want 1 CANCELLED", events)
	}
}

// TestBook_DriverPoolRoundRobin — pool 6 tài xế tuần hoàn; ID unique.
func TestBook_DriverPoolRoundRobin(t *testing.T) {
	m := NewMock(false)
	req := BookingRequest{ShopCode: "SH-001", Items: []BookingItem{
		{StopOrder: 1, Address: "A", DistanceKm: 5, CodAmount: 100000},
	}}
	seenIDs := map[string]bool{}
	var first3 []string
	for i := 0; i < 7; i++ { // 7 lần → driver thứ 7 = driver thứ 1 (tuần hoàn)
		bs, err := m.Book(context.Background(), req)
		if err != nil {
			t.Fatalf("Book #%d: %v", i, err)
		}
		if len(bs) != 1 {
			t.Fatalf("Book #%d: %d bookings want 1 (1 booking/item)", i, len(bs))
		}
		b := bs[0]
		if seenIDs[b.CarrierBookingID] {
			t.Fatalf("bookingID %s trùng", b.CarrierBookingID)
		}
		seenIDs[b.CarrierBookingID] = true
		if len(b.CarrierBookingID) == 0 || b.CarrierBookingID[:5] != "MOCK-" {
			t.Errorf("bookingID=%s want prefix MOCK-", b.CarrierBookingID)
		}
		if b.DriverName == "" || b.DriverPhone == "" || b.LicensePlate == "" {
			t.Errorf("booking %+v thiếu driver info", b)
		}
		if b.Status != "DRIVER_FOUND" {
			t.Errorf("booking status=%s want DRIVER_FOUND", b.Status)
		}
		if i < 3 {
			first3 = append(first3, b.DriverName)
		}
		if i == 6 && b.DriverName != first3[0] {
			t.Errorf("book #7 driver=%s want tuần hoàn về %s", b.DriverName, first3[0])
		}
	}
}

// TestCancel_NoOp — Cancel trả nil, không lỗi.
func TestCancel_NoOp(t *testing.T) {
	m := NewMock(false)
	if err := m.Cancel(context.Background(), "MOCK-1001", "shop hủy"); err != nil {
		t.Errorf("Cancel: %v", err)
	}
}
