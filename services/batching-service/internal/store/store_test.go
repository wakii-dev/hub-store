package store

import (
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
	// seed thiếu trạng thái phải fail lúc boot (validate contract).
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
