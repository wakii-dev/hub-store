package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.v1.ShopAssignment;
import com.hubstore.fulfillment.v1.ShopAssignmentHistoryEntry;
import org.springframework.beans.factory.annotation.Value;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * In-memory store — load canonical-seed.json lúc boot, validate fail-fast
 * (SeedLoader → SeedValidator). Deliverable là in-memory (context pack §Boundary):
 * không DB thật, OrderRepository interface sẵn cho DB sau.
 *
 * SF-2 (FI-245): KHÔNG còn stereotype — bean do OrderRepositoryConfig lo
 * (@ConditionalOnProperty fulfillment.store=inmemory, test-only). 3 file unit
 * test construct trực tiếp qua constructor (SeedFile) — giữ public.
 */
public class InMemoryOrderRepository implements OrderRepository {

    private final List<SeedModels.OrderSeed> orders;
    private final List<SeedModels.RegionSeed> regions;
    private final List<SeedModels.DeliveryStaffSeed> staff;
    /** Lịch sử chuyển kho theo fulfillCode — khởi tạo từ seed history, append khi assign. */
    private final Map<String, List<ShopAssignmentHistoryEntry>> historyByCode = new LinkedHashMap<>();
    /** Activity log (SF-13 intake) — append-only, filter theo target khi đọc. */
    private final List<AuditEntry> auditLog = new ArrayList<>();

    /** fulfillCode sinh dải ORD-\d+ — scan max, tiếp từ base 3000. */
    private static final Pattern ORD_CODE = Pattern.compile("^ORD-(\\d+)$");
    private static final int ORD_CODE_BASE = 3000;

    @org.springframework.beans.factory.annotation.Autowired
    public InMemoryOrderRepository(@Value("${fulfillment.seed-path:}") String seedPathEnv) {
        this(SeedLoader.load(SeedLoader.resolve(seedPathEnv)));
    }

    /** Dùng trong test — seed đã load sẵn; Spring chọn constructor @Autowired ở trên. */
    public InMemoryOrderRepository(SeedModels.SeedFile seed) {
        this.orders = new ArrayList<>(seed.orders());
        this.regions = new ArrayList<>(seed.regions());
        this.staff = new ArrayList<>(seed.deliveryStaff());
        for (SeedModels.OrderSeed o : seed.orders()) {
            List<ShopAssignmentHistoryEntry> entries = new ArrayList<>();
            for (SeedModels.HistoryEntrySeed h : o.history()) {
                entries.add(ShopAssignmentHistoryEntry.newBuilder()
                        .setFulfillCode(o.fulfillCode())
                        // Seed history shape {timestamp, action, note} — map sang proto
                        // history entry: changedAt=timestamp, changedBy=action (dấu vết gốc).
                        .setChangedAt(h.timestamp() == null ? "" : h.timestamp())
                        .setChangedBy(h.action() == null ? "" : h.action())
                        .build());
            }
            historyByCode.put(o.fulfillCode(), entries);
        }
    }

    // ---------------- reads ----------------

    @Override
    public synchronized FilterResult filter(OrderFilter filter) {
        List<SeedModels.OrderSeed> matched = orders.stream()
                .filter(o -> matches(o, filter))
                .toList();
        int page = Math.max(filter.page(), 1);
        int pageSize = filter.pageSize() <= 0 ? 10 : filter.pageSize();
        int fromIndex = Math.min((page - 1) * pageSize, matched.size());
        int toIndex = Math.min(fromIndex + pageSize, matched.size());
        return new FilterResult(new ArrayList<>(matched.subList(fromIndex, toIndex)), matched.size());
    }

    /**
     * Resolve đơn theo MỖI mã trong 2 mã: fulfillCode (ORD-…, dùng nội bộ D1)
     * hoặc orderCode (RSA-…, "mã đơn RSA" — BatchingItem.orderCode mà Go gửi lên
     * khi revert/mutate qua MutateOrderStatus + GetOrdersByCodes, spec §3.3/§3.6).
     * Fix integration SF-3↔SF-4 (FI-241 walkthrough): Go KHÔNG có fulfillCode
     * trong BatchingItem (proto chỉ có order_code) — lookup 1 mã không đủ.
     */
    @Override
    public synchronized Optional<SeedModels.OrderSeed> findByFulfillCode(String fulfillCode) {
        return orders.stream()
                .filter(o -> o.fulfillCode().equals(fulfillCode) || fulfillCode.equals(o.orderCode()))
                .findFirst();
    }

    @Override
    public synchronized List<SeedModels.OrderSeed> findByCodes(List<String> fulfillCodes) {
        List<SeedModels.OrderSeed> out = new ArrayList<>();
        for (String code : fulfillCodes) {
            findByFulfillCode(code).ifPresent(out::add);
        }
        return out;
    }

    // ---------------- mutations ----------------

    @Override
    public synchronized List<SeedModels.OrderSeed> mutateBatchStatus(List<String> fulfillCodes, int targetBatchStatus, String batchCode) {
        List<SeedModels.OrderSeed> updated = new ArrayList<>();
        for (String code : fulfillCodes) {
            Optional<SeedModels.OrderSeed> found = findByFulfillCode(code);
            if (found.isEmpty()) {
                continue;
            }
            // target=0 (cancel-revert §9): đơn rời phiếu → clear batchCode.
            // target≠0: batchCode từ request (non-empty — FI-285) hoặc giữ hiện có.
            String resolvedBatchCode = targetBatchStatus == 0 ? null
                    : (batchCode != null && !batchCode.isEmpty() ? batchCode : found.get().batchCode());
            SeedModels.OrderSeed next = found.get().withBatchStatus(targetBatchStatus, resolvedBatchCode);
            replace(next);
            updated.add(next);
        }
        return updated;
    }

    @Override
    public synchronized SeedModels.OrderSeed assignShopHub(String fulfillCode, SeedModels.ShopAssignmentSeed targetShop,
                                                           String changedBy, Instant changedAt) {
        SeedModels.OrderSeed order = findByFulfillCode(fulfillCode)
                .orElseThrow(() -> new IllegalArgumentException("Order không tồn tại: " + fulfillCode));
        SeedModels.ShopAssignmentSeed from = order.shopAssignment();
        SeedModels.OrderSeed next = order.withShopAssignment(targetShop);
        replace(next);
        historyByCode.computeIfAbsent(fulfillCode, k -> new ArrayList<>()).add(
                ShopAssignmentHistoryEntry.newBuilder()
                        .setFulfillCode(fulfillCode)
                        .setFromShop(toProtoShop(from))
                        .setToShop(toProtoShop(targetShop))
                        .setChangedAt(changedAt.toString())
                        .setChangedBy(changedBy == null ? "fulfillment-service" : changedBy)
                        .build());
        return next;
    }

    @Override
    public synchronized SeedModels.OrderSeed updateDeliveryTime(String fulfillCode, SeedModels.TimeRangeSeed deliveryTime) {
        SeedModels.OrderSeed order = findByFulfillCode(fulfillCode)
                .orElseThrow(() -> new IllegalArgumentException("Order không tồn tại: " + fulfillCode));
        SeedModels.OrderSeed next = order.withDeliveryTime(deliveryTime);
        replace(next);
        return next;
    }

    @Override
    public synchronized SeedModels.OrderSeed updateNote(String fulfillCode, String note) {
        SeedModels.OrderSeed order = findByFulfillCode(fulfillCode)
                .orElseThrow(() -> new IllegalArgumentException("Order không tồn tại: " + fulfillCode));
        SeedModels.OrderSeed next = order.withNote(note);
        replace(next);
        return next;
    }

    @Override
    public synchronized List<ShopAssignmentHistoryEntry> getHistory(String fulfillCode) {
        // READ semantics (spec §3.8): trả copy — KHÔNG mutate state.
        return List.copyOf(historyByCode.getOrDefault(fulfillCode, List.of()));
    }

    // ---------------- master data ----------------

    @Override
    public synchronized List<SeedModels.RegionSeed> regions() {
        return List.copyOf(regions);
    }

    @Override
    public synchronized List<SeedModels.DeliveryStaffSeed> deliveryStaff() {
        return List.copyOf(staff);
    }

    @Override
    public synchronized List<SeedModels.ShopSeed> distinctShops() {
        Map<String, SeedModels.ShopSeed> byCode = new LinkedHashMap<>();
        for (SeedModels.OrderSeed o : orders) {
            if (o.shopAssignment() != null) {
                byCode.putIfAbsent(o.shopAssignment().shopCode(), new SeedModels.ShopSeed(
                        o.shopAssignment().shopCode(), o.shopAssignment().shopName(),
                        o.shopAssignment().address()));
            }
        }
        return byCode.values().stream().sorted(Comparator.comparing(SeedModels.ShopSeed::code)).toList();
    }

    /**
     * Dashboard aggregate (SF-9) — cùng semantics PostgresOrderRepository:
     * nhóm theo originalTime.from (parse ISO → atZoneSameInstant(zone)), fill
     * đủ 30 ô cũ→mới ngày thiếu = 0; parse lỗi/NULL → đơn rơi khỏi window count;
     * pending = order_status 0; per-batch bỏ batchCode rỗng, sort theo code.
     */
    @Override
    public synchronized DashboardStatsData dashboardStats(java.time.LocalDate today, java.time.ZoneId zone) {
        java.time.LocalDate start = today.minusDays(29);
        Map<String, Integer> byDay = new LinkedHashMap<>();
        int totalToday = 0;
        int pending = 0;
        Map<String, Integer> perBatchMap = new java.util.TreeMap<>();
        for (SeedModels.OrderSeed o : orders) {
            if (o.orderStatus() == 0) {
                pending++;
            }
            if (o.batchCode() != null && !o.batchCode().isBlank()) {
                perBatchMap.merge(o.batchCode(), 1, Integer::sum);
            }
            if (o.originalTime() == null || o.originalTime().from() == null) {
                continue;
            }
            String date;
            try {
                date = OffsetDateTime.parse(o.originalTime().from())
                        .atZoneSameInstant(zone).toLocalDate().toString();
            } catch (DateTimeParseException e) {
                continue; // parse lỗi — như DB original_time_from NULL: rơi khỏi window
            }
            if (date.equals(today.toString())) {
                totalToday++;
            }
            byDay.merge(date, 1, Integer::sum);
        }
        List<DashboardStatsData.DayCount> days = new ArrayList<>();
        for (java.time.LocalDate d = start; !d.isAfter(today); d = d.plusDays(1)) {
            days.add(new DashboardStatsData.DayCount(d.toString(), byDay.getOrDefault(d.toString(), 0)));
        }
        List<DashboardStatsData.BatchCount> perBatch = new ArrayList<>();
        perBatchMap.forEach((code, count) -> perBatch.add(new DashboardStatsData.BatchCount(code, count)));
        return new DashboardStatsData(days, totalToday, pending, perBatch);
    }

    // ---------------- SF-13 intake ----------------

    @Override
    public synchronized List<String> nextFulfillCodes(int n) {
        int max = ORD_CODE_BASE;
        for (SeedModels.OrderSeed o : orders) {
            Matcher m = ORD_CODE.matcher(o.fulfillCode());
            if (m.matches()) {
                max = Math.max(max, Integer.parseInt(m.group(1)));
            }
        }
        List<String> codes = new ArrayList<>(n);
        for (int i = 1; i <= n; i++) {
            codes.add(String.format(Locale.ROOT, "ORD-%04d", max + i));
        }
        return codes;
    }

    @Override
    public synchronized List<SeedModels.OrderSeed> insertOrders(List<SeedModels.OrderSeed> newOrders) {
        orders.addAll(newOrders);
        for (SeedModels.OrderSeed o : newOrders) {
            historyByCode.computeIfAbsent(o.fulfillCode(), k -> new ArrayList<>());
        }
        return List.copyOf(newOrders);
    }

    @Override
    public synchronized SeedModels.OrderSeed markFailed(String fulfillCode, String reason, String note, Instant at) {
        SeedModels.OrderSeed order = findByExactFulfillCode(fulfillCode)
                .orElseThrow(() -> new IllegalArgumentException("Order không tồn tại: " + fulfillCode));
        if (order.failReason() != null) {
            throw new IllegalArgumentException("Order đã FAILED: " + fulfillCode);
        }
        SeedModels.OrderSeed next = order.withFail(reason, note, at);
        replace(next);
        return next;
    }

    /**
     * Đơn FAILED (fail_reason != null)? — SF-14 (FI-259): predicate cho
     * CodRepositoryConfig wire vào InMemoryCodConfirmationRepository, mirror
     * JOIN orders.fail_reason IS NULL (D7) phía Postgres. Accessor only —
     * KHÔNG tạo dependency ngược sang CodConfirmationRepository.
     */
    public synchronized boolean isFailed(String fulfillCode) {
        return orders.stream()
                .anyMatch(o -> o.fulfillCode().equals(fulfillCode) && o.failReason() != null);
    }

    @Override
    public synchronized boolean hasRetry(String fulfillCode) {
        return orders.stream().anyMatch(o -> fulfillCode.equals(o.oldFulfillCode()));
    }

    @Override
    public synchronized Optional<SeedModels.OrderSeed> findByExactFulfillCode(String fulfillCode) {
        return orders.stream()
                .filter(o -> o.fulfillCode().equals(fulfillCode))
                .findFirst();
    }

    @Override
    public synchronized void appendAudit(String actor, String action, String target, String detailJson) {
        auditLog.add(new AuditEntry(actor, action, target, detailJson, Instant.now()));
    }

    @Override
    public synchronized List<AuditEntry> getAudit(String fulfillCode) {
        // READ semantics: trả copy — KHÔNG mutate state.
        return auditLog.stream()
                .filter(e -> e.target().equals(fulfillCode))
                .toList();
    }

    // ---------------- helpers ----------------

    private void replace(SeedModels.OrderSeed next) {
        for (int i = 0; i < orders.size(); i++) {
            if (orders.get(i).fulfillCode().equals(next.fulfillCode())) {
                orders.set(i, next);
                return;
            }
        }
    }

    private boolean matches(SeedModels.OrderSeed o, OrderFilter f) {
        if (f.fulfillCode() != null && !f.fulfillCode().isBlank()
                && !o.fulfillCode().toLowerCase(Locale.ROOT)
                        .contains(f.fulfillCode().toLowerCase(Locale.ROOT))) {
            return false;
        }
        if (!f.batchStatuses().isEmpty() && !f.batchStatuses().contains(o.batchStatus())) {
            return false;
        }
        if (!f.orderStatuses().isEmpty() && !f.orderStatuses().contains(o.orderStatus())) {
            return false;
        }
        if (!f.shopCodes().isEmpty()
                && (o.shopAssignment() == null || !f.shopCodes().contains(o.shopAssignment().shopCode()))) {
            return false;
        }
        if (!f.regionCodes().isEmpty() && !matchesAnyRegion(o, f.regionCodes())) {
            return false;
        }
        if (!overlaps(o.deliveryTime(), f.deliveryTime())) {
            return false;
        }
        if (!overlaps(o.originalTime(), f.originalTime())) {
            return false;
        }
        // created_time: seed orders không có createdAt — nhận nhưng chưa filter (spike).
        return f.excludeFulfillCodes() == null || !f.excludeFulfillCodes().contains(o.fulfillCode());
    }

    /**
     * Region filter (D1 "Địa chỉ"): seed đơn không có regionCode — match
     * deterministic bằng cách customerAddress chứa tên region (province/ward,
     * case-insensitive). Đủ cho spike; DB thật sẽ join qua regionCode.
     */
    private boolean matchesAnyRegion(SeedModels.OrderSeed o, Set<String> regionCodes) {
        String address = o.customerAddress() == null ? "" : o.customerAddress().toLowerCase(Locale.ROOT);
        return regions.stream()
                .filter(r -> regionCodes.contains(r.code()))
                .anyMatch(r -> r.name() != null && address.contains(r.name().toLowerCase(Locale.ROOT)));
    }

    /** Range overlap — ISO-8601 datetime (Instant.parse); khoảng trống = unbounded. */
    private boolean overlaps(SeedModels.TimeRangeSeed orderRange, SeedModels.TimeRangeSeed filterRange) {
        if (filterRange == null || (isBlank(filterRange.from()) && isBlank(filterRange.to()))) {
            return true;
        }
        if (orderRange == null) {
            return false;
        }
        Instant fFrom = parseOrMin(filterRange.from());
        Instant fTo = parseOrMax(filterRange.to());
        Instant oFrom = parseOrMin(orderRange.from());
        Instant oTo = parseOrMax(orderRange.to());
        return oFrom.compareTo(fTo) <= 0 && oTo.compareTo(fFrom) >= 0;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static Instant parseOrMin(String iso) {
        try {
            return OffsetDateTime.parse(iso).toInstant();
        } catch (DateTimeParseException | NullPointerException e) {
            return Instant.MIN;
        }
    }

    private static Instant parseOrMax(String iso) {
        try {
            return OffsetDateTime.parse(iso).toInstant();
        } catch (DateTimeParseException | NullPointerException e) {
            return Instant.MAX;
        }
    }

    private static ShopAssignment toProtoShop(SeedModels.ShopAssignmentSeed s) {
        return ShopAssignment.newBuilder()
                .setShopCode(s.shopCode() == null ? "" : s.shopCode())
                .setShopName(s.shopName() == null ? "" : s.shopName())
                .setAddress(s.address() == null ? "" : s.address())
                .build();
    }
}
