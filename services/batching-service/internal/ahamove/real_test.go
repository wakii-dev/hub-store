package ahamove

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// realCapture — ghi nhận request shape để assert trong từng test.
type realCapture struct {
	Method string
	Path   string
	Query  string
	APIKey string
	Token  string
	Body   map[string]any
}

// newRealTestServer — httptest server ghi request + trả respCode/respJSON.
func newRealTestServer(t *testing.T, respCode int, respJSON string) (*httptest.Server, *realCapture) {
	t.Helper()
	cap := &realCapture{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cap.Method = r.Method
		cap.Path = r.URL.Path
		cap.Query = r.URL.RawQuery
		cap.APIKey = r.Header.Get("API_KEY")
		cap.Token = r.Header.Get("PARTNER_TOKEN")
		if r.Body != nil {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			cap.Body = body
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(respCode)
		_, _ = w.Write([]byte(respJSON))
	}))
	t.Cleanup(srv.Close)
	return srv, cap
}

// TestReal_Quotes — request shape + auth headers + response parse.
func TestReal_Quotes(t *testing.T) {
	srv, cap := newRealTestServer(t, http.StatusOK, `[
		{"service_id":"SGCN","name":"Xe máy","vehicle_type":"SGCN","base_fee":10000,"fee_per_km":3000,"eta_minutes":20},
		{"service_id":"8T","name":"Xe tải 8 tấn","vehicle_type":"8T","base_fee":120000,"fee_per_km":13000,"eta_minutes":100}
	]`)
	c := NewReal(srv.URL, "key-123", "token-456", srv.Client())

	qs, err := c.Quotes(context.Background(), QuoteRequest{ShopCode: "SH-001", DistanceKm: 12.5, CodAmount: 500000, TotalBill: 900000})
	if err != nil {
		t.Fatalf("Quotes: %v", err)
	}
	if cap.Method != http.MethodPost || cap.Path != "/v3/order/estimate" {
		t.Errorf("request %s %s want POST /v3/order/estimate", cap.Method, cap.Path)
	}
	if cap.APIKey != "key-123" || cap.Token != "token-456" {
		t.Errorf("auth headers API_KEY=%q PARTNER_TOKEN=%q want key-123/token-456", cap.APIKey, cap.Token)
	}
	if cap.Body["shop_code"] != "SH-001" || cap.Body["distance_km"] != 12.5 {
		t.Errorf("body=%+v want shop_code/distance_km", cap.Body)
	}
	if len(qs) != 2 {
		t.Fatalf("quotes=%d want 2", len(qs))
	}
	if qs[0].ServiceID != "SGCN" || qs[0].BaseFee != 10000 || qs[0].FeePerKm != 3000 || qs[0].EtaMinutes != 20 {
		t.Errorf("qs[0]=%+v want SGCN wire parse", qs[0])
	}
	if got := qs[1].Fee(12.5); got != 120000+int64(13000*12.5) {
		t.Errorf("qs[1].Fee(12.5)=%d", got)
	}
}

// TestReal_Book — POST /v3/order per item, parse driver info.
func TestReal_Book(t *testing.T) {
	srv, cap := newRealTestServer(t, http.StatusOK,
		`{"_id":"AHM-777","status":"ASSIGNING","driver_name":"Trần Thật","driver_phone":"0987654321","license_plate":"51K-999.99"}`)
	c := NewReal(srv.URL, "k", "t", srv.Client())

	bs, err := c.Book(context.Background(), BookingRequest{ShopCode: "SH-001", Items: []BookingItem{
		{StopOrder: 2, Address: "123 Lê Lợi", DistanceKm: 7.2, CodAmount: 250000},
	}})
	if err != nil {
		t.Fatalf("Book: %v", err)
	}
	if cap.Method != http.MethodPost || cap.Path != "/v3/order" {
		t.Errorf("request %s %s want POST /v3/order", cap.Method, cap.Path)
	}
	items, ok := cap.Body["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("body.items=%+v want 1 item", cap.Body)
	}
	if len(bs) != 1 {
		t.Fatalf("bookings=%d want 1", len(bs))
	}
	b := bs[0]
	if b.CarrierBookingID != "AHM-777" || b.DriverName != "Trần Thật" ||
		b.DriverPhone != "0987654321" || b.LicensePlate != "51K-999.99" || b.Status != "ASSIGNING" {
		t.Errorf("booking=%+v want wire parse AHM-777", b)
	}
}

// TestReal_Cancel — DELETE /v3/order/{id} + reason query.
func TestReal_Cancel(t *testing.T) {
	srv, cap := newRealTestServer(t, http.StatusOK, `{}`)
	c := NewReal(srv.URL, "k", "t", srv.Client())

	if err := c.Cancel(context.Background(), "AHM-777", "shop hủy đơn"); err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if cap.Method != http.MethodDelete || cap.Path != "/v3/order/AHM-777" {
		t.Errorf("request %s %s want DELETE /v3/order/AHM-777", cap.Method, cap.Path)
	}
	if cap.Query == "" {
		t.Error("Cancel phải truyền reason qua query")
	}
}

// TestReal_Detail — GET /v3/order/{id}, parse status + events RFC3339.
func TestReal_Detail(t *testing.T) {
	srv, cap := newRealTestServer(t, http.StatusOK, `{
		"_id":"AHM-777","status":"DELIVERING",
		"events":[
			{"status":"ORDER_CREATED","time":"2026-09-02T08:00:00Z","note":"tạo"},
			{"status":"DELIVERING","time":"2026-09-02T08:05:00Z","note":"đang giao"}
		]}`)
	c := NewReal(srv.URL, "k", "t", srv.Client())

	status, events, err := c.Detail(context.Background(), "AHM-777", time.Now(), false, nil)
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if cap.Method != http.MethodGet || cap.Path != "/v3/order/AHM-777" {
		t.Errorf("request %s %s want GET /v3/order/AHM-777", cap.Method, cap.Path)
	}
	if status != "DELIVERING" {
		t.Errorf("status=%s want DELIVERING", status)
	}
	if len(events) != 2 || events[1].Status != "DELIVERING" {
		t.Fatalf("events=%+v want 2 parsed", events)
	}
	if want := time.Date(2026, 9, 2, 8, 5, 0, 0, time.UTC); !events[1].At.Equal(want) {
		t.Errorf("events[1].At=%v want %v", events[1].At, want)
	}
}

// TestReal_ErrorStatus — non-2xx → error kèm snippet.
func TestReal_ErrorStatus(t *testing.T) {
	srv, _ := newRealTestServer(t, http.StatusUnauthorized, `{"error":"bad token"}`)
	c := NewReal(srv.URL, "k", "t", srv.Client())

	if _, err := c.Quotes(context.Background(), QuoteRequest{}); err == nil {
		t.Fatal("Quotes với 401 phải lỗi")
	}
}
