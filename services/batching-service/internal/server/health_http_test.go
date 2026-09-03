package server

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func get(t *testing.T, srv *http.Server) *http.Response {
	t.Helper()
	ts := httptest.NewServer(srv.Handler)
	defer ts.Close()
	res, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	return res
}

func TestHealthHTTPOk(t *testing.T) {
	res := get(t, NewHealthHTTP(fakePinger{}, "0"))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != `{"status":"ok","db":"ok"}`+"\n" {
		t.Fatalf("body = %q", body)
	}
}

func TestHealthHTTPDegraded(t *testing.T) {
	res := get(t, NewHealthHTTP(fakePinger{err: errors.New("db down")}, "0"))
	defer res.Body.Close()
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != `{"status":"degraded","db":"down"}`+"\n" {
		t.Fatalf("body = %q", body)
	}
}
