package com.hubstore.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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

    /** Expected matrix (spec §5 + SF-25 §4.2): cancel, assign, reassign, accept, resched, complete. */
    private record Row(String status, boolean cancel, boolean assign,
                       boolean reassign, boolean accept, boolean resched, boolean complete) {
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
        // SF-25 seed: KTV-001 có SO-0004 (PROCESSING) + SO-0006 (CONFIRMED).
        assertThat(byTech.total()).isEqualTo(2);
        assertThat(byTech.items()).extracting(TechModels.InstallationOrder::serviceOrderCode)
                .containsExactly("SO-0004", "SO-0006");
        // Date filter trên expectedTime::date — đơn SO-0003 expectedTime NULL bị loại.
        LocalDate d = LocalDate.now(); // seed TODAY@HH:MM → expectedTime = hôm nay
        TechModels.InstallationPage dated = repo.filterInstallation(installationFilter(
                List.of(), null, List.of(), List.of(), null, null, d, d));
        assertThat(dated.total()).isEqualTo(7);
        assertThat(dated.items()).noneMatch(o -> o.serviceOrderCode().equals("SO-0003"));
    }

    @Test
    void installationButtons_matrix() {
        // Chưa assign — matrix spec §5 (SF-25: resched +PROCESSING, complete mới).
        List<Row> unassigned = List.of(
                new Row("NEW", true, true, false, false, true, false),
                new Row("CONFIRMED", true, true, false, false, true, false),
                new Row("PROCESSING", true, false, false, false, true, false),
                new Row("SHIPPING", false, false, false, false, false, false),
                new Row("DELIVERED", false, false, false, false, false, false),
                new Row("FAILED", false, false, false, false, false, false),
                new Row("REDELIVERY", true, true, false, false, true, false),
                new Row("RESCHEDULED", true, true, false, false, true, false),
                new Row("CANCELLED", false, false, false, false, false, false),
                new Row("RETURNED", false, false, false, false, false, false));
        for (Row r : unassigned) {
            TechModels.TechButtons b = TechModels.installationButtons(inst(r.status(), null));
            assertThat(b.allowCancel()).as("cancel " + r.status()).isEqualTo(r.cancel());
            assertThat(b.allowAssign()).as("assign " + r.status()).isEqualTo(r.assign());
            assertThat(b.allowReassign()).as("reassign " + r.status()).isEqualTo(r.reassign());
            assertThat(b.allowAccept()).as("accept " + r.status()).isEqualTo(r.accept());
            assertThat(b.allowReschedule()).as("resched " + r.status()).isEqualTo(r.resched());
            assertThat(b.allowComplete()).as("complete " + r.status()).isEqualTo(r.complete());
        }
        // Đã assign — assign luôn false; reassign/accept/complete theo trạng thái.
        List<Row> assigned = List.of(
                new Row("NEW", true, false, false, false, true, false),
                new Row("CONFIRMED", true, false, true, true, true, false),
                new Row("PROCESSING", true, false, true, false, true, true),
                new Row("SHIPPING", false, false, false, false, false, false),
                new Row("DELIVERED", false, false, false, false, false, false),
                new Row("FAILED", false, false, false, false, false, false),
                new Row("REDELIVERY", true, false, true, false, true, false),
                new Row("RESCHEDULED", true, false, true, true, true, false),
                new Row("CANCELLED", false, false, false, false, false, false),
                new Row("RETURNED", false, false, false, false, false, false));
        for (Row r : assigned) {
            TechModels.TechButtons b = TechModels.installationButtons(inst(r.status(), "KTV-001"));
            assertThat(b.allowCancel()).as("assigned cancel " + r.status()).isEqualTo(r.cancel());
            assertThat(b.allowAssign()).as("assigned assign " + r.status()).isEqualTo(r.assign());
            assertThat(b.allowReassign()).as("assigned reassign " + r.status()).isEqualTo(r.reassign());
            assertThat(b.allowAccept()).as("assigned accept " + r.status()).isEqualTo(r.accept());
            assertThat(b.allowReschedule()).as("assigned resched " + r.status()).isEqualTo(r.resched());
            assertThat(b.allowComplete()).as("assigned complete " + r.status()).isEqualTo(r.complete());
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
            assertThat(b.allowComplete()).as("delivery complete " + status).isFalse();
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
        // SO-0005 status SHIPPING — không assign được.
        assertThatThrownBy(() -> repo.assignTechnician("SO-0005", "KTV-001", "tester", Instant.now()))
                .isInstanceOf(IllegalStateException.class);
        // State không đổi.
        assertThat(repo.findInstallation("SO-0005").orElseThrow().technicianCode())
                .isEqualTo("KTV-002");
        assertThat(repo.assignmentHistory("SO-0005")).isEmpty();
    }

    // ---------------- SF-25 mutations (accept/complete/reschedule) ----------------

    @Test
    void acceptInstallation_confirmed_toProcessing_timelineAppended() {
        TechModels.InstallationOrder updated = repo.acceptInstallation(
                "SO-0006", "KTV-001", OffsetDateTime.now(ZoneOffset.of("+07:00")));
        assertThat(updated.status()).isEqualTo("PROCESSING");
        // Timeline append schema seed {at,status,note,actor} — note "KTV nhận việc".
        JsonNode timeline = readTimeline(updated.timelineJson());
        assertThat(timeline).hasSize(3);
        assertThat(timeline.get(2).get("status").asText()).isEqualTo("PROCESSING");
        assertThat(timeline.get(2).get("note").asText()).isEqualTo("KTV nhận việc");
        assertThat(timeline.get(2).get("actor").asText()).isEqualTo("KTV-001");
        assertThat(timeline.get(2).get("at").asText()).isNotBlank();
    }

    @Test
    void acceptInstallation_wrongStatus_or_notOwner_throws() {
        // SO-0004 PROCESSING — accept chỉ từ CONFIRMED|RESCHEDULED.
        assertThatThrownBy(() -> repo.acceptInstallation("SO-0004", "KTV-001",
                OffsetDateTime.now())).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PROCESSING");
        // SO-0006 thuộc KTV-001 — KTV-002 không nhận được.
        assertThatThrownBy(() -> repo.acceptInstallation("SO-0006", "KTV-002",
                OffsetDateTime.now())).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("không thuộc");
        // State không đổi.
        assertThat(repo.findInstallation("SO-0006").orElseThrow().status()).isEqualTo("CONFIRMED");
    }

    @Test
    void completeInstallation_processing_toDelivered_timelineAppended() {
        TechModels.InstallationOrder updated = repo.completeInstallation(
                "SO-0004", "KTV-001", OffsetDateTime.now(ZoneOffset.of("+07:00")));
        assertThat(updated.status()).isEqualTo("DELIVERED");
        JsonNode timeline = readTimeline(updated.timelineJson());
        assertThat(timeline.get(timeline.size() - 1).get("status").asText()).isEqualTo("DELIVERED");
        assertThat(timeline.get(timeline.size() - 1).get("note").asText()).isEqualTo("Hoàn tất lắp đặt");
        assertThat(timeline.get(timeline.size() - 1).get("actor").asText()).isEqualTo("KTV-001");
        // Complete lần nữa → ISE (DELIVERED terminal).
        assertThatThrownBy(() -> repo.completeInstallation("SO-0004", "KTV-001",
                OffsetDateTime.now())).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rescheduleInstallation_processing_allowed_setsExpectedTimeAndNote() {
        // SF-25 matrix mở rộng: PROCESSING reschedulable.
        OffsetDateTime newTime = OffsetDateTime.now(ZoneOffset.of("+07:00")).plusHours(3)
                .truncatedTo(ChronoUnit.MINUTES);
        TechModels.InstallationOrder updated = repo.rescheduleInstallation(
                "SO-0004", "KTV-001", newTime, "Khách xin dời chiều", OffsetDateTime.now(ZoneOffset.of("+07:00")));
        assertThat(updated.status()).isEqualTo("RESCHEDULED");
        assertThat(updated.expectedTime()).isEqualTo(newTime);
        JsonNode timeline = readTimeline(updated.timelineJson());
        JsonNode last = timeline.get(timeline.size() - 1);
        assertThat(last.get("status").asText()).isEqualTo("RESCHEDULED");
        assertThat(last.get("note").asText()).isEqualTo("Khách xin dời chiều");
        assertThat(last.get("actor").asText()).isEqualTo("KTV-001");
        // Sau reschedule → accept lại được (dead-end fix, spec §4.2).
        assertThat(TechModels.installationButtons(updated).allowAccept()).isTrue();
    }

    @Test
    void rescheduleInstallation_notOwner_or_terminal_throws() {
        // SO-0001 chưa assign (technicianCode null) — không ai reschedule hộ được.
        assertThatThrownBy(() -> repo.rescheduleInstallation("SO-0001", "KTV-001",
                OffsetDateTime.now().plusHours(1), "x", OffsetDateTime.now()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("không thuộc");
        // SO-0005 SHIPPING không trong allow-set.
        assertThatThrownBy(() -> repo.rescheduleInstallation("SO-0005", "KTV-002",
                OffsetDateTime.now().plusHours(1), "x", OffsetDateTime.now()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SHIPPING");
    }

    @Test
    void suggest_by_region_workload_asc() {
        // R1: KTV-001 (SO-0004 PROCESSING + SO-0006 CONFIRMED → 2 active),
        // KTV-002 (SO-0005 SHIPPING → 1), KTV-003/KTV-004 (không đơn → 0).
        List<TechModels.SuggestedTechnician> r1 = repo.suggestTechnicians("R1");
        assertThat(r1).extracting(s -> s.technician().code())
                .containsExactly("KTV-003", "KTV-004", "KTV-002", "KTV-001");
        assertThat(r1).extracting(TechModels.SuggestedTechnician::activeCount)
                .containsExactly(0, 0, 1, 2);
        // R2: CTV-001 (SO-0007 CONFIRMED → 1 active), CTV-002 (SO-0008 REDELIVERY → 1);
        // tie activeCount → giữ list order (seq proxy).
        List<TechModels.SuggestedTechnician> r2 = repo.suggestTechnicians("R2");
        assertThat(r2).extracting(s -> s.technician().code())
                .containsExactly("CTV-001", "CTV-002");
        assertThat(r2).extracting(TechModels.SuggestedTechnician::activeCount)
                .containsExactly(1, 1);
    }

    private static JsonNode readTimeline(String json) {
        try {
            return new ObjectMapper().readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
