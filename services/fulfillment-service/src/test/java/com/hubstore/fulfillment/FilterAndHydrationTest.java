package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.DashboardStatsData;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.BatchStatus;
import com.hubstore.fulfillment.v1.FilterOrdersRequest;
import com.hubstore.fulfillment.v1.FilterOrdersResponse;
import com.hubstore.fulfillment.v1.FulfillmentServiceGrpc;
import com.hubstore.fulfillment.v1.GetDashboardStatsRequest;
import com.hubstore.fulfillment.v1.GetDashboardStatsResponse;
import com.hubstore.fulfillment.v1.GetOrdersByCodesRequest;
import com.hubstore.fulfillment.v1.GetOrdersByCodesResponse;
import com.hubstore.fulfillment.v1.GetTimeDeliveryRequest;
import com.hubstore.fulfillment.v1.GetTimeDeliveryResponse;
import com.hubstore.fulfillment.v1.HubStoreOrderFilterItem;
import com.hubstore.fulfillment.v1.ListDeliveryStaffRequest;
import com.hubstore.fulfillment.v1.ListDeliveryStaffResponse;
import com.hubstore.fulfillment.v1.ListRegionsRequest;
import com.hubstore.fulfillment.v1.ListRegionsResponse;
import com.hubstore.fulfillment.v1.RegionType;
import com.hubstore.fulfillment.v1.ShopAssignment;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Filter (+excludeFulfillCodes, pagination, search) + hydration GetOrdersByCodes
 * + regions — danh sách test theo plan Task 5, seed thật (canonical-seed.json).
 */
class FilterAndHydrationTest {

    private SeedModels.SeedFile seed;
    private FulfillmentServiceImpl service;
    private InMemoryOrderRepository repo;
    private RecordingEventPublisher publisher;

    @BeforeEach
    void setUp() {
        seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        repo = new InMemoryOrderRepository(seed);
        publisher = new RecordingEventPublisher();
        service = new FulfillmentServiceImpl(repo, publisher);
    }

    private FilterOrdersResponse filter(FilterOrdersRequest.Builder req) {
        CollectingObserver<FilterOrdersResponse> obs = new CollectingObserver<>();
        service.filterOrders(req.build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.completed).isTrue();
        return obs.values.get(0);
    }

    private FilterOrdersRequest.Builder all() {
        return FilterOrdersRequest.newBuilder().setPage(1).setPageSize(100);
    }

    @Test
    void seedLoadedFull27Orders() {
        FilterOrdersResponse resp = filter(all());
        assertThat(resp.getTotal()).isEqualTo(seed.orders().size());
        assertThat(resp.getTotal()).isGreaterThanOrEqualTo(25);
        // Deep items: shopAssignment + times + items[] sản phẩm đều đi kèm (spec §3.8).
        HubStoreOrderFilterItem first = resp.getItems(0);
        assertThat(first.getShopAssignment().getShopCode()).isNotEmpty();
        assertThat(first.getOriginalTime().getFrom()).isNotEmpty();
        assertThat(first.getItemsCount()).isGreaterThan(0);
    }

    @Test
    void shop30201HasAtLeast5NotPrepared() {
        FilterOrdersResponse resp = filter(all()
                .addShopCodes("30201")
                .addBatchStatuses(BatchStatus.BATCH_STATUS_NOT_PREPARED));
        assertThat(resp.getTotal()).isGreaterThanOrEqualTo(5);
    }

    @Test
    void excludeFulfillCodesRemovesSelected() {
        FilterOrdersResponse before = filter(all());
        String excluded = before.getItems(0).getFulfillCode();
        FilterOrdersResponse after = filter(all().addExcludeFulfillCodes(excluded));
        assertThat(after.getTotal()).isEqualTo(before.getTotal() - 1);
        assertThat(after.getItemsList())
                .noneMatch(i -> i.getFulfillCode().equals(excluded));
    }

    @Test
    void paginationSlicesAndKeepsTotal() {
        FilterOrdersResponse page1 = filter(all().setPage(1).setPageSize(10));
        FilterOrdersResponse page2 = filter(all().setPage(2).setPageSize(10));
        FilterOrdersResponse page3 = filter(all().setPage(3).setPageSize(10));
        assertThat(page1.getItemsCount()).isEqualTo(10);
        assertThat(page2.getItemsCount()).isEqualTo(10);
        assertThat(page1.getTotal()).isEqualTo(page2.getTotal()).isEqualTo(page3.getTotal());
        assertThat(page1.getItems(0).getFulfillCode())
                .isNotEqualTo(page2.getItems(0).getFulfillCode());
    }

    @Test
    void searchFulfillCodeMatches() {
        FilterOrdersResponse resp = filter(all().setFulfillCode("ORD-300"));
        // ORD-3001..ORD-30xx — mọi kết quả đều chứa chuỗi tìm kiếm.
        assertThat(resp.getItemsList()).allSatisfy(
                i -> assertThat(i.getFulfillCode()).startsWith("ORD-30"));
        assertThat(resp.getTotal()).isGreaterThan(0);
    }

    @Test
    void batchStatusFilterMultiSelect() {
        FilterOrdersResponse resp = filter(all()
                .addBatchStatuses(BatchStatus.BATCH_STATUS_WEIGHT_EXCEEDED));
        long seedCount = seed.orders().stream().filter(o -> o.batchStatus() == 3).count();
        assertThat(resp.getTotal()).isEqualTo(seedCount);
        assertThat(resp.getItemsList()).allSatisfy(
                i -> assertThat(i.getBatchStatus()).isEqualTo(BatchStatus.BATCH_STATUS_WEIGHT_EXCEEDED));
    }

    @Test
    void getOrdersByCodesReturnsTruthForHydration() {
        List<String> codes = List.of(
                seed.orders().get(0).fulfillCode(),
                seed.orders().get(3).fulfillCode());
        CollectingObserver<GetOrdersByCodesResponse> obs = new CollectingObserver<>();
        service.getOrdersByCodes(GetOrdersByCodesRequest.newBuilder()
                .addAllFulfillCodes(codes)
                .addFulfillCodes("ORD-KHONG-TON-TAI") // code lạ bị bỏ — không lỗi cả batch
                .build(), obs);
        assertThat(obs.error).isNull();
        GetOrdersByCodesResponse resp = obs.values.get(0);
        assertThat(resp.getOrdersCount()).isEqualTo(2);
        // Truth nguyên trạng: batchStatus + kho khớp seed (Go dùng validate rule 1).
        for (HubStoreOrderFilterItem o : resp.getOrdersList()) {
            SeedModels.OrderSeed source = seed.orders().stream()
                    .filter(s -> s.fulfillCode().equals(o.getFulfillCode())).findFirst().orElseThrow();
            assertThat(o.getBatchStatusValue()).isEqualTo(source.batchStatus());
            assertThat(o.getShopAssignment().getShopCode())
                    .isEqualTo(source.shopAssignment().shopCode());
            assertThat(o.getIsDebtSplittingOrder()).isEqualTo(source.isDebtSplittingOrder());
        }
    }

    @Test
    void listRegionsHierarchical() {
        CollectingObserver<ListRegionsResponse> obs = new CollectingObserver<>();
        service.listRegions(ListRegionsRequest.newBuilder().build(), obs);
        assertThat(obs.error).isNull();
        ListRegionsResponse resp = obs.values.get(0);
        assertThat(resp.getRegionsCount()).isEqualTo(seed.regions().size());
        assertThat(resp.getRegionsList())
                .anySatisfy(r -> assertThat(r.getType()).isEqualTo(RegionType.REGION_TYPE_PROVINCE));
        assertThat(resp.getRegionsList())
                .anySatisfy(r -> {
                    assertThat(r.getType()).isEqualTo(RegionType.REGION_TYPE_WARD);
                    assertThat(r.getParentCode()).isNotEmpty();
                });
    }

    @Test
    void listDeliveryStaffAllAndFilterByShop() {
        CollectingObserver<ListDeliveryStaffResponse> allObs = new CollectingObserver<>();
        service.listDeliveryStaff(ListDeliveryStaffRequest.newBuilder().build(), allObs);
        assertThat(allObs.error).isNull();
        ListDeliveryStaffResponse all = allObs.values.get(0);
        assertThat(all.getItemsCount()).isEqualTo(seed.deliveryStaff().size());
        assertThat(all.getItemsList()).allSatisfy(s -> {
            assertThat(s.getId()).isNotEmpty();
            assertThat(s.getName()).isNotEmpty();
            assertThat(s.getShopCode()).isNotEmpty();
        });

        CollectingObserver<ListDeliveryStaffResponse> shopObs = new CollectingObserver<>();
        service.listDeliveryStaff(ListDeliveryStaffRequest.newBuilder()
                .setShopCode("30201").build(), shopObs);
        assertThat(shopObs.error).isNull();
        ListDeliveryStaffResponse shop = shopObs.values.get(0);
        long seedCount = seed.deliveryStaff().stream()
                .filter(s -> "30201".equals(s.shopCode())).count();
        assertThat(shop.getItemsCount()).isEqualTo(seedCount);
        assertThat(shop.getItemsList()).allSatisfy(
                s -> assertThat(s.getShopCode()).isEqualTo("30201"));
    }

    @Test
    void getTimeDeliverySuggestsFutureWindowPlus07() {
        CollectingObserver<GetTimeDeliveryResponse> obs = new CollectingObserver<>();
        service.getTimeDelivery(GetTimeDeliveryRequest.newBuilder()
                .setShopCode("30201").setCustomerAddress("Q1, TP.HCM").build(), obs);
        assertThat(obs.error).isNull();
        GetTimeDeliveryResponse resp = obs.values.get(0);
        ZonedDateTime from = ZonedDateTime.parse(resp.getSuggestedTime().getFrom(),
                DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        ZonedDateTime to = ZonedDateTime.parse(resp.getSuggestedTime().getTo(),
                DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        // Window +07:00 (Asia/Ho_Chi_Minh), from trong tương lai gần (2..3h), to = from + 1 ngày.
        assertThat(from.getOffset()).isEqualTo(ZoneOffset.of("+07:00"));
        assertThat(from).isAfter(ZonedDateTime.now(ZoneOffset.of("+07:00")).plusHours(1));
        assertThat(from).isBefore(ZonedDateTime.now(ZoneOffset.of("+07:00")).plusHours(4));
        assertThat(to).isEqualTo(from.plusDays(1));
    }

    @Test
    void getOrderDetailUnknownCodeIsNotFound() {
        CollectingObserver<com.hubstore.fulfillment.v1.GetOrderDetailResponse> obs = new CollectingObserver<>();
        service.getOrderDetail(com.hubstore.fulfillment.v1.GetOrderDetailRequest.newBuilder()
                .setFulfillCode("ORD-9999").build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.NOT_FOUND);
    }

    // ---------------- Dashboard (SF-9) ----------------

    private static SeedModels.OrderSeed order(String fulfillCode, String originalTimeFrom,
                                              int orderStatus, String batchCode) {
        return new SeedModels.OrderSeed(fulfillCode, "RSA-" + fulfillCode, 0, 0, batchCode,
                null,
                new SeedModels.TimeRangeSeed(originalTimeFrom, originalTimeFrom),
                null, orderStatus, List.of(), 0, 1, false, "addr", null, null, List.of());
    }

    @Test
    void dashboardStatsFillsMissingDaysAndSkipsBlankBatch() {
        ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
        LocalDate today = LocalDate.of(2026, 9, 10);
        SeedModels.SeedFile fake = new SeedModels.SeedFile(
                List.of(
                        order("ORD-D1", "2026-09-10T08:00:00+07:00", 0, "BATCH-0001"),
                        order("ORD-D2", "2026-09-08T10:00:00+07:00", 1, ""), // batchCode rỗng — bỏ
                        order("ORD-D3", "2026-09-08T23:30:00+07:00", 0, "BATCH-0002"),
                        order("ORD-D4", null, 0, "BATCH-0003")), // không originalTime — ngoài perDay
                List.of(), List.of(), List.of(), List.of());
        InMemoryOrderRepository fakeRepo = new InMemoryOrderRepository(fake);

        DashboardStatsData s = fakeRepo.dashboardStats(today, zone);

        // Đủ 30 ô cũ→mới (2026-08-12 .. 2026-09-10), ngày thiếu = 0.
        assertThat(s.ordersPerDay()).hasSize(30);
        assertThat(s.ordersPerDay().get(0).date()).isEqualTo("2026-08-12");
        assertThat(s.ordersPerDay().get(29).date()).isEqualTo("2026-09-10");
        Map<String, Integer> counts = s.ordersPerDay().stream()
                .collect(Collectors.toMap(DashboardStatsData.DayCount::date,
                        DashboardStatsData.DayCount::count));
        assertThat(counts.get("2026-09-08")).isEqualTo(2); // 2 ngày có đơn (thiếu ngày giữa → fill 0)
        assertThat(counts.get("2026-09-10")).isEqualTo(1);
        assertThat(counts.get("2026-09-09")).isEqualTo(0);
        assertThat(counts.get("2026-08-12")).isEqualTo(0);
        // totalToday chỉ đếm đơn originalTime hôm nay; pending đếm CẢ đơn không có originalTime.
        assertThat(s.totalToday()).isEqualTo(1);
        assertThat(s.pendingApproval()).isEqualTo(3);
        // per-batch: bỏ batchCode rỗng; ORD-D4 vẫn vào batch đếm.
        assertThat(s.ordersPerBatch()).containsExactly(
                new DashboardStatsData.BatchCount("BATCH-0001", 1),
                new DashboardStatsData.BatchCount("BATCH-0002", 1),
                new DashboardStatsData.BatchCount("BATCH-0003", 1));
    }

    @Test
    void getDashboardStatsRpcMatchesCanonicalSeed() {
        CollectingObserver<GetDashboardStatsResponse> obs = new CollectingObserver<>();
        service.getDashboardStats(GetDashboardStatsRequest.newBuilder().build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.completed).isTrue();
        GetDashboardStatsResponse resp = obs.values.get(0);
        ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
        LocalDate today = LocalDate.now(zone);
        // Seed canonical: 27 đơn, tất cả originalTime 2026-09-03 → chỉ vào window khi
        // hôm nay (ngày chạy) trong [2026-08-05 .. 2026-09-03] — đếm từ seed, không hardcode.
        long seedOn2026_09_03 = seed.orders().stream()
                .filter(o -> o.originalTime() != null && o.originalTime().from() != null
                        && o.originalTime().from().startsWith("2026-09-03"))
                .count();
        LocalDate cellDate = LocalDate.parse("2026-09-03");
        boolean cellInWindow = !cellDate.isBefore(today.minusDays(29)) && !cellDate.isAfter(today);
        assertThat(resp.getOrdersPerDayCount()).isEqualTo(30);
        assertThat(resp.getOrdersPerDayList()).allSatisfy(d ->
                assertThat(d.getDate()).matches("\\d{4}-\\d{2}-\\d{2}"));
        // Ô 2026-09-03 chỉ tồn tại khi ngày chạy đưa nó vào window 30 ngày.
        var cell = resp.getOrdersPerDayList().stream()
                .filter(d -> d.getDate().equals("2026-09-03")).toList();
        assertThat(cell).hasSize(cellInWindow ? 1 : 0);
        if (cellInWindow) {
            assertThat(cell.get(0).getCount()).isEqualTo((int) seedOn2026_09_03);
        }
        long seedPending = seed.orders().stream().filter(o -> o.orderStatus() == 0).count();
        assertThat(resp.getPendingApproval()).isEqualTo((int) seedPending);
        long seedBatchSum = seed.orders().stream()
                .filter(o -> o.batchCode() != null && !o.batchCode().isBlank()).count();
        assertThat(resp.getOrdersPerBatchList().stream()
                .mapToInt(b -> b.getCount()).sum()).isEqualTo((int) seedBatchSum);
        long seedToday = seed.orders().stream()
                .filter(o -> o.originalTime() != null && o.originalTime().from() != null
                        && o.originalTime().from().startsWith(today.toString()))
                .count();
        assertThat(resp.getTotalToday()).isEqualTo((int) seedToday);
    }
}
