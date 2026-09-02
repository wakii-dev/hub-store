package com.hubstore.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.seed.TechSeedLoader;
import com.hubstore.fulfillment.service.GrpcErrors;
import com.hubstore.fulfillment.service.TechServiceImpl;
import com.hubstore.fulfillment.store.InMemoryTechOrderRepository;
import com.hubstore.fulfillment.v1.AssignTechnicianRequest;
import com.hubstore.fulfillment.v1.AssignTechnicianResponse;
import com.hubstore.fulfillment.v1.DeliveryStatus;
import com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest;
import com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse;
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
        // SO-0006 DELIVERED (đã assign KTV-003) — không assignable.
        CollectingObserver<AssignTechnicianResponse> obs = new CollectingObserver<>();
        service.assignTechnician(AssignTechnicianRequest.newBuilder()
                .setServiceOrderCode("SO-0006").setTechnicianCode("KTV-001").build(), obs);
        StatusRuntimeException e = statusOf(obs.error);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.FAILED_PRECONDITION);
        assertThat(e.getStatus().getDescription()).contains("DELIVERED");
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
        // Seed: KTV-001 load 1 (PROCESSING), KTV-002 load 1 (SHIPPING),
        // KTV-003 load 0 (đơn DELIVERED bị exclude), KTV-004 load 0.
        // Sort activeCount asc + list order (seq proxy) asc.
        assertThat(resp.getItemsCount()).isEqualTo(4);
        assertThat(resp.getItems(0).getCode()).isEqualTo("KTV-003");
        assertThat(resp.getItems(0).getActiveCount()).isZero();
        assertThat(resp.getItems(1).getCode()).isEqualTo("KTV-004");
        assertThat(resp.getItems(1).getActiveCount()).isZero();
        assertThat(resp.getItems(2).getCode()).isEqualTo("KTV-001");
        assertThat(resp.getItems(2).getActiveCount()).isEqualTo(1);
        assertThat(resp.getItems(3).getCode()).isEqualTo("KTV-002");
        assertThat(resp.getItems(3).getActiveCount()).isEqualTo(1);
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
}
