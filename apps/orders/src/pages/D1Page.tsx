/**
 * D1Page — "Danh sách đơn hàng kho chi nhánh" (/hub-store-order/order).
 * Exposed qua federation là `orders/D1Page`.
 *
 * Đặc điểm MF: D1Page tự bọc <Provider store> (store per-remote với reducer
 * của api-client singleton `api`; shell KHÔNG cung cấp Redux context).
 * useNavigate hoạt động dưới BrowserRouter của shell nhờ react-router-dom
 * MF singleton — batchCode link cross-remote navigate /hub-store-order/batch.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Space, Table, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Provider } from "react-redux";
import {
  BATCH_STATUS,
  ORDER_STATUS,
  STATUS_TAG_LABELS,
  StatusTag,
  TextSearch,
  MultiSelect,
  type FilterOption,
  DateRange,
  DateTimeRange,
  FilterBar,
  formatPeriodOfTime,
  useUrlState,
  DESIGN_TOKENS,
  StatStripSkeleton,
  EmptyState,
  loadPlanningMap,
  type HubStoreOrderFilterItem,
  type PlanningMapEntry,
  type RegionsResponse,
  type ShopsResponse,
} from "@hub-store/shared";
import {
  createAppStore,
  useGetRegionsQuery,
  useGetShopsQuery,
  useListOrdersQuery,
  type AppStore,
  type PaginationEnvelope,
} from "@hub-store/api-client";
import { registerOrdersResources } from "../i18n";
import {
  buildFilterRequest,
  bulkActionsState,
  FILTER_URL_DEFAULTS,
  type OrdersFilterUrlState,
} from "../utils/filters";
import { buildRegionOptions } from "../utils/regions";
import { OrdersExpandContent } from "../features/OrdersExpandContent";
import { DeliveryTimeCell } from "../features/DeliveryTimeCell";
import { HubStoreTransferModal } from "../features/HubStoreTransferModal";
import { CreateOrderModal } from "../features/CreateOrderModal";
import { ImportOrdersModal } from "../features/ImportOrdersModal";
import { CreateBatchingModal } from "../batching/CreateBatchingModal";
import { useBatchOrdersQuery, useSearchBookingDetailQuery } from "../batching/deliveryBatchApi";
import { StatStrip } from "./StatStrip";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerOrdersResources();

/** Store per-remote — module singleton của bundle orders (createAppStore). */
const ordersStore: AppStore = createAppStore();

function D1Content() {
  const { t, i18n } = useTranslation("orders");
  const navigate = useNavigate();
  const statusLocale = (i18n.language ?? "vi").startsWith("vi") ? "vi" : "en";

  // Filter ↔ URL (reload giữ nguyên filter — acceptance D1)
  const [filters, setFilters] = useUrlState<OrdersFilterUrlState>(FILTER_URL_DEFAULTS);
  const request = useMemo(() => buildFilterRequest(filters), [filters]);

  const { data, isLoading, isFetching, refetch } = useListOrdersQuery(
    request as unknown as Record<string, unknown>,
  );
  const envelope = data as PaginationEnvelope<HubStoreOrderFilterItem> | undefined;
  const rows = envelope?.items ?? [];
  const total = envelope?.total ?? 0;

  const { data: regionsData } = useGetRegionsQuery();
  const { data: shopsData } = useGetShopsQuery();
  const regionOptions = useMemo(
    () => buildRegionOptions((regionsData as RegionsResponse | undefined)?.items ?? []),
    [regionsData],
  );
  const shopOptions = useMemo(
    () =>
      ((shopsData as ShopsResponse | undefined)?.items ?? []).map((s) => ({
        label: `${s.shopName} (${s.shopCode})`,
        value: s.shopCode,
      })),
    [shopsData],
  );

  const batchStatusOptions = useMemo(
    () =>
      Object.values(BATCH_STATUS).map((value) => ({
        label: STATUS_TAG_LABELS.batchStatus[value][statusLocale],
        value: String(value),
      })),
    [statusLocale],
  );
  const orderStatusOptions = useMemo(
    () =>
      Object.values(ORDER_STATUS).map((value) => ({
        label: STATUS_TAG_LABELS.orderStatus[value][statusLocale],
        value: String(value),
      })),
    [statusLocale],
  );

  // Selection + bulk
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const selectedRows = rows.filter((r) => selectedRowKeys.includes(r.fulfillCode));
  const sameShop =
    selectedRows.length > 0 &&
    selectedRows.every((r) => r.shopAssignment.shopCode === selectedRows[0].shopAssignment.shopCode);
  const bulk = bulkActionsState(selectedRows.length, sameShop);

  // Modals
  const [transferOrder, setTransferOrder] = useState<HubStoreOrderFilterItem | null>(null);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  // SF-13 — tạo đơn tay + nhập đơn file
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [importOrdersOpen, setImportOrdersOpen] = useState(false);

  // --- SF-16 (Task 6) — replan/rebook entry-point -----------------------------
  // D2 (fulfillment) navigate sang đây với ?nvcMode=replan|rebook&nvcBatchCode=
  // (cross-MF qua URL params — P0 plan-critic: KHÔNG import cross-app).
  const [nvcRequest, setNvcRequest] = useState<{
    mode: "replan" | "rebook";
    batchCode: string;
    entries: PlanningMapEntry[];
  } | null>(null);
  const [nvcModal, setNvcModal] = useState<{
    mode: "replan" | "rebook";
    batchCode: string;
    entries: PlanningMapEntry[];
    orders: HubStoreOrderFilterItem[];
  } | null>(null);

  // On mount — đọc params + xóa NGAY (replaceState) để refresh không mở lại.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nvcMode = params.get("nvcMode");
    const nvcBatchCode = params.get("nvcBatchCode");
    if ((nvcMode !== "replan" && nvcMode !== "rebook") || !nvcBatchCode) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (nvcMode === "rebook") {
      const entries = loadPlanningMap(nvcBatchCode);
      if (entries.length === 0) {
        message.info(t("nvc.rebook.noEntries"));
        return;
      }
      setNvcRequest({ mode: "rebook", batchCode: nvcBatchCode, entries });
    } else {
      setNvcRequest({ mode: "replan", batchCode: nvcBatchCode, entries: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: nvcBatchOrders } = useBatchOrdersQuery(nvcRequest?.batchCode ?? "", {
    skip: nvcRequest === null,
  });
  const nvcPlanningIds = (nvcRequest?.entries ?? []).map((e) => e.planningId).join(",");
  const { data: nvcBookingDetails } = useSearchBookingDetailQuery(nvcPlanningIds, {
    skip: nvcRequest?.mode !== "rebook" || nvcPlanningIds === "",
  });

  // Khi data đủ → build modal (chạy 1 lần — guard nvcModal tránh loop setState).
  useEffect(() => {
    if (nvcRequest === null || nvcModal !== null || !nvcBatchOrders) return;
    if (nvcRequest.mode === "replan") {
      // Replan — loại đơn FAILED (failReason do server set, như OrderExpandContent D7).
      const remaining = nvcBatchOrders.filter((o) => !o.failReason);
      if (remaining.length === 0) {
        message.info(t("nvc.replan.noOrders"));
        setNvcRequest(null);
        return;
      }
      setNvcModal({ ...nvcRequest, orders: remaining });
    } else {
      if (!nvcBookingDetails) return;
      // Rebook — planningIdsToRebook: booking null (đã confirm nhưng bị hủy) hoặc
      // booking CANCELLED. Planning BOOKED khác KHÔNG đụng (BE idempotent no-op).
      const bookingByPlanning = new Map(
        nvcBookingDetails.bookings.map((b) => [b.planningId, b.booking]),
      );
      const toRebook = nvcRequest.entries.filter((e) => {
        const b = bookingByPlanning.get(e.planningId);
        return b == null || b.status === "CANCELLED";
      });
      if (toRebook.length === 0) {
        message.info(t("nvc.rebook.noEntries"));
        setNvcRequest(null);
        return;
      }
      const codes = new Set(toRebook.map((e) => e.orderCode));
      setNvcModal({
        ...nvcRequest,
        entries: toRebook,
        orders: nvcBatchOrders.filter((o) => codes.has(o.fulfillCode)),
      });
    }
  }, [nvcRequest, nvcModal, nvcBatchOrders, nvcBookingDetails, t]);

  // Expand (controlled — nút "Chi tiết" toggle cùng hàng với icon expand)
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  const setFilter = (partial: Partial<OrdersFilterUrlState>) => {
    setFilters({ ...partial, page: "1" });
  };

  const handleReset = () => {
    setFilters({ ...FILTER_URL_DEFAULTS });
  };

  const toggleExpand = (code: string) => {
    setExpandedRowKeys((keys) =>
      keys.includes(code) ? keys.filter((k) => k !== code) : [...keys, code],
    );
  };

  const columns: ColumnsType<HubStoreOrderFilterItem> = [
    {
      title: t("columns.fulfillCode"),
      dataIndex: "fulfillCode",
      key: "fulfillCode",
      width: 120,
      fixed: "left",
      render: (code: string) => (
        <Typography.Text
          copyable={{ text: code, tooltips: [code, "Copied"] }}
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: DESIGN_TOKENS.color.textStrong,
            fontVariantNumeric: "tabular-nums",
          }}
          data-testid={`fulfill-code-${code}`}
        >
          {code}
        </Typography.Text>
      ),
    },
    {
      title: t("columns.batchStatus"),
      dataIndex: "batchStatus",
      key: "batchStatus",
      width: 180,
      render: (value: number) => <StatusTag kind="batchStatus" value={value} />,
    },
    {
      title: t("columns.shop"),
      key: "shop",
      width: 320,
      render: (_: unknown, record) => (
        <div>
          <div>{record.shopAssignment.shopName}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.shopAssignment.address}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t("columns.batchCode"),
      dataIndex: "batchCode",
      key: "batchCode",
      width: 150,
      render: (batchCode: string | undefined) =>
        batchCode ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            data-testid={`batch-link-${batchCode}`}
            // Cross-remote nav qua RRD singleton — D2 render là SF-9 (gate chỉ
            // assert navigation attempt / URL change).
            onClick={() => navigate("/hub-store-order/batch")}
          >
            {batchCode}
          </Button>
        ) : (
          t("common.empty")
        ),
    },
    {
      title: t("columns.originalTime"),
      key: "originalTime",
      width: 220,
      render: (_: unknown, record) => formatPeriodOfTime(record.originalTime.from, record.originalTime.to),
    },
    {
      title: t("columns.deliveryTime"),
      key: "deliveryTime",
      width: 230,
      render: (_: unknown, record) => <DeliveryTimeCell order={record} />,
    },
    {
      title: t("columns.actions"),
      key: "actions",
      render: (_: unknown, record) => (
        <Button type="link" size="small" onClick={() => toggleExpand(record.fulfillCode)}>
          {t("columns.detail")}
        </Button>
      ),
    },
  ];

  const pagination = {
    current: Number(filters.page) || 1,
    pageSize: Number(filters.pageSize) || 10,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (tTotal: number) => t("pagination.total", { total: tTotal }),
    onChange: (page: number, pageSize: number) => {
      // Selection chỉ hợp lệ trong trang đang hiển thị (server-side pagination —
      // selectedRows được filter từ rows trang hiện tại) → clear khi đổi trang
      // để bulk bar không tính sai số lượng/kho.
      setSelectedRowKeys([]);
      setFilters({ page: String(page), pageSize: String(pageSize) });
    },
  };

  return (
    <div style={{ padding: 0 }}>
      {/* Page-head — SF-6 §2.2: h1 21/700 + sub count · nút "Làm mới" ghost */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: DESIGN_TOKENS.typography.h1.fontSize,
              fontWeight: DESIGN_TOKENS.typography.h1.fontWeight,
              letterSpacing: DESIGN_TOKENS.typography.h1.letterSpacing,
              color: DESIGN_TOKENS.color.textStrong,
              margin: 0,
            }}
          >
            {t("page.title")}
          </h1>
          <div style={{ fontSize: 13, color: DESIGN_TOKENS.color.textMuted, marginTop: 4 }}>
            {t("page.subtitle", { total })}
          </div>
        </div>
        <Button onClick={() => void refetch()}>{t("action.refresh")}</Button>
      </div>

      {/* Stat-strip — SF-6 §2.2 (page-scoped, Deviation D2) */}
      {isLoading ? <StatStripSkeleton /> : <StatStrip items={rows} />}

      <FilterBar
        onSearch={() => setFilter({})}
        onReset={handleReset}
        searchLabel={t("filters.search")}
        resetLabel={t("filters.reset")}
      >
        <TextSearch
          value={filters.fulfillCode}
          onChange={(v) => setFilter({ fulfillCode: v })}
          placeholder={t("filters.fulfillCode")}
        />
        <MultiSelect
          value={filters.batchStatus}
          onChange={(v) => setFilter({ batchStatus: v })}
          options={batchStatusOptions}
          placeholder={t("filters.batchStatus")}
        />
        <DateTimeRange
          value={
            filters.deliveryFrom && filters.deliveryTo
              ? { from: filters.deliveryFrom, to: filters.deliveryTo }
              : null
          }
          onChange={(v) => setFilter({ deliveryFrom: v?.from ?? "", deliveryTo: v?.to ?? "" })}
          placeholder={[t("filters.deliveryTime"), t("filters.deliveryTime")]}
        />
        <MultiSelect
          value={filters.regionCodes}
          onChange={(v) => setFilter({ regionCodes: v })}
          // antd Select nhận grouped options ({label, options[]}) — FilterOption
          // type của shared chỉ phủ option phẳng → cast tại biên.
          options={regionOptions as unknown as FilterOption[]}
          placeholder={t("filters.address")}
        />
        <MultiSelect
          value={filters.shopCodes}
          onChange={(v) => setFilter({ shopCodes: v })}
          options={shopOptions}
          placeholder={t("filters.shop")}
        />
        <MultiSelect
          value={filters.orderStatus}
          onChange={(v) => setFilter({ orderStatus: v })}
          options={orderStatusOptions}
          placeholder={t("filters.orderStatus")}
        />
        <DateRange
          value={
            filters.createdFrom && filters.createdTo
              ? { from: filters.createdFrom, to: filters.createdTo }
              : null
          }
          onChange={(v) => setFilter({ createdFrom: v?.from ?? "", createdTo: v?.to ?? "" })}
          placeholder={[t("filters.createdAt"), t("filters.createdAt")]}
        />
        <DateTimeRange
          value={
            filters.originalFrom && filters.originalTo
              ? { from: filters.originalFrom, to: filters.originalTo }
              : null
          }
          onChange={(v) => setFilter({ originalFrom: v?.from ?? "", originalTo: v?.to ?? "" })}
          placeholder={[t("filters.originalTime"), t("filters.originalTime")]}
        />
      </FilterBar>

      {/* SF-13 — tạo đơn tay + nhập đơn (đứng trước bulk-bar) */}
      <Space style={{ marginTop: 12 }}>
        <Button
          data-testid="create-order-button"
          onClick={() => setCreateOrderOpen(true)}
        >
          {t("intake.createOrderButton")}
        </Button>
        <Button
          data-testid="import-orders-button"
          onClick={() => setImportOrdersOpen(true)}
        >
          {t("intake.importOrdersButton")}
        </Button>
      </Space>

      {selectedRowKeys.length > 0 && (
        <Space
          style={{
            marginTop: 12,
            width: "100%",
            background: DESIGN_TOKENS.color.primaryBg,
            borderBottom: `1px solid ${DESIGN_TOKENS.color.primaryBorder}`,
            borderRadius: `${DESIGN_TOKENS.radius.md}px ${DESIGN_TOKENS.radius.md}px 0 0`,
            padding: "12px 18px",
          }}
          data-testid="bulk-bar"
        >
          <Tooltip title={bulk.canCreateBatch ? undefined : t("bulk.hint")}>
            <Button
              type="primary"
              disabled={!bulk.canCreateBatch}
              onClick={() => setCreateBatchOpen(true)}
              data-testid="bulk-create-batch"
            >
              {t("bulk.createBatch")}
            </Button>
          </Tooltip>
          <Button
            disabled={!bulk.canTransfer}
            onClick={() => setTransferOrder(selectedRows[0] ?? null)}
            data-testid="bulk-transfer"
          >
            {t("bulk.transfer")}
          </Button>
          <Typography.Text type="secondary">{t("bulk.hint")}</Typography.Text>
        </Space>
      )}

      {/* Table card — SF-6 §2.2: radius 16, border, shadow.sm; refetch → mờ 0.6 */}
      <div
        style={{
          marginTop: 12,
          background: DESIGN_TOKENS.color.bgWhite,
          border: `1px solid ${DESIGN_TOKENS.color.divider}`,
          borderRadius: DESIGN_TOKENS.radius.card,
          boxShadow: DESIGN_TOKENS.shadow.sm,
          overflow: "hidden",
          transition: "opacity .15s ease",
          opacity: isFetching && !isLoading ? 0.6 : 1,
        }}
      >
        <Table<HubStoreOrderFilterItem>
          rowKey="fulfillCode"
          columns={columns}
          dataSource={rows}
          loading={isLoading}
          pagination={pagination}
          scroll={{ x: 1400 }}
          rowClassName={(record) =>
            selectedRowKeys.includes(record.fulfillCode) ? "sf6-row-selected" : ""
          }
          locale={{
            emptyText: (
              <EmptyState
                title={t("empty.title")}
                sub={t("empty.sub")}
                actionLabel={t("empty.clear")}
                onAction={handleReset}
              />
            ),
          }}
          expandable={{
          expandedRowKeys: [...expandedRowKeys],
          onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
          expandedRowRender: (record) => <OrdersExpandContent order={record} />,
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys([...keys]),
        }}
        />
      </div>

      <HubStoreTransferModal
        open={transferOrder !== null}
        order={transferOrder}
        onClose={() => setTransferOrder(null)}
      />
      <CreateBatchingModal
        open={createBatchOpen}
        orders={selectedRows}
        onClose={() => setCreateBatchOpen(false)}
      />
      {/* SF-16 (Task 6) — modal replan/rebook mở từ entry-point URL params */}
      {nvcModal !== null && (
        <CreateBatchingModal
          open
          mode={nvcModal.mode}
          orders={nvcModal.orders}
          batchCode={nvcModal.mode === "rebook" ? nvcModal.batchCode : undefined}
          rebookEntries={nvcModal.entries.length > 0 ? nvcModal.entries : undefined}
          // Clear CẢ nvcRequest — nếu chỉ clear nvcModal, effect build modal chạy lại
          // (deps đổi) và mount lại từ RTKQ cache → modal không thể đóng.
          onClose={() => { setNvcModal(null); setNvcRequest(null); }}
        />
      )}
      <CreateOrderModal open={createOrderOpen} onClose={() => setCreateOrderOpen(false)} />
      <ImportOrdersModal open={importOrdersOpen} onClose={() => setImportOrdersOpen(false)} />
    </div>
  );
}

/** Exposed root — tự cung cấp Redux store (store per-remote, spec §2). */
export default function D1Page() {
  return (
    <Provider store={ordersStore}>
      <D1Content />
    </Provider>
  );
}
