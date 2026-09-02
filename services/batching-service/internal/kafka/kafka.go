// Package kafka — SF-27 (FI-273) side-channel publisher (best-effort, không
// bao giờ return error hay panic — kafka chết không được chặn nghiệp vụ).
// Envelope canonical: packages/shared/src/events/envelope.ts — KHÔNG đổi json tag.
package kafka

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

type Envelope struct {
	EventID    string                 `json:"eventId"`
	Type       string                 `json:"type"`
	OccurredAt string                 `json:"occurredAt"`
	Source     string                 `json:"source"`
	Payload    map[string]interface{} `json:"payload"`
}

// BatchEventPublisher — hook points trong server; impl không error (best-effort).
type BatchEventPublisher interface {
	BatchCreated(ctx context.Context, batchCode string, itemCount int)
	BatchTransitioned(ctx context.Context, batchCode, from, to, reason string)
}

// NoopPublisher — KAFKA_ENABLED off (mặc định).
type NoopPublisher struct{}

func (NoopPublisher) BatchCreated(context.Context, string, int)                          {}
func (NoopPublisher) BatchTransitioned(context.Context, string, string, string, string)  {}

// KafkaPublisher — singleton writer (main.go tạo 1 lần), hash key để
// per-batchCode ordering.
type KafkaPublisher struct {
	w   *kafka.Writer
	now func() time.Time
}

func NewKafkaPublisher(brokers []string) *KafkaPublisher {
	return &KafkaPublisher{
		w: &kafka.Writer{
			Addr:         kafka.TCP(brokers...),
			Balancer:     &kafka.Hash{},
			BatchTimeout: 50 * time.Millisecond,
		},
		now: time.Now,
	}
}

func (p *KafkaPublisher) Close() error { return p.w.Close() }

// BatchCreated — hook sau CreateBatch success. Type "batch.created",
// key=batchCode (per-batch ordering).
func (p *KafkaPublisher) BatchCreated(ctx context.Context, batchCode string, itemCount int) {
	p.publish(ctx, "batch.created", batchCode, map[string]interface{}{
		"batchCode": batchCode,
		"itemCount": itemCount,
	})
}

// BatchTransitioned — hook sau Cancel/CompletePicking success.
func (p *KafkaPublisher) BatchTransitioned(ctx context.Context, batchCode, from, to, reason string) {
	payload := map[string]interface{}{
		"batchCode": batchCode,
		"from":      from,
		"to":        to,
	}
	if reason != "" {
		payload["reason"] = reason
	}
	p.publish(ctx, "batch.transitioned", batchCode, payload)
}

// buildEnvelope — envelope canonical shape (envelope.ts). Tách riêng để test
// golden không cần broker.
func buildEnvelope(typ string, payload map[string]interface{}, now time.Time) ([]byte, error) {
	return json.Marshal(Envelope{
		EventID:    uuid.NewString(),
		Type:       typ,
		OccurredAt: now.UTC().Format(time.RFC3339),
		Source:     "batching",
		Payload:    payload,
	})
}

func (p *KafkaPublisher) publish(ctx context.Context, typ, key string, payload map[string]interface{}) {
	b, err := buildEnvelope(typ, payload, p.now())
	if err != nil {
		log.Printf("batching-service: kafka marshal %s failed (best-effort): %v", typ, err)
		return
	}
	pctx, cancel := context.WithTimeout(ctx, 2*time.Second) // kafka chết → không treo response
	defer cancel()
	if err := p.w.WriteMessages(pctx, kafka.Message{
		Topic: topicFor(typ),
		Key:   []byte(key),
		Value: b,
	}); err != nil {
		log.Printf("batching-service: kafka publish %s key=%s failed (best-effort): %v", typ, key, err)
	}
}

func topicFor(t string) string {
	if strings.HasPrefix(t, "batch.") {
		return "batch-events"
	}
	return "order-events"
}
