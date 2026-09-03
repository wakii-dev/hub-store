package com.hubstore.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.seed.TechSeedLoader;
import com.hubstore.fulfillment.service.GrpcErrors;
import com.hubstore.fulfillment.service.TechServiceImpl;
import com.hubstore.fulfillment.store.InMemoryTechOrderRepository;
import com.hubstore.fulfillment.v1.AcceptOrderRequest;
import com.hubstore.fulfillment.v1.AssignTechnicianRequest;
import com.hubstore.fulfillment.v1.AssignTechnicianResponse;
import com.hubstore.fulfillment.v1.CompleteOrderRequest;
import com.hubstore.fulfillment.v1.DeliveryStatus;
import com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest;
import com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse;
import com.hubstore.fulfillment.v1.MutateTechOrderResponse;
import com.hubstore.fulfillment.v1.RescheduleOrderRequest;
import com.hubstore.fulfillment.v1.SuggestTechniciansRequest;
import com.hubstore.fulfillment.v1.SuggestTechniciansResponse;
import io.grpc.Metadata;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validation + enum mapping ở biên gRPC của TechServiceImpl (plan Task 5,
 * spec §6.1): blank → INVALID_ARGUMENT (x-error-details); SO lạ → NOT_FOUND;
 * KTV lạ → INVALID_ARGUMENT; sai trạng thái → FAILED_PRECONDITION; happy-path
 * assign trả flags re-computed; suggest sort theo workload; statuses filter
 * enum DELIVERY_STATUS_* → string thường.
 */
class TechGrpcValidationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private InMemoryTechOrderRepository repo;
    private TechServiceImpl service;

    @BeforeEach
    void setUp() {
        TechSeedLoader.TechSeedFile seed = TechSeedLoader.load(
                TechSeedLoader.resolve(System.getenv("TECH_SEED_PATH")));
        repo = new InMemoryTechOrderRepository(seed);
        service = new TechServiceImpl(repo);
    }

    // ---------------- helpers ----------------

    private StatusRuntimeException statusOf(Throwable t) {
        assertThat(t).isInstanceOf(StatusRuntimeException.class);
        return (StatusRuntimeException) t;
    }

    /** Decode metadata x-error-details đúng convention BFF (SF-2 pin). */
    private JsonNode errorDetailsOf(Throwable t) throws Exception {
        StatusRuntimeException e = statusOf(t);
        String encoded = e.getTrailers()
                .get(Metadata.Key.of(GrpcErrors.METADATA_DETAILS_KEY, Metadata.ASCII_STRING_MARSHALLER));
        assertThat(encoded).isNotNull();
        String json = URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        JsonNode arr = JSON.readTree(json);
        assertThat(arr.isArray()).isTrue();
        assertThat(arr.size()).isGreaterThan(0);
        return arr;
    }

    private AssignTechnicianResponse assign(String soCode, String techCode) {
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode(soCode).setTechnicianCode(techCode).build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.completed).isTrue();
        return obs.values.get(0);
    }

    // ---------------- assign validation ----------------

    @Test
    void assignBlankServiceOrderCode_invalidArgument() throws Exception {
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode("").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("serviceOrderCode");
    }

    @Test
    void assignBlankTechnicianCode_invalidArgument() throws Exception {
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode("SO-0001").setTechnicianCode(" ").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("technicianCode");
    }

    @Test
    void assignUnknownServiceOrder_notFound() {
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode("SO-9999").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.NOT_FOUND);
        assertThat(e.getStatus().getDescription()).contains("SO-9999");
    }

    @Test
    void assignUnknownTechnician_invalidArgument() throws Exception {
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode("SO-0001").setTechnicianCode("KTV-999").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("technicianCode");
        assertThat(details.get(0).get("message").asText()).contains("KTV-999");
    }

    @Test
    void assignWrongStatus_failedPrecondition() {
        // SO-0005 SHIPPING (đã assign KTV-002) — không assignable.
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode("SO-0005").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.FAILED_PRECONDITION);
        assertThat(e.getStatus().getDescription()).contains("SHIPPING");
    }

    @Test
    void assignHappyPath_confirmedOrder_flagsRecomputed() {
        // SO-0002 CONFIRMED chưa assign — assign KTV-001 → allowAccept true,
        // allowAssign false, allowReassign true (matrix spec §5).
        AssignTechnicianResponse resp = assign("SO-0002", "KTV-001");
        assertThat(resp.getOrder().getServiceOrderCode()).isEqualTo("SO-0002");
        assertThat(resp.getOrder().getTechnicianCode()).isEqualTo("KTV-001");
        assertThat(resp.getOrder().getStatus()).isEqualTo(DeliveryStatus.DELIVERY_STATUS_CONFIRMED);
        assertThat(resp.getOrder().getButtons().getAllowAccept()).isTrue();
        assertThat(resp.getOrder().getButtons().getAllowAssign()).isFalse();
        assertThat(resp.getOrder().getButtons().getAllowReassign()).isTrue();
        assertThat(resp.getOrder().getButtons().getAllowCancel()).isTrue();
        // Repo thật sự đổi technician + history 1 row from NULL.
        assertThat(repo.findInstallation("SO-0002").orElseThrow().technicianCode()).isEqualTo("KTV-001");
        assertThat(repo.assignmentHistory("SO-0002")).hasSize(1);
        assertThat(repo.assignmentHistory("SO-0002").get(0).fromTechnicianCode()).isNull();
    }

    // ---------------- suggest ----------------

    @Test
    void suggestBlankRegion_invalidArgument() throws Exception {
        CollectingObserver<SuggestTechniciansResponse> obs = new CollectingObserver<>();
        service.suggestTechnicians(SuggestTechniciansRequest.newBuilder().setRegionCode("").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("regionCode");
    }

    @Test
    void suggestRegionR1_sortedByWorkloadAsc() {
        CollectingObserver<SuggestTechniciansResponse> obs = new CollectingObserver<>();
        service.suggestTechnicians(SuggestTechniciansRequest.newBuilder().setRegionCode("R1").build(), obs);
        assertThat(obs.error).isNull();
        SuggestTechniciansResponse resp = obs.values.get(0);
        // Seed SF-25: KTV-001 load 2 (SO-0004 PROCESSING + SO-0006 CONFIRMED),
        // KTV-002 load 1 (SHIPPING), KTV-003/KTV-004 load 0.
        // Sort activeCount asc + list order (seq proxy) asc.
        assertThat(resp.getItemsCount()).isEqualTo(4);
        assertThat(resp.getItems(0).getCode()).isEqualTo("KTV-003");
        assertThat(resp.getItems(0).getActiveCount()).isZero();
        assertThat(resp.getItems(1).getCode()).isEqualTo("KTV-004");
        assertThat(resp.getItems(1).getActiveCount()).isZero();
        assertThat(resp.getItems(2).getCode()).isEqualTo("KTV-002");
        assertThat(resp.getItems(2).getActiveCount()).isEqualTo(1);
        assertThat(resp.getItems(3).getCode()).isEqualTo("KTV-001");
        assertThat(resp.getItems(3).getActiveCount()).isEqualTo(2);
        assertThat(resp.getItems(0).getType()).isEqualTo("KTV");
    }

    // ---------------- filter mapping ----------------

    @Test
    void filterDelivery_byStatus_enumMapped_andDeliveryButtons() {
        CollectingObserver<FilterDeliveryOrdersResponse> obs = new CollectingObserver<>();
        service.filterDeliveryOrders(FilterDeliveryOrdersRequest.newBuilder()
                .addStatuses(DeliveryStatus.DELIVERY_STATUS_PROCESSING)
                .setPage(1).setPageSize(10).build(), obs);
        assertThat(obs.error).isNull();
        FilterDeliveryOrdersResponse resp = obs.values.get(0);
        // Seed có đúng 1 đơn PROCESSING, ngày TODAY.
        assertThat(resp.getTotal()).isEqualTo(1);
        var item = resp.getItems(0);
        assertThat(item.getStatus()).isEqualTo(DeliveryStatus.DELIVERY_STATUS_PROCESSING);
        // Delivery buttons: chỉ allowCancel/allowReschedule; PROCESSING cancellable
        // nhưng không reschedulable (matrix spec §5).
        assertThat(item.getButtons().getAllowCancel()).isTrue();
        assertThat(item.getButtons().getAllowReschedule()).isFalse();
        assertThat(item.getButtons().getAllowAssign()).isFalse();
        assertThat(item.getButtons().getAllowReassign()).isFalse();
        assertThat(item.getButtons().getAllowAccept()).isFalse();
    }

    @Test
    void filterDelivery_badDate_invalidArgument() throws Exception {
        CollectingObserver<FilterDeliveryOrdersResponse> obs = new CollectingObserver<>();
        service.filterDeliveryOrders(FilterDeliveryOrdersRequest.newBuilder()
                .setDateFrom("02/09/2026").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("dateFrom");
    }

    @Test
    void filterDelivery_defaultPagePageSize_whenBelowRange() {
        CollectingObserver<FilterDeliveryOrdersResponse> obs = new CollectingObserver<>();
        service.filterDeliveryOrders(FilterDeliveryOrdersRequest.newBuilder()
                .setPage(0).setPageSize(-5).build(), obs);
        assertThat(obs.error).isNull();
        FilterDeliveryOrdersResponse resp = obs.values.get(0);
        assertThat(resp.getPage()).isEqualTo(1);
        assertThat(resp.getPageSize()).isEqualTo(10);
    }

    @Test
    void filterInstallation_noDateFilter_returnsAll_includingNullExpectedTime() {
        CollectingObserver<com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse> obs =
                new CollectingObserver<>();
        service.filterInstallationOrders(
                com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest.newBuilder().build(), obs);
        assertThat(obs.error).isNull();
        // 8 đơn seed, kể cả SO-0003 expectedTime NULL (không date filter → không exclude).
        assertThat(obs.values.get(0).getTotal()).isEqualTo(8);
    }

    // ---------------- SF-25 — accept/complete/reschedule (spec §4.2) ----------------

    @Test
    void acceptHappyPath_confirmedToProcessing_flagsAndTimelineRecomputed() {
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.acceptOrder(AcceptOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0006").setTechnicianCode("KTV-001").build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.completed).isTrue();
        var order = obs.values.get(0).getOrder();
        assertThat(order.getStatus()).isEqualTo(DeliveryStatus.DELIVERY_STATUS_PROCESSING);
        // Flags re-computed: complete hiện, accept ẩn, reschedule vẫn mở (matrix §4.2).
        assertThat(order.getButtons().getAllowComplete()).isTrue();
        assertThat(order.getButtons().getAllowAccept()).isFalse();
        assertThat(order.getButtons().getAllowReschedule()).isTrue();
        // Repo thật sự đổi trạng thái + timeline append schema seed.
        assertThat(repo.findInstallation("SO-0006").orElseThrow().status()).isEqualTo("PROCESSING");
        JsonNode timeline = readTimeline(repo.findInstallation("SO-0006").orElseThrow().timelineJson());
        assertThat(timeline.get(timeline.size() - 1).get("status").asText()).isEqualTo("PROCESSING");
        assertThat(timeline.get(timeline.size() - 1).get("note").asText()).isEqualTo("KTV nhận việc");
        assertThat(timeline.get(timeline.size() - 1).get("actor").asText()).isEqualTo("KTV-001");
    }

    @Test
    void acceptBlank_invalidArgument() throws Exception {
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.acceptOrder(AcceptOrderRequest.newBuilder()
                .setServiceOrderCode(" ").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(errorDetailsOf(obs.error).get(0).get("field").asText()).isEqualTo("serviceOrderCode");

        CollectingObserver<MutateTechOrderResponse> obs2 = new CollectingObserver<>();
        service.acceptOrder(AcceptOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0006").setTechnicianCode("").build(), obs2);
        assertThat(statusOf(obs2.error).getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(errorDetailsOf(obs2.error).get(0).get("field").asText()).isEqualTo("technicianCode");
    }

    @Test
    void acceptUnknownServiceOrder_notFound() {
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.acceptOrder(AcceptOrderRequest.newBuilder()
                .setServiceOrderCode("SO-9999").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.NOT_FOUND);
        assertThat(e.getStatus().getDescription()).contains("SO-9999");
    }

    @Test
    void acceptNotOwner_failedPrecondition() {
        // SO-0006 thuộc KTV-001 — KTV-002 nhận hộ → FAILED_PRECONDITION (409).
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.acceptOrder(AcceptOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0006").setTechnicianCode("KTV-002").build(), obs);
        assertThat(statusOf(obs.error).getStatus().getCode()).isEqualTo(Status.Code.FAILED_PRECONDITION);
        assertThat(statusOf(obs.error).getStatus().getDescription()).contains("KTV-002");
    }

    @Test
    void acceptWrongState_failedPrecondition() {
        // SO-0004 PROCESSING — accept chỉ từ CONFIRMED|RESCHEDULED.
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.acceptOrder(AcceptOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0004").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.FAILED_PRECONDITION);
        assertThat(e.getStatus().getDescription()).contains("PROCESSING");
    }

    @Test
    void completeHappyPath_processingToDelivered() {
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.completeOrder(CompleteOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0004").setTechnicianCode("KTV-001").build(), obs);
        assertThat(obs.error).isNull();
        var order = obs.values.get(0).getOrder();
        assertThat(order.getStatus()).isEqualTo(DeliveryStatus.DELIVERY_STATUS_DELIVERED);
        // Terminal — mọi action flag tắt.
        assertThat(order.getButtons().getAllowComplete()).isFalse();
        assertThat(order.getButtons().getAllowAccept()).isFalse();
        assertThat(order.getButtons().getAllowReschedule()).isFalse();
        JsonNode timeline = readTimeline(repo.findInstallation("SO-0004").orElseThrow().timelineJson());
        assertThat(timeline.get(timeline.size() - 1).get("status").asText()).isEqualTo("DELIVERED");
        assertThat(timeline.get(timeline.size() - 1).get("note").asText()).isEqualTo("Hoàn tất lắp đặt");
        assertThat(timeline.get(timeline.size() - 1).get("actor").asText()).isEqualTo("KTV-001");
    }

    @Test
    void completeWrongState_failedPrecondition() {
        // SO-0006 CONFIRMED — complete chỉ từ PROCESSING (chưa accept).
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.completeOrder(CompleteOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0006").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.FAILED_PRECONDITION);
        assertThat(e.getStatus().getDescription()).contains("CONFIRMED");
    }

    @Test
    void rescheduleHappyPath_processingAllowed_setsTimeNoteAndReopenAccept() {
        String newTime = OffsetDateTime.now(ZoneOffset.of("+07:00")).plusDays(1)
                .truncatedTo(ChronoUnit.MINUTES).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.rescheduleOrder(RescheduleOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0004").setTechnicianCode("KTV-001")
                .setNewExpectedTime(newTime).setNote("Khách xin dời sang mai").build(), obs);
        assertThat(obs.error).isNull();
        var order = obs.values.get(0).getOrder();
        assertThat(order.getStatus()).isEqualTo(DeliveryStatus.DELIVERY_STATUS_RESCHEDULED);
        assertThat(order.getExpectedTime()).isEqualTo(newTime);
        // Dead-end fix: sau reschedule, accept mở lại.
        assertThat(order.getButtons().getAllowAccept()).isTrue();
        assertThat(order.getButtons().getAllowComplete()).isFalse();
        JsonNode timeline = readTimeline(repo.findInstallation("SO-0004").orElseThrow().timelineJson());
        JsonNode last = timeline.get(timeline.size() - 1);
        assertThat(last.get("status").asText()).isEqualTo("RESCHEDULED");
        assertThat(last.get("note").asText()).isEqualTo("Khách xin dời sang mai");
        assertThat(last.get("actor").asText()).isEqualTo("KTV-001");
    }

    @Test
    void reschedulePastTime_invalidArgument() throws Exception {
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.rescheduleOrder(RescheduleOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0004").setTechnicianCode("KTV-001")
                .setNewExpectedTime(OffsetDateTime.now(ZoneOffset.of("+07:00")).minusHours(1)
                        .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
                .setNote("quá khứ").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("newExpectedTime");
        assertThat(details.get(0).get("message").asText()).contains("quá khứ");
    }

    @Test
    void rescheduleBadFormat_invalidArgument() throws Exception {
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.rescheduleOrder(RescheduleOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0004").setTechnicianCode("KTV-001")
                .setNewExpectedTime("mai-luc-3-gio").setNote("x").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(errorDetailsOf(obs.error).get(0).get("field").asText()).isEqualTo("newExpectedTime");
    }

    @Test
    void rescheduleNotOwnerAndUnknown_failedPreconditionAndNotFound() {
        // SO-0006 thuộc KTV-001 — CTV-001 dời hộ → FAILED_PRECONDITION.
        CollectingObserver<MutateTechOrderResponse> obs = new CollectingObserver<>();
        service.rescheduleOrder(RescheduleOrderRequest.newBuilder()
                .setServiceOrderCode("SO-0006").setTechnicianCode("CTV-001")
                .setNewExpectedTime(OffsetDateTime.now(ZoneOffset.of("+07:00")).plusDays(1).toString())
                .setNote("x").build(), obs);
        assertThat(statusOf(obs.error).getStatus().getCode()).isEqualTo(Status.Code.FAILED_PRECONDITION);
        // SO lạ → NOT_FOUND.
        CollectingObserver<MutateTechOrderResponse> obs2 = new CollectingObserver<>();
        service.rescheduleOrder(RescheduleOrderRequest.newBuilder()
                .setServiceOrderCode("SO-9999").setTechnicianCode("KTV-001")
                .setNewExpectedTime(OffsetDateTime.now(ZoneOffset.of("+07:00")).plusDays(1).toString())
                .setNote("x").build(), obs2);
        assertThat(statusOf(obs2.error).getStatus().getCode()).isEqualTo(Status.Code.NOT_FOUND);
    }

    private static JsonNode readTimeline(String json) {
        try {
            return JSON.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
