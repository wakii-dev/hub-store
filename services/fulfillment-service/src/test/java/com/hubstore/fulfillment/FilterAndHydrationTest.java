package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.BatchStatus;
import com.hubstore.fulfillment.v1.FilterOrdersRequest;
import com.hubstore.fulfillment.v1.FilterOrdersResponse;
import com.hubstore.fulfillment.v1.FulfillmentServiceGrpc;
import com.hubstore.fulfillment.v1.GetOrdersByCodesRequest;
import com.hubstore.fulfillment.v1.GetOrdersByCodesResponse;
import com.hubstore.fulfillment.v1.HubStoreOrderFilterItem;
import com.hubstore.fulfillment.v1.ListRegionsRequest;
import com.hubstore.fulfillment.v1.ListRegionsResponse;
import com.hubstore.fulfillment.v1.RegionType;
import com.hubstore.fulfillment.v1.ShopAssignment;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Filter (+excludeFulfillCodes, pagination, search) + hydration GetOrdersByCodes
 * + regions — danh sách test theo plan Task 5, seed thật (canonical-seed.json).
 */
class FilterAndHydrationTest {

    private SeedModels.SeedFile seed;
    private FulfillmentServiceImpl service;
    private InMemoryOrderRepository repo;

    @BeforeEach
    void setUp() {
        seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        repo = new InMemoryOrderRepository(seed);
        service = new FulfillmentServiceImpl(repo);
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
    void getOrderDetailUnknownCodeIsNotFound() {
        CollectingObserver<com.hubstore.fulfillment.v1.GetOrderDetailResponse> obs = new CollectingObserver<>();
        service.getOrderDetail(com.hubstore.fulfillment.v1.GetOrderDetailRequest.newBuilder()
                .setFulfillCode("ORD-9999").build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.NOT_FOUND);
    }
}
