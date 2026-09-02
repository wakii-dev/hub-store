package com.hubstore.fulfillment;

import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.D2cFilterResult;
import com.hubstore.fulfillment.store.D2cOrderFilter;
import com.hubstore.fulfillment.store.D2cOrderRecord;
import com.hubstore.fulfillment.store.D2cOrderRepository;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.D2cOrder;
import com.hubstore.fulfillment.v1.FilterD2cOrdersRequest;
import com.hubstore.fulfillment.v1.FilterD2cOrdersResponse;
import com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest;
import com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse;
import com.google.protobuf.Timestamp;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SF-18 (FI-263) — filter + note của D2C/Dropship qua in-memory List impl
 * (inline, sort id ASC ≡ Postgres ORDER BY id ASC) + gRPC mapping qua
 * FulfillmentServiceImpl. Semantics phải khớp PostgresD2cOrderRepository:
 * search literal-substring (escape % _ \), slot = time-of-day Asia/Ho_Chi_Minh
 * (push_time NULL không bao giờ match), page/pageSize normalize, ORDER BY id ASC.
 */
class D2cFilterAndNoteTest {

    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    private InMemoryD2cRepo repo;
    private FulfillmentServiceImpl service;

    /** id 1..5 — cố định để assert theo id (fixture chung với IT qua D2cFixture). */
    @BeforeEach
    void setUp() {
        repo = new InMemoryD2cRepo(D2cFixture.rows("D2C-"));
        service = new FulfillmentServiceImpl(
                new InMemoryOrderRepository("../../api/seed/canonical-seed.json"), repo);
    }

    // ---------------- repo filter semantics ----------------

    @Test
    void carrierFilterSingleAndMulti() {
        assertThat(ids(repo.filter(filter().carriers("GHN").build()))).containsExactly(1L, 3L, 5L);
        assertThat(ids(repo.filter(filter().carriers("GHN", "GHTK").build()))).containsExactly(1L, 2L, 3L, 5L);
        assertThat(repo.filter(filter().carriers("JP-POST").build()).total()).isZero();
        // Danh sách rỗng = không filter.
        assertThat(repo.filter(filter().build()).total()).isEqualTo(5);
    }

    @Test
    void multiStatusAndExactCategoryType() {
        assertThat(ids(repo.filter(filter().statuses("NEW", "PUSHED").build()))).containsExactly(1L, 2L, 4L, 5L);
        assertThat(ids(repo.filter(filter().productCategory("Điện tử").build()))).containsExactly(1L, 3L, 5L);
        assertThat(ids(repo.filter(filter().productCategory("Điện tử").productType("Điện thoại").build())))
                .containsExactly(1L, 5L);
        // Exact match — không substring.
        assertThat(repo.filter(filter().productCategory("Điện").build()).total()).isZero();
    }

    @Test
    void createdAndPushInstantRange() {
        // created_at 08-01..08-05 (UTC) — from giữa 02 và 03/08 → ids 3,4,5.
        Instant mid = Instant.parse("2026-08-03T00:00:00Z");
        assertThat(ids(repo.filter(filter().createdFrom(mid).build()))).containsExactly(3L, 4L, 5L);
        assertThat(ids(repo.filter(filter().createdTo(mid).build()))).containsExactly(1L, 2L);
        // push_time: 4 đơn có push 08-15 (id4 NULL không match range nào).
        assertThat(ids(repo.filter(filter().pushFrom(Instant.parse("2026-08-15T00:00:00Z")).build())))
                .containsExactly(1L, 2L, 3L, 5L);
        // push ≤ 10:00Z = 17:00+07 → id1 (01:30Z), id2 (07:45Z), id5 (01:45Z).
        assertThat(ids(repo.filter(filter().pushTo(Instant.parse("2026-08-15T10:00:00Z")).build())))
                .containsExactly(1L, 2L, 5L);
    }

    @Test
    void slotFilterVnTimezoneNullPushTimeNeverMatches() {
        // 08:00-09:00 VN → id1 (08:30) + id5 (08:45); id4 push_time NULL không match.
        assertThat(ids(repo.filter(filter().pushSlot("08:00", "09:00").build()))).containsExactly(1L, 5L);
        // 20:00-21:00 → id3.
        assertThat(ids(repo.filter(filter().pushSlot("20:00", "21:00").build()))).containsExactly(3L);
        // Khung ngoài tất cả → 0.
        assertThat(repo.filter(filter().pushSlot("01:00", "02:00").build()).total()).isZero();
        // Chỉ slotFrom / chỉ slotTo.
        assertThat(ids(repo.filter(filter().pushSlotFrom("20:00").build()))).containsExactly(3L);
        assertThat(ids(repo.filter(filter().pushSlotTo("08:40").build()))).containsExactly(1L);
    }

    @Test
    void searchMatchesOrderCodeOrDeliveryIdLiterally() {
        // Wildcard % _ trong input phải là literal (Postgres escape \% \_).
        assertThat(ids(repo.filter(filter().search("100%_").build()))).containsExactly(1L);
        assertThat(ids(repo.filter(filter().search("D2C-2").build()))).containsExactly(2L);
        // delivery_id DL-001 thuộc id1 + id5.
        assertThat(ids(repo.filter(filter().search("DL-001").build()))).containsExactly(1L, 5L);
        assertThat(repo.filter(filter().search("KHÔNG-CÓ").build()).total()).isZero();
    }

    @Test
    void emptyPageBeyondLastKeepsTotalAndOrderByIdAsc() {
        D2cFilterResult p99 = repo.filter(filter().page(99).pageSize(10).build());
        assertThat(p99.items()).isEmpty();
        assertThat(p99.total()).isEqualTo(5);
        // Trang hợp lệ slice theo id ASC.
        D2cFilterResult p1 = repo.filter(filter().page(1).pageSize(2).build());
        assertThat(ids(p1)).containsExactly(1L, 2L);
        D2cFilterResult p3 = repo.filter(filter().page(3).pageSize(2).build());
        assertThat(ids(p3)).containsExactly(5L);
        assertThat(p3.total()).isEqualTo(5);
    }

    @Test
    void filterRecordNormalizesPageAndPageSize() {
        D2cOrderFilter zeroed = filter().page(0).pageSize(0).build();
        assertThat(zeroed.page()).isEqualTo(1);
        assertThat(zeroed.pageSize()).isEqualTo(10);
        D2cOrderFilter negative = filter().page(-5).pageSize(-1).build();
        assertThat(negative.page()).isEqualTo(1);
        assertThat(negative.pageSize()).isEqualTo(10);
        assertThat(filter().pageSize(501).build().pageSize()).isEqualTo(500);
        assertThat(filter().pageSize(100).build().pageSize()).isEqualTo(100);
    }

    // ---------------- note ----------------

    @Test
    void updateNoteFoundReplacesRecord() {
        Optional<D2cOrderRecord> updated = repo.updateNote("D2C-100%_LIT", "Ghi chú tiếng Việt, có dấu phẩy");
        assertThat(updated).isPresent();
        assertThat(updated.orElseThrow().note()).isEqualTo("Ghi chú tiếng Việt, có dấu phẩy");
        // Đọc lại qua filter — note mới hiện diện, record khác giữ nguyên.
        assertThat(repo.findByCode("D2C-100%_LIT").orElseThrow().note())
                .isEqualTo("Ghi chú tiếng Việt, có dấu phẩy");
        assertThat(repo.findByCode("D2C-2001").orElseThrow().note()).isEqualTo("");
        // Code lạ → empty.
        assertThat(repo.updateNote("D2C-KHONG-TON-TAI", "x")).isEmpty();
        assertThat(repo.findByCode("D2C-KHONG-TON-TAI")).isEmpty();
    }

    // ---------------- gRPC mapping qua FulfillmentServiceImpl ----------------

    @Test
    void filterD2cOrdersRpcMapsRequestAndResponse() {
        FilterD2cOrdersResponse resp = d2cFilter(FilterD2cOrdersRequest.newBuilder()
                .setSearch("D2C-")
                .addCarriers("GHN")
                .setCreatedFrom(ts("2026-08-02T00:00:00Z"))
                .setPushSlotFrom("08:00")
                .setPushSlotTo("09:00")
                .setPage(1)
                .setPageSize(10));
        // GHN + created >= 08-02 + slot 08:00-09:00 → id5.
        assertThat(resp.getTotal()).isEqualTo(1);
        D2cOrder item = resp.getItems(0);
        assertThat(item.getOrderCode()).isEqualTo("D2C-5001");
        assertThat(item.getId()).isEqualTo(5);
        assertThat(item.getCarrier()).isEqualTo("GHN");
        assertThat(item.getIsDebtSplitting()).isTrue();
        // Timestamp round-trip: push 08:45+07 = 01:45Z.
        assertThat(item.hasPushTime()).isTrue();
        assertThat(item.getPushTime().getSeconds()).isEqualTo(
                OffsetDateTime.parse("2026-08-15T08:45:00+07:00").toInstant().getEpochSecond());
        // push_time NULL của id4 không xuống đây; nhưng kiểm tra hasPushTime=false ở case riêng.
        FilterD2cOrdersResponse nullPush = d2cFilter(FilterD2cOrdersRequest.newBuilder()
                .setSearch("D2C-4001").setPage(1).setPageSize(10));
        assertThat(nullPush.getItems(0).hasPushTime()).isFalse();
        assertThat(nullPush.getItems(0).hasExportTime()).isFalse();
    }

    @Test
    void filterD2cOrdersRpcNormalizesPaging() {
        FilterD2cOrdersResponse resp = d2cFilter(FilterD2cOrdersRequest.newBuilder().setPage(0).setPageSize(0));
        assertThat(resp.getTotal()).isEqualTo(5);
        assertThat(resp.getItemsCount()).isEqualTo(5); // pageSize 0 → 10 (mặc định), đủ 5 rows
        assertThat(ids(resp)).startsWith(1L, 2L, 3L);
    }

    @Test
    void updateD2cOrderNoteRpcFoundAndNotFound() {
        UpdateD2cOrderNoteResponse resp = d2cNote("D2C-2001", "Giao giờ hành chính");
        assertThat(resp.getOrder().getNote()).isEqualTo("Giao giờ hành chính");
        assertThat(repo.findByCode("D2C-2001").orElseThrow().note()).isEqualTo("Giao giờ hành chính");

        CollectingObserver<UpdateD2cOrderNoteResponse> obs = new CollectingObserver<>();
        service.updateD2cOrderNote(UpdateD2cOrderNoteRequest.newBuilder()
                .setOrderCode("D2C-KHONG-TON-TAI").setNote("x").setActorRole("WarehouseEmployee")
                .build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        StatusRuntimeException e = (StatusRuntimeException) obs.error;
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(e.getStatus().getDescription()).isEqualTo("Không tìm thấy đơn D2C D2C-KHONG-TON-TAI");
    }

    // ---------------- helpers ----------------

    private FilterD2cOrdersResponse d2cFilter(FilterD2cOrdersRequest.Builder req) {
        CollectingObserver<FilterD2cOrdersResponse> obs = new CollectingObserver<>();
        service.filterD2cOrders(req.build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.completed).isTrue();
        return obs.values.get(0);
    }

    private UpdateD2cOrderNoteResponse d2cNote(String code, String note) {
        CollectingObserver<UpdateD2cOrderNoteResponse> obs = new CollectingObserver<>();
        service.updateD2cOrderNote(UpdateD2cOrderNoteRequest.newBuilder()
                .setOrderCode(code).setNote(note).setActorRole("WarehouseEmployee").build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.completed).isTrue();
        return obs.values.get(0);
    }

    private static List<Long> ids(D2cFilterResult r) {
        return r.items().stream().map(D2cOrderRecord::id).toList();
    }

    private static List<Long> ids(FilterD2cOrdersResponse r) {
        return r.getItemsList().stream().map(D2cOrder::getId).toList();
    }

    private static D2cFilterBuilder filter() {
        return new D2cFilterBuilder();
    }

    /** Builder nhỏ cho D2cOrderFilter — test dễ đọc hơn positional record. */
    private static final class D2cFilterBuilder {
        private String search;
        private List<String> statuses = List.of();
        private List<String> carriers = List.of();
        private List<String> shops = List.of();
        private List<String> exportEmployees = List.of();
        private String productCategory;
        private String productType;
        private Instant createdFrom;
        private Instant createdTo;
        private Instant pushFrom;
        private Instant pushTo;
        private String pushSlotFrom;
        private String pushSlotTo;
        private int page = 1;
        private int pageSize = 100;

        D2cFilterBuilder search(String v) { this.search = v; return this; }
        D2cFilterBuilder statuses(String... v) { this.statuses = List.of(v); return this; }
        D2cFilterBuilder carriers(String... v) { this.carriers = List.of(v); return this; }
        D2cFilterBuilder shops(String... v) { this.shops = List.of(v); return this; }
        D2cFilterBuilder exportEmployees(String... v) { this.exportEmployees = List.of(v); return this; }
        D2cFilterBuilder productCategory(String v) { this.productCategory = v; return this; }
        D2cFilterBuilder productType(String v) { this.productType = v; return this; }
        D2cFilterBuilder createdFrom(Instant v) { this.createdFrom = v; return this; }
        D2cFilterBuilder createdTo(Instant v) { this.createdTo = v; return this; }
        D2cFilterBuilder pushFrom(Instant v) { this.pushFrom = v; return this; }
        D2cFilterBuilder pushTo(Instant v) { this.pushTo = v; return this; }
        D2cFilterBuilder pushSlot(String from, String to) { this.pushSlotFrom = from; this.pushSlotTo = to; return this; }
        D2cFilterBuilder pushSlotFrom(String v) { this.pushSlotFrom = v; return this; }
        D2cFilterBuilder pushSlotTo(String v) { this.pushSlotTo = v; return this; }
        D2cFilterBuilder page(int v) { this.page = v; return this; }
        D2cFilterBuilder pageSize(int v) { this.pageSize = v; return this; }

        D2cOrderFilter build() {
            return new D2cOrderFilter(search, statuses, carriers, shops, exportEmployees,
                    productCategory, productType, createdFrom, createdTo, pushFrom, pushTo,
                    pushSlotFrom, pushSlotTo, page, pageSize);
        }
    }

    private static Timestamp ts(String iso) {
        Instant i = Instant.parse(iso);
        return Timestamp.newBuilder().setSeconds(i.getEpochSecond()).setNanos(i.getNano()).build();
    }

    /**
     * In-memory D2C repo (plan Task 2 Step 4) — mirror SEMANTICS của
     * PostgresD2cOrderRepository: search literal-substring case-insensitive
     * (Postgres ILIKE + escape), slot theo time-of-day Asia/Ho_Chi_Minh với
     * push_time NULL không match, ORDER BY id ASC, page/pageSize đã normalize
     * trong D2cOrderFilter. Top-level package-private để test khác tái dùng.
     */
    static final class InMemoryD2cRepo implements D2cOrderRepository {

        private final List<D2cOrderRecord> rows;

        InMemoryD2cRepo(List<D2cOrderRecord> rows) {
            this.rows = new ArrayList<>(rows);
        }

        @Override
        public D2cFilterResult filter(D2cOrderFilter f) {
            List<D2cOrderRecord> matched = rows.stream()
                    .filter(o -> matchSearch(o, f.search()))
                    .filter(o -> f.statuses().isEmpty() || f.statuses().contains(o.status()))
                    .filter(o -> f.carriers().isEmpty() || f.carriers().contains(o.carrier()))
                    .filter(o -> f.shops().isEmpty() || f.shops().contains(o.shop()))
                    .filter(o -> f.exportEmployees().isEmpty() || f.exportEmployees().contains(o.exportEmployee()))
                    .filter(o -> isBlank(f.productCategory()) || f.productCategory().equals(o.productCategory()))
                    .filter(o -> isBlank(f.productType()) || f.productType().equals(o.productType()))
                    .filter(o -> f.createdFrom() == null || !o.createdAt().isBefore(f.createdFrom()))
                    .filter(o -> f.createdTo() == null || !o.createdAt().isAfter(f.createdTo()))
                    .filter(o -> f.pushFrom() == null || (o.pushTime() != null && !o.pushTime().isBefore(f.pushFrom())))
                    .filter(o -> f.pushTo() == null || (o.pushTime() != null && !o.pushTime().isAfter(f.pushTo())))
                    .filter(o -> f.pushSlotFrom() == null || inSlot(o, f.pushSlotFrom(), true))
                    .filter(o -> f.pushSlotTo() == null || inSlot(o, f.pushSlotTo(), false))
                    .sorted(Comparator.comparingLong(D2cOrderRecord::id))
                    .toList();
            int from = (f.page() - 1) * f.pageSize();
            List<D2cOrderRecord> items = from >= matched.size()
                    ? List.of() : matched.subList(from, Math.min(from + f.pageSize(), matched.size()));
            return new D2cFilterResult(items, matched.size());
        }

        @Override
        public Optional<D2cOrderRecord> findByCode(String orderCode) {
            return rows.stream().filter(o -> o.orderCode().equals(orderCode)).findFirst();
        }

        @Override
        public Optional<D2cOrderRecord> updateNote(String orderCode, String note) {
            Optional<D2cOrderRecord> found = findByCode(orderCode);
            if (found.isEmpty()) {
                return Optional.empty();
            }
            D2cOrderRecord old = found.orElseThrow();
            D2cOrderRecord updated = new D2cOrderRecord(old.orderCode(), old.orderIdInter(), old.deliveryId(),
                    old.carrier(), old.shop(), old.exportEmployee(), old.exportTime(), old.pushTime(),
                    old.receiverName(), old.receiverPhone(), old.receiverAddress(), old.serviceType(),
                    old.productCategory(), old.productType(), old.isDebtSplitting(),
                    note, old.status(), old.createdAt(), old.id());
            rows.set(rows.indexOf(old), updated);
            return Optional.of(updated);
        }

        private static boolean matchSearch(D2cOrderRecord o, String search) {
            if (isBlank(search)) {
                return true;
            }
            // ILIKE ≡ case-insensitive literal-substring (escape chỉ là chuẩn hóa
            // wildcard ở Postgres — in-memory contains là literal sẵn).
            String s = search.toLowerCase(Locale.ROOT);
            return o.orderCode().toLowerCase(Locale.ROOT).contains(s)
                    || (o.deliveryId() != null && o.deliveryId().toLowerCase(Locale.ROOT).contains(s));
        }

        /** push_time NULL → không match slot (cả 2 phía). */
        private static boolean inSlot(D2cOrderRecord o, String slot, boolean isFrom) {
            if (o.pushTime() == null) {
                return false;
            }
            LocalTime t = LocalTime.ofInstant(o.pushTime(), VN);
            LocalTime bound = LocalTime.parse(slot);
            return isFrom ? !t.isBefore(bound) : !t.isAfter(bound);
        }

        private static boolean isBlank(String s) {
            return s == null || s.isBlank();
        }
    }
}
