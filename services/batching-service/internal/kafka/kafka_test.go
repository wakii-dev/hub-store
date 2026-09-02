package kafka

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"
)

// TestEnvelopeGolden — envelope JSON khớp canonical shape
// (packages/shared/src/events/envelope.ts): đúng tên field camelCase,
// occurredAt RFC3339 UTC, source "batching".
func TestEnvelopeGolden(t *testing.T) {
	now := time.Date(2026, 9, 2, 10, 0, 0, 0, time.UTC)
	b, err := buildEnvelope("batch.created", map[string]interface{}{
		"batchCode": "B-2026-0001",
		"itemCount": 3,
	}, now)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got map[string]interface{}
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	want := map[string]interface{}{
		"eventId":    got["eventId"], // uuid — chỉ check present
		"type":       "batch.created",
		"occurredAt": "2026-09-02T10:00:00Z",
		"source":     "batching",
		"payload": map[string]interface{}{
			"batchCode": "B-2026-0001",
			"itemCount": float64(3),
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("envelope mismatch:\n got  %#v\n want %#v", got, want)
	}
	if got["eventId"] == "" {
		t.Fatal("eventId must be present (uuid)")
	}

	// Field order canonical: eventId, type, occurredAt, source, payload.
	s := string(b)
	if i, j := strings.Index(s, "eventId"), strings.Index(s, "type"); i > j {
		t.Fatalf("field order: eventId must precede type: %s", s)
	}
	if i, j := strings.Index(s, "occurredAt"), strings.Index(s, "source"); i > j {
		t.Fatalf("field order: occurredAt must precede source: %s", s)
	}
}

// TestTopicFor — order.* → order-events, batch.* → batch-events, lạ → order-events.
func TestTopicFor(t *testing.T) {
	cases := map[string]string{
		"batch.created":      "batch-events",
		"batch.cancelled":    "batch-events",
		"batch.completed":    "batch-events",
		"batch.transitioned": "batch-events",
		"order.assigned":     "order-events",
		"order.cancelled":    "order-events",
		"something.else":     "order-events",
	}
	for typ, want := range cases {
		if got := topicFor(typ); got != want {
			t.Errorf("topicFor(%q) = %q, want %q", typ, got, want)
		}
	}
}

// capturePublisher — test double (kỹ thuật SetClock, dùng cho server hook test).
type capturePublisher struct {
	created      []string
	transitioned []string // "code|from|to|reason"
}

func (c *capturePublisher) BatchCreated(_ context.Context, batchCode string, itemCount int) {
	c.created = append(c.created, batchCode)
	_ = itemCount
}

func (c *capturePublisher) BatchTransitioned(_ context.Context, batchCode, from, to, reason string) {
	c.transitioned = append(c.transitioned, batchCode+"|"+from+"|"+to+"|"+reason)
}
