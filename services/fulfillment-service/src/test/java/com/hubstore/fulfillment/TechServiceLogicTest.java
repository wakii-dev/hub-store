package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.TechSeedLoader;
import com.hubstore.fulfillment.seed.TechSeedLoader.TechSeedFile;
import com.hubstore.fulfillment.store.InMemoryTechOrderRepository;
import com.hubstore.fulfillment.store.TechModels;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SF-19 Task 3 — flags matrix + filter/suggest/assign logic trên InMemory repo
 * (seed thật tech-sample.json, pattern FilterAndHydrationTest). 10 test cases
 * theo plan Task 3 Step 4.
 */
class TechServiceLogicTest {

    private TechSeedFile seed;
    private InMemoryTechOrderRepository repo;

    @BeforeEach
    void setUp() {
        seed = TechSeedLoader.load(Path.of("../../api/seed/tech-sample.json"));
        repo = new InMemoryTechOrderRepository(seed);
    }

    // ---------------- helpers ----------------

    private TechModels.DeliveryFilter deliveryFilter(List<String> statuses, String driverName,
        List<String> l1, List<String> l2, String region, String province,
        LocalDate from, LocalDate to) {
        return new TechModels.DeliveryFilter(statuses, driverName, l1, l2, region, province,
                from, to, 1, 100);
    }

    private TechModels.InstallationFilter installationFilter(List<String> statuses, String technicianCode,
        List<String> l1, List<String> l2, String region, String province,
        LocalDate from, LocalDate to) {
        return new TechModels.InstallationFilter(statuses, technicianCode, l1, l2, region, province,
                from, to, 1, 100);
    }

    private TechModels.InstallationOrder inst(String status, String technicianCode) {
        return new TechModels.InstallationOrder("SO-X", "TD-X", technicianCode, status,
                OffsetDateTime.parse("2026-09-02T08:00:00+07:00"), "[]", 0, 0,
                List.of(), "R1", "TP. Hồ Chí Minh", null);
    }

    /** Expected matrix (spec §5): cancel, assign, reassign, accept, resched. */
    private record Row(String status, boolean cancel, boolean assign,
                       boolean reassign, boolean accept, boolean resched) {
    }

    // ---------------- 10 test cases (plan Task 3 Step 4) ----------------

    @Test
    void filterDelivery_noDates_defaultsToToday() {
        TechModels.DeliveryPage noDates = repo.filterDelivery(
                deliveryFilter(List.of(), null, List.of(), List.of(), null, null, null, null));
        // Seed: 9 đơn TODAY + 1 đơn TODAY-1 → mặc định chỉ thấy 9 đơn hôm nay.
        assertThat(noDates.total()).isEqualTo(9);
        assertThat(noDates.items()).allSatisfy(
                o -> assertThat(o.deliveryDate()).isEqualTo(LocalDate.now()));
        // Relative assertion: cùng count khi filter tường minh from=to=today.
        TechModels.DeliveryPage explicit = repo.filterDelivery(deliveryFilter(
                List.of(), null, List.of(), List.of(), null, null, LocalDate.now(), LocalDate.now()));
        assertThat(explicit.total()).isEqualTo(noDates.total());
        assertThat(explicit.items()).extracting(TechModels.DeliveryOrder::code)
                .containsExactlyElementsOf(noDates.items().stream()
                        .map(TechModels.DeliveryOrder::code).toList());
    }

    @Test
    void filterDelivery_oneSidedDateFrom_only() {
        // Review P1: dateFrom-only không được NPE — from=today loại TODAY-1 → 9 đơn.
        TechModels.DeliveryPage resp = repo.filterDelivery(deliveryFilter(
                List.of(), null, List.of(), List.of(), null, null, LocalDate.now(), null));
        assertThat(resp.total()).isEqualTo(9);
        assertThat(resp.items()).allSatisfy(
                o -> assertThat(o.deliveryDate()).isEqualTo(LocalDate.now()));
    }

    @Test
    void filterDelivery_oneSidedDateTo_only() {
        // dateTo-only: to=today bao cả TODAY-1 → đủ 10 đơn (parity Postgres one-sided).
        TechModels.DeliveryPage resp = repo.filterDelivery(deliveryFilter(
                List.of(), null, List.of(), List.of(), null, null, null, LocalDate.now()));
        assertThat(resp.total()).isEqualTo(10);
    }

    @Test
    void filterDelivery_byStatus_and_dateRange() {
        TechModels.DeliveryPage resp = repo.filterDelivery(deliveryFilter(
                List.of("SHIPPING"), null, List.of(), List.of(), null, null,
                LocalDate.now(), LocalDate.now()));
        assertThat(resp.total()).isEqualTo(1);
        assertThat(resp.items()).extracting(TechModels.DeliveryOrder::code)
                .containsExactly("TD-0004");
        assertThat(resp.items()).allSatisfy(o -> assertThat(o.status()).isEqualTo("SHIPPING"));
    }

    @Test
    void filterDelivery_categoryL2_jsonb() {
        TechModels.DeliveryPage resp = repo.filterDelivery(deliveryFilter(
                List.of(), null, List.of(), List.of("Máy giặt"), null, null,
                LocalDate.now(), LocalDate.now()));
        assertThat(resp.total()).isEqualTo(3);
        assertThat(resp.items()).extracting(TechModels.DeliveryOrder::code)
                .containsExactlyInAnyOrder("TD-0001", "TD-0004", "TD-0007");
    }

    @Test
    void filterInstallation_byTechnician_and_nullExpectedTime_excluded() {
        TechModels.InstallationPage byTech = repo.filterInstallation(installationFilter(
                List.of(), "KTV-001", List.of(), List.of(), null, null, null, null));
        assertThat(byTech.total()).isEqualTo(1);
        assertThat(byTech.items()).extracting(TechModels.InstallationOrder::serviceOrderCode)
                .containsExactly("SO-0004");
        // Date filter trên expectedTime::date — đơn SO-0003 expectedTime NULL bị loại.
        LocalDate d = LocalDate.parse("2026-09-02");
        TechModels.InstallationPage dated = repo.filterInstallation(installationFilter(
                List.of(), null, List.of(), List.of(), null, null, d, d));
        assertThat(dated.total()).isEqualTo(7);
        assertThat(dated.items()).noneMatch(o -> o.serviceOrderCode().equals("SO-0003"));
    }

    @Test
    void installationButtons_matrix() {
        // Chưa assign — matrix spec §5.
        List<Row> unassigned = List.of(
                new Row("NEW", true, true, false, false, true),
                new Row("CONFIRMED", true, true, false, false, true),
                new Row("PROCESSING", true, false, false, false, false),
                new Row("SHIPPING", false, false, false, false, false),
                new Row("DELIVERED", false, false, false, false, false),
                new Row("FAILED", false, false, false, false, false),
                new Row("REDELIVERY", true, true, false, false, true),
                new Row("RESCHEDULED", true, true, false, false, true),
                new Row("CANCELLED", false, false, false, false, false),
                new Row("RETURNED", false, false, false, false, false));
        for (Row r : unassigned) {
            TechModels.TechButtons b = TechModels.installationButtons(inst(r.status(), null));
            assertThat(b.allowCancel()).as("cancel " + r.status()).isEqualTo(r.cancel());
            assertThat(b.allowAssign()).as("assign " + r.status()).isEqualTo(r.assign());
            assertThat(b.allowReassign()).as("reassign " + r.status()).isEqualTo(r.reassign());
            assertThat(b.allowAccept()).as("accept " + r.status()).isEqualTo(r.accept());
            assertThat(b.allowReschedule()).as("resched " + r.status()).isEqualTo(r.resched());
        }
        // Đã assign — assign luôn false; reassign/accept theo trạng thái.
        List<Row> assigned = List.of(
                new Row("NEW", true, false, false, false, true),
                new Row("CONFIRMED", true, false, true, true, true),
                new Row("PROCESSING", true, false, true, false, false),
                new Row("SHIPPING", false, false, false, false, false),
                new Row("DELIVERED", false, false, false, false, false),
                new Row("FAILED", false, false, false, false, false),
                new Row("REDELIVERY", true, false, true, false, true),
                new Row("RESCHEDULED", true, false, true, false, true),
                new Row("CANCELLED", false, false, false, false, false),
                new Row("RETURNED", false, false, false, false, false));
        for (Row r : assigned) {
            TechModels.TechButtons b = TechModels.installationButtons(inst(r.status(), "KTV-001"));
            assertThat(b.allowCancel()).as("assigned cancel " + r.status()).isEqualTo(r.cancel());
            assertThat(b.allowAssign()).as("assigned assign " + r.status()).isEqualTo(r.assign());
            assertThat(b.allowReassign()).as("assigned reassign " + r.status()).isEqualTo(r.reassign());
            assertThat(b.allowAccept()).as("assigned accept " + r.status()).isEqualTo(r.accept());
            assertThat(b.allowReschedule()).as("assigned resched " + r.status()).isEqualTo(r.resched());
        }
    }

    @Test
    void deliveryButtons_noAssignFlags() {
        for (String status : List.of("NEW", "CONFIRMED", "PROCESSING", "SHIPPING",
                "DELIVERED", "FAILED", "REDELIVERY", "RESCHEDULED", "CANCELLED", "RETURNED")) {
            TechModels.DeliveryOrder o = new TechModels.DeliveryOrder("TD-X", status, null, null,
                    null, null, 0, 0, List.of(), "R1", "TP. Hồ Chí Minh", "{}",
                    LocalDate.now(), null);
            TechModels.TechButtons b = TechModels.deliveryButtons(o);
            assertThat(b.allowAssign()).as("delivery assign " + status).isFalse();
            assertThat(b.allowReassign()).as("delivery reassign " + status).isFalse();
            assertThat(b.allowAccept()).as("delivery accept " + status).isFalse();
            // Cancel/resched: NEW cancel+resched; PROCESSING chỉ cancel; DELIVERED không gì.
            if (status.equals("NEW")) {
                assertThat(b.allowCancel()).isTrue();
                assertThat(b.allowReschedule()).isTrue();
            } else if (status.equals("PROCESSING")) {
                assertThat(b.allowCancel()).isTrue();
                assertThat(b.allowReschedule()).isFalse();
            } else if (status.equals("DELIVERED")) {
                assertThat(b.allowCancel()).isFalse();
                assertThat(b.allowReschedule()).isFalse();
            }
        }
    }

    @Test
    void assignTechnician_first_time_history_from_null() {
        TechModels.InstallationOrder updated = repo.assignTechnician(
                "SO-0001", "KTV-001", "tester", Instant.now());
        assertThat(updated.technicianCode()).isEqualTo("KTV-001");
        List<TechModels.AssignmentHistoryEntry> history = repo.assignmentHistory("SO-0001");
        assertThat(history).hasSize(1);
        assertThat(history.get(0).fromTechnicianCode()).isNull();
        assertThat(history.get(0).toTechnicianCode()).isEqualTo("KTV-001");
        assertThat(history.get(0).serviceOrderCode()).isEqualTo("SO-0001");
    }

    @Test
    void assignTechnician_reassign_history_from_to() {
        repo.assignTechnician("SO-0002", "KTV-001", "tester", Instant.now());
        TechModels.InstallationOrder updated = repo.assignTechnician(
                "SO-0002", "KTV-002", "tester", Instant.now());
        assertThat(updated.technicianCode()).isEqualTo("KTV-002");
        List<TechModels.AssignmentHistoryEntry> history = repo.assignmentHistory("SO-0002");
        assertThat(history).hasSize(2);
        assertThat(history.get(0).fromTechnicianCode()).isNull();
        assertThat(history.get(0).toTechnicianCode()).isEqualTo("KTV-001");
        assertThat(history.get(1).fromTechnicianCode()).isEqualTo("KTV-001");
        assertThat(history.get(1).toTechnicianCode()).isEqualTo("KTV-002");
    }

    @Test
    void assignTechnician_wrong_status_throws() {
        // SO-0006 status DELIVERED — không assign được.
        assertThatThrownBy(() -> repo.assignTechnician("SO-0006", "KTV-001", "tester", Instant.now()))
                .isInstanceOf(IllegalStateException.class);
        // State không đổi.
        assertThat(repo.findInstallation("SO-0006").orElseThrow().technicianCode())
                .isEqualTo("KTV-003");
        assertThat(repo.assignmentHistory("SO-0006")).isEmpty();
    }

    @Test
    void suggest_by_region_workload_asc() {
        // R1: KTV-001 (SO-0004 PROCESSING → 1 active), KTV-002 (SO-0005 SHIPPING → 1),
        // KTV-003 (SO-0006 DELIVERED → excluded → 0), KTV-004 (không đơn → 0).
        List<TechModels.SuggestedTechnician> r1 = repo.suggestTechnicians("R1");
        assertThat(r1).extracting(s -> s.technician().code())
                .containsExactly("KTV-003", "KTV-004", "KTV-001", "KTV-002");
        assertThat(r1).extracting(TechModels.SuggestedTechnician::activeCount)
                .containsExactly(0, 0, 1, 1);
        // R2: CTV-001 (SO-0007 FAILED → 1 active), CTV-002 (SO-0008 REDELIVERY → 1);
        // tie activeCount → giữ list order (seq proxy).
        List<TechModels.SuggestedTechnician> r2 = repo.suggestTechnicians("R2");
        assertThat(r2).extracting(s -> s.technician().code())
                .containsExactly("CTV-001", "CTV-002");
        assertThat(r2).extracting(TechModels.SuggestedTechnician::activeCount)
                .containsExactly(1, 1);
    }
}
