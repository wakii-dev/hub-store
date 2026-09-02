package server

// SF-27 — hook publish test: capture publisher thay KafkaPublisher thật
// (bufconn fixture như batching_test.go). Verify: chỉ success path publish,
// compensation KHÔNG (side-channel không gắn với rollback).

import (
	"context"
	"testing"

	"hubstore/batching-service/internal/kafka"
	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
)

type captureEvents struct {
	created      []string
	transitioned []string // "code|from|to|reason"
}

func (c *captureEvents) BatchCreated(_ context.Context, batchCode string, _ int) {
	c.created = append(c.created, batchCode)
}

func (c *captureEvents) BatchTransitioned(_ context.Context, batchCode, from, to, reason string) {
	c.transitioned = append(c.transitioned, batchCode+"|"+from+"|"+to+"|"+reason)
}

// Interface assertion — kafka.BatchEventPublisher đã được implement đúng.
var _ kafka.BatchEventPublisher = (*captureEvents)(nil)

func TestEvents_PublishedOnSuccessPaths(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()
	cap := &captureEvents{}
	f.batching.SetEventPublisher(cap)

	cr, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001", "ORD-3002"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	code := cr.GetBatch().GetBatchCode()
	if len(cap.created) != 1 || cap.created[0] != code {
		t.Fatalf("created events = %v, want [%s]", cap.created, code)
	}
	if len(cap.transitioned) != 0 {
		t.Fatalf("transitioned sau create = %v, want rỗng", cap.transitioned)
	}

	// Cancel — active→cancelled kèm reason.
	if _, err := f.client.CancelBatch(ctx, &batchingv1.CancelBatchRequest{
		BatchCode: code, Reason: "khách hủy",
	}); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	// Complete — active→completed, reason rỗng.
	cr2, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3003"},
	})
	if err != nil {
		t.Fatalf("create 2: %v", err)
	}
	if _, err := f.client.CompletePicking(ctx, &batchingv1.CompletePickingRequest{
		BatchCode: cr2.GetBatch().GetBatchCode(),
	}); err != nil {
		t.Fatalf("complete: %v", err)
	}

	want := []string{
		code + "|active|cancelled|khách hủy",
		cr2.GetBatch().GetBatchCode() + "|active|completed|",
	}
	if len(cap.transitioned) != len(want) {
		t.Fatalf("transitioned = %v, want %v", cap.transitioned, want)
	}
	for i, w := range want {
		if cap.transitioned[i] != w {
			t.Fatalf("transitioned[%d] = %s, want %s", i, cap.transitioned[i], w)
		}
	}
}

func TestEvents_NotPublishedOnCompensation(t *testing.T) {
	f := startFixture(t)
	ctx := context.Background()
	cap := &captureEvents{}
	f.batching.SetEventPublisher(cap)

	// Create fail mutate → compensation delete — KHÔNG được publish.
	f.java.FailMutation = true
	if _, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001"},
	}); err == nil {
		t.Fatal("want create fail (FailMutation)")
	}
	if len(cap.created) != 0 || len(cap.transitioned) != 0 {
		t.Fatalf("compensation path KHÔNG được publish: created=%v transitioned=%v",
			cap.created, cap.transitioned)
	}

	// Reject rule 1/4 cũng không publish.
	f.java.FailMutation = false
	if _, err := f.client.CreateBatch(ctx, &batchingv1.CreateBatchRequest{
		FulfillCodes: []string{"ORD-3001", "ORD-3013"}, // mixed shops
	}); err == nil {
		t.Fatal("want rule-1 reject")
	}
	if _, err := f.client.CancelBatch(ctx, &batchingv1.CancelBatchRequest{
		BatchCode: "BATCH-0002", // COMPLETED — rule 4
	}); err == nil {
		t.Fatal("want rule-4 reject")
	}
	if len(cap.created) != 0 || len(cap.transitioned) != 0 {
		t.Fatalf("reject path KHÔNG được publish: created=%v transitioned=%v",
			cap.created, cap.transitioned)
	}
}
