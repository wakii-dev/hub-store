package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.store.AuditEntry;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.OrderFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SF-13 intake — repo layer (plan Task 3): codegen tiếp dải seed max,
 * insertOrders visible trong filter, markFailed chain + chặn double-fail,
 * hasRetry (oldFulfillCode), findByExactFulfillCode (chỉ match fulfill_code),
 * audit append/get theo target.
 */
class IntakeRepositoryTest {

    private SeedModels.SeedFile seed;
    private InMemoryOrderRepository repo;

    @BeforeEach
    void setUp() {
        seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        repo = new InMemoryOrderRepository(seed);
    }

    // ---------------- helpers ----------------

    /** Đơn intake mới — 7 field SF-13: oldFulfillCode truyền vào, còn lại null. */
    private SeedModels.OrderSeed intakeOrder(String fulfillCode, String oldFulfillCode) {
        return new SeedModels.OrderSeed(
                fulfillCode, "RSA-INTAKE-1", 0, 0, null, null, null, null, 0,
                List.of(), 0, 0, false, null, null, null, List.of(),
                "Nguyễn Văn A", "0901234567", oldFulfillCode,
                null, null, null, null);
    }

    // ---------------- nextFulfillCodes ----------------

    @Test
    void codegenContinuesFromSeedMax() {
        // Seed có ORD-3001..3027 → next là 3028, 3029.
        assertThat(repo.nextFulfillCodes(2)).containsExactly("ORD-3028", "ORD-3029");
    }

    @Test
    void codegenSeesInsertedOrders() {
        String code = repo.nextFulfillCodes(1).get(0);
        repo.insertOrders(List.of(intakeOrder(code, null)));
        // Sau insert, codegen tiếp từ max mới (không sinh trùng).
        assertThat(repo.nextFulfillCodes(1)).containsExactly("ORD-3029");
    }

    // ---------------- insertOrders ----------------

    @Test
    void insertedOrdersVisibleInFilter() {
        List<String> codes = repo.nextFulfillCodes(2);
        List<SeedModels.OrderSeed> inserted = repo.insertOrders(List.of(
                intakeOrder(codes.get(0), null), intakeOrder(codes.get(1), null)));
        assertThat(inserted).hasSize(2);

        var result = repo.filter(new OrderFilter(
                "ORD-3028", Set.of(), null, Set.of(), Set.of(), Set.of(),
                null, null, Set.of(), 1, 100));
        assertThat(result.total()).isEqualTo(1);
        assertThat(result.items().get(0).fulfillCode()).isEqualTo("ORD-3028");
        assertThat(result.items().get(0).customerName()).isEqualTo("Nguyễn Văn A");
        assertThat(result.items().get(0).customerPhone()).isEqualTo("0901234567");
    }

    // ---------------- markFailed ----------------

    @Test
    void markFailedSetsFailFields() {
        Instant at = Instant.parse("2026-09-02T10:00:00Z");
        SeedModels.OrderSeed failed = repo.markFailed("ORD-3001", "ADDRESS_WRONG", "Sai địa chỉ", at);

        assertThat(failed.failReason()).isEqualTo("ADDRESS_WRONG");
        assertThat(failed.failNote()).isEqualTo("Sai địa chỉ");
        assertThat(failed.failedAt()).isEqualTo(at);

        SeedModels.OrderSeed stored = repo.findByExactFulfillCode("ORD-3001").orElseThrow();
        assertThat(stored.failReason()).isEqualTo("ADDRESS_WRONG");
        assertThat(stored.failedAt()).isEqualTo(at);
        // Phần còn lại giữ nguyên.
        assertThat(stored.orderCode()).isEqualTo("RSA-700101");
    }

    @Test
    void markFailedTwiceOnFailedOrderThrows() {
        repo.markFailed("ORD-3001", "ADDRESS_WRONG", null, Instant.now());
        assertThatThrownBy(() -> repo.markFailed("ORD-3001", "OTHER", null, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
        // State không đổi sau lần throw.
        assertThat(repo.findByExactFulfillCode("ORD-3001").orElseThrow().failReason())
                .isEqualTo("ADDRESS_WRONG");
    }

    @Test
    void markFailedUnknownCodeThrows() {
        assertThatThrownBy(() -> repo.markFailed("ORD-KHONG-TON-TAI", "OTHER", null, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ---------------- hasRetry / findByExactFulfillCode ----------------

    @Test
    void hasRetryTrueAfterInsertingRetryOrder() {
        assertThat(repo.hasRetry("ORD-3001")).isFalse();

        repo.insertOrders(List.of(intakeOrder("ORD-9001", "ORD-3001")));
        assertThat(repo.hasRetry("ORD-3001")).isTrue();
        assertThat(repo.hasRetry("ORD-3002")).isFalse();
    }

    @Test
    void findByExactFulfillCodeMatchesFulfillCodeOnly() {
        // findByFulfillCode dual-match orderCode (RSA); exact match chỉ ORD-*.
        assertThat(repo.findByExactFulfillCode("RSA-700101")).isEmpty();
        assertThat(repo.findByExactFulfillCode("ORD-3001")).isPresent();

        repo.insertOrders(List.of(intakeOrder("ORD-9001", "ORD-3001")));
        assertThat(repo.findByExactFulfillCode("ORD-9001").orElseThrow().oldFulfillCode())
                .isEqualTo("ORD-3001");
    }

    // ---------------- audit ----------------

    @Test
    void auditAppendAndGetByTarget() {
        repo.appendAudit("system", "INTAKE_INSERT", "ORD-3001", "{\"count\":1}");
        repo.appendAudit("admin", "MARK_FAIL", "ORD-3001", "{\"reason\":\"ADDRESS_WRONG\"}");
        repo.appendAudit("system", "INTAKE_INSERT", "ORD-3002", "{\"count\":1}");

        List<AuditEntry> of3001 = repo.getAudit("ORD-3001");
        assertThat(of3001).hasSize(2);
        assertThat(of3001.get(0).action()).isEqualTo("INTAKE_INSERT");
        assertThat(of3001.get(0).actor()).isEqualTo("system");
        assertThat(of3001.get(0).detailJson()).isEqualTo("{\"count\":1}");
        assertThat(of3001.get(0).createdAt()).isNotNull();
        assertThat(of3001.get(1).action()).isEqualTo("MARK_FAIL");

        assertThat(repo.getAudit("ORD-3002")).hasSize(1);
        assertThat(repo.getAudit("ORD-KHONG-CO")).isEmpty();
    }
}
