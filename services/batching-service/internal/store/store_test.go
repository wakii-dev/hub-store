package store

import (
	"os"
	"path/filepath"
	"testing"

	batchingv1 "hubstore/gen/go/hubstore/batching/v1"
)

const seedPath = "../../../../api/seed/canonical-seed.json"

// Contract (context pack spec slice §2): seed loaded lúc boot — phiếu đủ 3
// trạng thái, items[].orderCode trỏ đúng orders seed.
func TestLoadSeedFile(t *testing.T) {
	s, err := LoadSeedFile(seedPath)
	if err != nil {
		t.Fatalf("LoadSeedFile: %v", err)
	}
	all := s.List()
	if len(all) != 7 {
		t.Fatalf("expected 7 seeded batches, got %d", len(all))
	}
	counts := map[batchingv1.BatchEntityStatus]int{}
	for _, b := range all {
		counts[b.GetStatus()]++
		for _, it := range b.GetItems() {
			if it.GetBatchCode() != b.GetBatchCode() {
				t.Errorf("item %s batchCode mismatch: %s", it.GetOrderCode(), it.GetBatchCode())
			}
		}
	}
	for st, want := range map[batchingv1.BatchEntityStatus]int{
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE:    3,
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED: 3,
		batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED: 1,
	} {
		if counts[st] != want {
			t.Errorf("status %s: got %d, want %d", st, counts[st], want)
		}
	}
}

func TestLoadSeedFile_MissingStatus(t *testing.T) {
	// Seed thiếu 1 trạng thái phải fail lúc boot (validate contract thật).
	missing := []byte(`{
		"orders": [{"fulfillCode":"ORD-1","orderCode":"RSA-1","batchStatus":0}],
		"batches": [
			{"batchCode":"BATCH-0001","shopCode":"30201","shipperId":"S","deliveryTime":{"from":"","to":""},"status":0,"items":[],"createdAt":"2026-09-01T00:00:00+07:00"},
			{"batchCode":"BATCH-0002","shopCode":"30201","shipperId":"S","deliveryTime":{"from":"","to":""},"status":1,"items":[],"createdAt":"2026-09-01T00:00:00+07:00"}
		]
	}`)
	path := filepath.Join(t.TempDir(), "seed.json")
	if err := os.WriteFile(path, missing, 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := LoadSeedFile(path)
	if err == nil {
		t.Fatal("expected error: seed missing CANCELLED status")
	}
	// Seed item orderCode không có trong orders cũng phải fail.
	bad := []byte(`{
		"orders": [{"fulfillCode":"ORD-1","orderCode":"RSA-1","batchStatus":0}],
		"batches": [
			{"batchCode":"BATCH-0001","shopCode":"30201","shipperId":"S","deliveryTime":{"from":"","to":""},"status":0,"items":[],"createdAt":"2026-09-01T00:00:00+07:00"},
			{"batchCode":"BATCH-0002","shopCode":"30201","shipperId":"S","deliveryTime":{"from":"","to":""},"status":1,"items":[],"createdAt":"2026-09-01T00:00:00+07:00"},
			{"batchCode":"BATCH-0003","shopCode":"30201","shipperId":"S","deliveryTime":{"from":"","to":""},"status":2,"items":[{"batchCode":"BATCH-0003","stopOrder":1,"orderCode":"RSA-404","customerAddress":"","distance":0,"fromDeliveryTime":"","toDeliveryTime":"","orderStatus":1,"orderType":1,"items":[],"totalQuantity":1,"codAmount":0}],"createdAt":"2026-09-01T00:00:00+07:00"}
		]
	}`)
	path = filepath.Join(t.TempDir(), "seed2.json")
	if err := os.WriteFile(path, bad, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadSeedFile(path); err == nil {
		t.Fatal("expected error: item orderCode not in orders seed")
	}
	// Non-JSON vẫn error.
	if _, err := LoadSeedFile("../../../api/proto/buf.yaml"); err == nil {
		t.Fatal("expected error for non-seed file")
	}
}

func TestNextBatchCode(t *testing.T) {
	s, err := LoadSeedFile(seedPath)
	if err != nil {
		t.Fatalf("LoadSeedFile: %v", err)
	}
	if got := s.NextBatchCode(); got != "BATCH-0008" {
		t.Fatalf("NextBatchCode = %s, want BATCH-0008", got)
	}
	s.Put(newBatch("BATCH-0042"))
	if got := s.NextBatchCode(); got != "BATCH-0043" {
		t.Fatalf("NextBatchCode after 0042 = %s, want BATCH-0043", got)
	}
}

func newBatch(code string) *batchingv1.Batch {
	return &batchingv1.Batch{
		BatchCode: code,
		Status:    batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE,
	}
}

func TestGetDelete(t *testing.T) {
	s := New()
	s.Put(newBatch("B-1"))
	if s.Get("B-1") == nil {
		t.Fatal("Get(B-1) nil")
	}
	// returned copy must not alias store state
	g := s.Get("B-1")
	g.Status = batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED
	if s.Get("B-1").GetStatus() == batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED {
		t.Fatal("Get returned alias, want copy")
	}
	s.Delete("B-1")
	if s.Get("B-1") != nil {
		t.Fatal("Delete failed")
	}
}

// P1 fix verify — CreateWithNextCode atomic + Transition CAS.
func TestCreateWithNextCode_Atomic(t *testing.T) {
	s, err := LoadSeedFile(seedPath)
	if err != nil {
		t.Fatalf("LoadSeedFile: %v", err)
	}
	b, ok := s.CreateWithNextCode(func(code string) *batchingv1.Batch {
		return newBatch(code)
	})
	if !ok || b.GetBatchCode() != "BATCH-0008" {
		t.Fatalf("create = %s ok=%v, want BATCH-0008", b.GetBatchCode(), ok)
	}
	b2, ok := s.CreateWithNextCode(func(code string) *batchingv1.Batch {
		return newBatch(code)
	})
	if !ok || b2.GetBatchCode() != "BATCH-0009" {
		t.Fatalf("second create = %s, want BATCH-0009", b2.GetBatchCode())
	}
}

func TestTransition_CAS(t *testing.T) {
	s := New()
	s.Put(newBatch("B-1"))
	// sai from → nil, không đổi.
	if s.Transition("B-1", batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_COMPLETED, batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED) != nil {
		t.Fatal("transition with wrong from must fail")
	}
	if s.Get("B-1").GetStatus() != batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE {
		t.Fatal("status must be unchanged")
	}
	if got := s.Transition("B-1", batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE, batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED); got == nil {
		t.Fatal("valid transition must succeed")
	}
	if s.Transition("B-404", batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_ACTIVE, batchingv1.BatchEntityStatus_BATCH_ENTITY_STATUS_CANCELLED) != nil {
		t.Fatal("unknown code must fail")
	}
}
