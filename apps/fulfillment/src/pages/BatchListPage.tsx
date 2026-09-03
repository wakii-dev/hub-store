import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Input,
  message,
  Modal,
  notification,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Provider } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PrinterOutlined } from "@ant-design/icons";
import moment from "moment";
import {
  BATCH_ENTITY_STATUS,
  DESIGN_TOKENS,
  EmptyState,
  DELIVERY_FAIL_REASON,
  DELIVERY_FAIL_REASON_LABELS,
  FilterBar,
  MultiSelect,
  StatusTag,
  TextSearch,
  formatPeriodOfTime,
  formatVnd,
  loadPlanningMap,
  usePermissions,
  useUrlState,
  type Batch,
  type BatchEntityStatus,
  type BatchingItem,
  type DeliveryCancelBatchResultDto,
  type HubStoreOrderFilterItem,
  type Locale,
  type Product,
} from "@hub-store/shared";
import {
  useCancelBatchMutation,
  useCompletePickingMutation,
  useFilterBatchesQuery,
  useGetBatchCriteriaQuery,
  useGetBatchOrdersQuery,
  useRedeliverOrderMutation,
} from "../api/batchesApi";
import { useConfirmBatchCodMutation, useGetCodPendingQuery } from "../api/codApi";
import {
  useCancelDeliveryBatchMutation,
  useCancelDeliveryOrderMutation,
} from "../api/deliveryBatchApi";
import { fulfillmentStore } from "../store";
import { registerFulfillmentResources } from "../i18n";
import RealtimeBridge from "../realtime/RealtimeBridge";
import { MarkFailModal } from "../features/MarkFailModal";
import { TrackingModal } from "../delivery/TrackingModal";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerFulfillmentResources();

const PAGE_SIZE = 10;
const DATE_FORMAT = "YYYY-MM-DD";

/** Message từ BFF error envelope (AxiosBaseQueryError.data = ErrorEnvelope). */
function errMessage(err: unknown): string {
  const e = err as { data?: { message?: string }; error?: string };
  return e?.data?.message ?? e?.error ?? "";
}

/**
 * rejectMessages — map error envelope → mảng message (pattern T3
 * extractRejectMessages của orders): details[].message ưu tiên, fallback
 * envelope message. Dùng cho 422 BE-authoritative (SF-16 hủy vận đơn).
 */
function rejectMessages(err: unknown, fallback: string): string[] {
  const data = (err as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return [fallback];
  const envelope = data as { details?: Array<{ message?: string }>; message?: string };
  const msgs = (envelope.details ?? [])
    .map((d) => (typeof d?.message === "string" ? d.message.trim() : ""))
    .filter((m) => m.length > 0);
  if (msgs.length > 0) return msgs;
  const m = (envelope.message ?? "").trim();
  return m ? [m] : [fallback];
}

/**
 * currentUserName — tên user cho auto-note hủy vận đơn. Remote KHÔNG có auth
 * context xuyên MF boundary (spec SF-6): username đọc từ user store oidc
 * client-ts persist trong localStorage (key `oidc.user:<authority>:<client_id>`,
 * shell đã đăng nhập cùng origin); fallback role từ usePermissions singleton.
 */
function currentUserName(role: string | null): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("oidc.user:")) {
        const raw = JSON.parse(localStorage.getItem(k) ?? "null") as {
          profile?: { preferred_username?: string };
        } | null;
        const u = raw?.profile?.preferred_username;
        if (u) return u;
      }
    }
  } catch {
    // corrupt entry → fallback role
  }
  return role ?? "system";
}

interface BatchRow {
  batch: Batch;
  item: BatchingItem;
  /** rowSpan cho CỘT ACTION (batch-level): 1 cell/phiếu, 0 = ẩn (antd rowSpan). */
  rowSpan: number;
  first: boolean;
}

/** Flatten page BatchDto[] → rows BatchingItem (items 1 batch liên tiếp). */
export function flattenBatches(batches: Batch[]): BatchRow[] {
  const rows: BatchRow[] = [];
  for (const batch of batches) {
    batch.items.forEach((item, i) => {
      rows.push({ batch, item, rowSpan: i === 0 ? batch.items.length : 0, first: i === 0 });
    });
  }
  return rows;
}

function ProductTable({ products }: { products: Product[] }) {
  const { t } = useTranslation("fulfillment");
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="productCode"
      dataSource={products}
      data-testid="product-table"
      columns={[
        { title: t("expand.productCode"), dataIndex: "productCode" },
        { title: t("expand.productName"), dataIndex: "productName" },
        { title: t("expand.quantity"), dataIndex: "quantity" },
      ]}
    />
  );
}

/**
 * Expand content 1 đơn (D7): product table + exception UI.
 *
 * Hydration: GET /orders/by-batch/:batchCode (BFF owns aggregation — plan T8).
 * BFF trả HubStoreOrderFilterItem[] THEO THỨ TỰ codes yêu cầu (repo
 * findByCodes giữ order, bỏ code lạ) → join theo index với batch.items.
 * FAILED = có failReason (server set khi markOrderFailed; gate cuối ở server).
 */
function OrderExpandContent({
  record,
  onMarkFail,
  onTrackOrder,
}: {
  record: BatchRow;
  onMarkFail: (orderCode: string) => void;
  onTrackOrder: (orderCode: string) => void;
}) {
  const { t, i18n } = useTranslation("fulfillment");
  const locale: Locale = i18n.language.startsWith("vi") ? "vi" : "en";
  const { batch, item } = record;
  const { data: orders, refetch: refetchOrders } = useGetBatchOrdersQuery(batch.batchCode);
  const [redeliverOrder, { isLoading: redelivering }] = useRedeliverOrderMutation();
  // SF-16 Task 7 — hủy vận đơn per-đơn: gate theo planning map (flow TRUCK đã save).
  const { role } = usePermissions();
  const [cancelDeliveryOrder] = useCancelDeliveryOrderMutation();
  const planningEntry = useMemo(
    () => loadPlanningMap(batch.batchCode).find((e) => e.orderCode === item.orderCode),
    [batch.batchCode, item.orderCode],
  );
  const [cancelDeliveryOpen, setCancelDeliveryOpen] = useState(false);
  const [cancelDeliveryReason, setCancelDeliveryReason] = useState("");

  const index = batch.items.findIndex((i) => i.orderCode === item.orderCode);
  const order: HubStoreOrderFilterItem | undefined = index >= 0 ? orders?.[index] : undefined;
  const failed = Boolean(order?.failReason);

  // failReason từ BFF là enum-name string (KHACH_VANG | ...) → label qua shared map.
  const reasonNum = order?.failReason
    ? DELIVERY_FAIL_REASON[order.failReason as keyof typeof DELIVERY_FAIL_REASON]
    : undefined;
  const reasonLabel =
    order?.failReason && reasonNum !== undefined
      ? DELIVERY_FAIL_REASON_LABELS[reasonNum][locale]
      : order?.failReason;

  const handleRedeliver = async () => {
    try {
      const resp = await redeliverOrder({ code: item.orderCode }).unwrap();
      message.success(t("exception.redeliverSuccess", { code: resp.fulfillCode }));
    } catch (err) {
      // Double-redeliver (server 422 INVALID_ARGUMENT) hoặc lỗi khác — message envelope.
      message.error(`${t("exception.actionFailed")}: ${errMessage(err)}`);
    }
  };

  const openCancelDelivery = () => {
    // Auto-note prefill (editable) — username hiện tại + batchCode/orderCode.
    setCancelDeliveryReason(
      t("cancelDelivery.autoNote", {
        user: currentUserName(role),
        scope: `${batch.batchCode}/${item.orderCode}`,
      }),
    );
    setCancelDeliveryOpen(true);
  };

  const handleCancelDelivery = async () => {
    if (!planningEntry) return;
    try {
      const resp = await cancelDeliveryOrder({
        planningId: planningEntry.planningId,
        reason: cancelDeliveryReason.trim(),
      }).unwrap();
      notification.success({ message: t("cancelDelivery.success", { code: resp.planningId }) });
      setCancelDeliveryOpen(false);
      void refetchOrders();
    } catch (err) {
      // 422 BE-authoritative (VD booking COMPLETED) — details[].message (Task 7.3).
      notification.error({
        message: t("cancelDelivery.failed"),
        description: rejectMessages(err, t("cancelDelivery.failed")).join("; "),
      });
    }
  };

  return (
    <div data-testid={`order-expand-${item.orderCode}`}>
      <Space size={4} wrap align="center" style={{ marginBottom: 8 }}>
        {failed && reasonLabel && (
          <Tag color="error" data-testid={`fail-tag-${item.orderCode}`}>
            {reasonLabel}
          </Tag>
        )}
        {order?.failNote && (
          <Typography.Text type="secondary">{order.failNote}</Typography.Text>
        )}
        {!failed && (
          <Button
            size="small"
            danger
            data-testid={`mark-fail-button-${item.orderCode}`}
            onClick={() => onMarkFail(item.orderCode)}
          >
            {t("exception.markFail")}
          </Button>
        )}
        {failed && (
          <Button
            size="small"
            loading={redelivering}
            data-testid={`redeliver-button-${item.orderCode}`}
            onClick={() => void handleRedeliver()}
          >
            {t("exception.redeliver")}
          </Button>
        )}
        {planningEntry && (
          <Button
            size="small"
            danger
            data-testid={`cancel-delivery-${item.orderCode}`}
            onClick={openCancelDelivery}
          >
            {t("action.cancelDelivery")}
          </Button>
        )}
        {planningEntry && (
          <Button
            size="small"
            data-testid={`order-track-${item.orderCode}`}
            onClick={() => onTrackOrder(item.orderCode)}
          >
            {t("action.tracking")}
          </Button>
        )}
      </Space>
      <ProductTable products={item.items} />
      <Modal
        open={cancelDeliveryOpen}
        title={t("cancelDelivery.title", { code: item.orderCode })}
        okText={t("cancelDelivery.ok")}
        okButtonProps={{ danger: true, disabled: !cancelDeliveryReason.trim() }}
        cancelText={t("action.reset")}
        onOk={() => void handleCancelDelivery()}
        onCancel={() => setCancelDeliveryOpen(false)}
        destroyOnClose
      >
        <Typography.Paragraph>{t("cancelDelivery.reasonLabel")}:</Typography.Paragraph>
        <Input.TextArea
          value={cancelDeliveryReason}
          onChange={(e) => setCancelDeliveryReason(e.target.value)}
          rows={3}
        />
      </Modal>
    </div>
  );
}

/**
 * SF-14 D2 — badge + bulk confirm COD cho 1 phiếu COMPLETED.
 * Mount CHỈ khi batch COMPLETED (caller guard) → query /cod/pending chạy đúng
 * phiếu cần. pendingCount = 0 → ẩn cả cụm (badge "biến mất" sau confirm).
 * Element mới testid `cod-*` — KHÔNG đụng testid/DOM hiện có (E2E dependency).
 */
function CodBatchActions({ batchCode }: { batchCode: string }) {
  const { t } = useTranslation("fulfillment");
  const { data, isLoading, refetch } = useGetCodPendingQuery(batchCode);
  const [confirmBatchCod, { isLoading: confirming }] = useConfirmBatchCodMutation();

  const pending = data?.pendingCount ?? 0;
  if (isLoading || pending === 0) return null;

  const handleConfirm = () => {
    Modal.confirm({
      title: t("cod.confirmTitle", { code: batchCode }),
      content: t("cod.confirmContent", { count: pending }),
      okText: t("cod.confirmButton"),
      cancelText: t("action.reset"),
      onOk: async () => {
        try {
          const resp = await confirmBatchCod({ batchCode }).unwrap();
          message.success(
            t("cod.success", { code: batchCode, count: resp.confirmedCount }),
          );
          await refetch();
        } catch (err) {
          message.error(`${t("cod.failed")}: ${errMessage(err)}`);
        }
      },
    });
  };

  return (
    <Space size={4} align="center" data-testid={`cod-actions-${batchCode}`}>
      <Tag color="warning" data-testid={`cod-badge-${batchCode}`}>
        {t("cod.pendingBadge", { count: pending })}
      </Tag>
      <Button size="small" type="primary" loading={confirming} onClick={handleConfirm}>
        {t("cod.confirmButton")}
      </Button>
    </Space>
  );
}

/**
 * SF-24 Task 4 — wrapper tracking modal: wire stopMeta (address + COD) cho tab
 * bản đồ. Nguồn = useGetBatchOrdersQuery CÙNG batch (cache RTKQ dùng chung với
 * expand row — KHÔNG thêm endpoint fetch mới). Key Record là
 * batch.items[].orderCode: by-batch orders trả fulfillCode TRÙNG GIÁ TRỊ
 * (BFF GET /orders/by-batch truyền item.orderCodes làm fulfillCodes cho
 * getOrdersByCodes — intake.ts), nên join theo giá trị chứ KHÔNG theo index.
 */
function TrackingModalWithMeta({
  target,
  onClose,
}: {
  target: { batchCode: string; planningIds: string[]; orderCode?: string };
  onClose: () => void;
}) {
  const { data: batchOrders } = useGetBatchOrdersQuery(target.batchCode);
  const stopMeta = useMemo(() => {
    const meta: Record<string, { address?: string; cod?: number }> = {};
    for (const o of batchOrders ?? []) {
      meta[o.fulfillCode] = { address: o.customerAddress, cod: o.codAmount };
    }
    return meta;
  }, [batchOrders]);
  return (
    <TrackingModal
      open
      batchCode={target.batchCode}
      planningIds={target.planningIds}
      orderCode={target.orderCode}
      stopMeta={stopMeta}
      onClose={onClose}
    />
  );
}

/** Exposed qua federation là `fulfillment/BatchListPage` → route /hub-store-order/batch. */
export default function BatchListPage() {
  return (
    <Provider store={fulfillmentStore}>
      {/* SF-10: SSE bridge — invalidate Fulfillment/Batches khi BFF forward event. */}
      <RealtimeBridge />
      <BatchListPageInner />
    </Provider>
  );
}

function BatchListPageInner() {
  const { t, i18n } = useTranslation("fulfillment");
  const locale: Locale = i18n.language.startsWith("vi") ? "vi" : "en";
  const navigate = useNavigate();

  // 3 filters ↔ URL (reload giữ filter — useUrlState: array comma-joined).
  const [filters, setFilters] = useUrlState({
    search: "",
    status: [] as string[],
    createdAt: "",
  });
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch } = useFilterBatchesQuery({
    searchText: filters.search || undefined,
    status: filters.status.length
      ? (filters.status.map(Number) as BatchEntityStatus[])
      : undefined,
    createdAt: filters.createdAt || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: criteria } = useGetBatchCriteriaQuery();
  const [cancelBatch, { isLoading: cancelling }] = useCancelBatchMutation();
  const [completePicking, { isLoading: completing }] = useCompletePickingMutation();
  // SF-16 Task 7 — hủy vận đơn cả phiếu (delivery-batch API, KHÔNG đụng cancel legacy).
  const [cancelDeliveryBatch] = useCancelDeliveryBatchMutation();
  const { role } = usePermissions();

  // Hủy phiếu — modal confirm + reason (bắt buộc).
  const [cancelTarget, setCancelTarget] = useState<Batch | null>(null);
  const [reason, setReason] = useState("");

  // Hủy vận đơn (cả phiếu) — modal reason + modal kết quả per-planning (partial).
  const [cancelDeliveryTarget, setCancelDeliveryTarget] = useState<Batch | null>(null);
  const [cancelDeliveryReason, setCancelDeliveryReason] = useState("");
  const [deliveryCancelResults, setDeliveryCancelResults] = useState<{
    batchCode: string;
    results: DeliveryCancelBatchResultDto[];
    cancelledCount: number;
  } | null>(null);

  // Mark thất bại (D7) — mã đơn đang mở modal (mount theo điều kiện → reset state).
  const [failTarget, setFailTarget] = useState<string | null>(null);

  // SF-16 Task 8 — tracking modal: full batch (orderCode rỗng) hoặc 1 đơn.
  const [tracking, setTracking] = useState<{
    batchCode: string;
    planningIds: string[];
    orderCode?: string;
  } | null>(null);

  const batches = data?.items ?? [];
  const total = data?.total ?? 0;
  const rows = useMemo(() => flattenBatches(batches), [data]);
  const cancellable = criteria?.cancellableStatuses ?? [];

  const statusOptions = [
    { value: String(BATCH_ENTITY_STATUS.ACTIVE), label: t("status.active") },
    { value: String(BATCH_ENTITY_STATUS.COMPLETED), label: t("status.completed") },
    { value: String(BATCH_ENTITY_STATUS.CANCELLED), label: t("status.cancelled") },
  ];

  const updateFilter = (partial: Parameters<typeof setFilters>[0]) => {
    setFilters(partial);
    setPage(1);
  };

  const handleCancelOk = async () => {
    if (!cancelTarget) return;
    try {
      await cancelBatch({ code: cancelTarget.batchCode, reason: reason.trim() }).unwrap();
      message.success(t("cancel.success", { code: cancelTarget.batchCode }));
      setCancelTarget(null);
    } catch (err) {
      // Backend reject (phiếu COMPLETED v.v.) — message từ error envelope (spec §3.1).
      message.error(`${t("cancel.failed")}: ${errMessage(err)}`);
    }
  };

  const openCancelDeliveryBatch = (batch: Batch) => {
    setCancelDeliveryTarget(batch);
    setCancelDeliveryReason(
      t("cancelDelivery.autoNote", { user: currentUserName(role), scope: batch.batchCode }),
    );
  };

  const handleCancelDeliveryBatch = async () => {
    if (!cancelDeliveryTarget) return;
    const code = cancelDeliveryTarget.batchCode;
    try {
      const resp = await cancelDeliveryBatch({
        batchCode: code,
        reason: cancelDeliveryReason.trim(),
      }).unwrap();
      // Per-planning results (CANCELLED/DRAFT) — partial-failure hiển thị từng dòng.
      setDeliveryCancelResults({
        batchCode: code,
        results: resp.results,
        cancelledCount: resp.cancelledCount,
      });
      setCancelDeliveryTarget(null);
    } catch (err) {
      // 422 BE-authoritative — details[].message (Task 7.3).
      notification.error({
        message: t("cancelDelivery.failed"),
        description: rejectMessages(err, t("cancelDelivery.failed")).join("; "),
      });
    }
  };

  const handleComplete = (batch: Batch) => {
    Modal.confirm({
      title: t("complete.title"),
      content: t("complete.content", { code: batch.batchCode }),
      okText: t("complete.ok"),
      cancelText: t("action.reset"),
      onOk: async () => {
        try {
          await completePicking({ batchCode: batch.batchCode }).unwrap();
          message.success(t("complete.success", { code: batch.batchCode }));
        } catch (err) {
          message.error(`${t("complete.failed")}: ${errMessage(err)}`);
        }
      },
    });
  };

  const columns: ColumnsType<BatchRow> = [
    { title: t("col.stopOrder"), dataIndex: ["item", "stopOrder"], width: 90 },
    { title: t("col.orderCode"), dataIndex: ["item", "orderCode"], width: 130 },
    { title: t("col.address"), dataIndex: ["item", "customerAddress"], ellipsis: true },
    {
      title: t("col.distance"),
      key: "distance",
      width: 100,
      render: (_, r) => `${r.item.distance} km`,
    },
    {
      title: t("col.deliveryTime"),
      key: "deliveryTime",
      width: 260,
      render: (_, r) => formatPeriodOfTime(r.item.fromDeliveryTime, r.item.toDeliveryTime, locale),
    },
    {
      title: t("col.orderStatus"),
      key: "orderStatus",
      width: 130,
      render: (_, r) => <StatusTag kind="orderStatus" value={r.item.orderStatus} locale={locale} />,
    },
    { title: t("col.quantity"), dataIndex: ["item", "totalQuantity"], width: 100 },
    {
      title: t("col.cod"),
      key: "cod",
      width: 140,
      render: (_, r) => formatVnd(r.item.codAmount, locale),
    },
    {
      title: t("col.actions"),
      key: "actions",
      width: 230,
      onCell: (record) => ({ rowSpan: record.rowSpan }),
      render: (_, record) => {
        if (!record.first) return null;
        const { batch } = record;
        const canCancel = cancellable.includes(batch.status);
        return (
          <Space direction="vertical" size={6} data-testid={`batch-actions-${batch.batchCode}`}>
            <Space size={4} align="center">
              <Typography.Text type="secondary">{t("batch.status")}:</Typography.Text>
              <StatusTag kind="batchEntityStatus" value={batch.status} locale={locale} />
            </Space>
            <Space size={4} wrap>
              <Button
                size="small"
                danger
                disabled={!canCancel}
                loading={cancelling}
                onClick={() => {
                  setCancelTarget(batch);
                  setReason("");
                }}
              >
                {t("action.cancel")}
              </Button>
              {batch.status === BATCH_ENTITY_STATUS.ACTIVE && (
                <Button
                  size="small"
                  type="primary"
                  loading={completing}
                  onClick={() => handleComplete(batch)}
                >
                  {t("action.complete")}
                </Button>
              )}
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={() =>
                  navigate(`/hub-store-order/batch/print?batchCode=${encodeURIComponent(batch.batchCode)}`)
                }
              >
                {t("action.print")}
              </Button>
              {/* SF-14 — COD chờ thu: chỉ phiếu COMPLETED có PENDING mới render. */}
              {batch.status === BATCH_ENTITY_STATUS.COMPLETED && (
                <CodBatchActions batchCode={batch.batchCode} />
              )}
              {/* SF-16 §2.5 (Task 6) — replan/rebook: cross-MF qua URL params →
                  D1Page (orders remote) đọc + mở modal tương ứng. KHÔNG đụng
                  3 nút legacy ở trên. */}
              {batch.status === BATCH_ENTITY_STATUS.CANCELLED && (
                <Button
                  size="small"
                  data-testid={`batch-replan-${batch.batchCode}`}
                  onClick={() =>
                    navigate(
                      `/hub-store-order/order?nvcMode=replan&nvcBatchCode=${encodeURIComponent(batch.batchCode)}`,
                    )
                  }
                >
                  {t("action.replan")}
                </Button>
              )}
              {batch.status === BATCH_ENTITY_STATUS.ACTIVE &&
                loadPlanningMap(batch.batchCode).length > 0 && (
                  <Button
                    size="small"
                    data-testid={`batch-rebook-${batch.batchCode}`}
                    onClick={() =>
                      navigate(
                        `/hub-store-order/order?nvcMode=rebook&nvcBatchCode=${encodeURIComponent(batch.batchCode)}`,
                      )
                    }
                  >
                    {t("action.rebook")}
                  </Button>
                )}
              {/* SF-16 §2.6 (Task 7) — hủy vận đơn cả phiếu: ACTIVE + map có entries.
                  KHÔNG đụng nút "Hủy phiếu" legacy ở trên (label phân biệt rõ). */}
              {batch.status === BATCH_ENTITY_STATUS.ACTIVE &&
                loadPlanningMap(batch.batchCode).length > 0 && (
                  <Button
                    size="small"
                    danger
                    data-testid={`cancel-delivery-batch-${batch.batchCode}`}
                    onClick={() => openCancelDeliveryBatch(batch)}
                  >
                    {t("action.cancelDeliveryBatch")}
                  </Button>
                )}
              {/* SF-16 §2.7 (Task 8) — tracking modal full batch (planning map gate). */}
              {batch.status === BATCH_ENTITY_STATUS.ACTIVE &&
                loadPlanningMap(batch.batchCode).length > 0 && (
                  <Button
                    size="small"
                    data-testid={`batch-track-${batch.batchCode}`}
                    onClick={() =>
                      setTracking({
                        batchCode: batch.batchCode,
                        planningIds: loadPlanningMap(batch.batchCode).map((e) => e.planningId),
                      })
                    }
                  >
                    {t("action.tracking")}
                  </Button>
                )}
            </Space>
          </Space>
        );
      },
    },
  ];

  return (
    <div data-probe="fulfillment" style={{ padding: 0 }}>
      {/* Page-head — SF-6 §2.2: h1 tokens + sub count */}
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
          {t("page.batch.title")}
        </h1>
        <div style={{ fontSize: 13, color: DESIGN_TOKENS.color.textMuted, marginTop: 4 }}>
          {total} phiếu
        </div>
      </div>

      <FilterBar
        onSearch={() => refetch()}
        onReset={() => updateFilter({ search: "", status: [], createdAt: "" })}
        searchLabel={t("action.search")}
        resetLabel={t("action.reset")}
      >
        <TextSearch
          value={filters.search}
          onChange={(v) => updateFilter({ search: v })}
          placeholder={t("filter.search.placeholder")}
        />
        <MultiSelect
          value={filters.status}
          onChange={(v) => updateFilter({ status: v })}
          options={statusOptions}
          placeholder={t("filter.status.placeholder")}
        />
        <DatePicker
          style={{ width: "100%" }}
          value={filters.createdAt ? moment(filters.createdAt, DATE_FORMAT) : null}
          onChange={(_, dateStr) => updateFilter({ createdAt: (dateStr as string) || "" })}
          placeholder={t("filter.createdAt.placeholder")}
          allowClear
        />
      </FilterBar>

      {/* Table card — SF-6 §2.2: white card radius card + shadow.sm */}
      <div
        style={{
          marginTop: 16,
          background: DESIGN_TOKENS.color.bgWhite,
          border: `1px solid ${DESIGN_TOKENS.color.divider}`,
          borderRadius: DESIGN_TOKENS.radius.card,
          boxShadow: DESIGN_TOKENS.shadow.sm,
          overflow: "hidden",
        }}
      >
        <Table<BatchRow>
          style={{ padding: 0 }}
          rowKey={(r) => `${r.item.batchCode}-${r.item.orderCode}`}
          size="middle"
          loading={isLoading || isFetching}
          dataSource={rows}
          columns={columns}
          locale={{
            emptyText: (
              <EmptyState
                title={t("empty.title")}
                sub={t("empty.sub")}
                actionLabel={t("action.reset")}
                onAction={() => updateFilter({ search: "", status: [], createdAt: "" })}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
          expandable={{
            expandedRowRender: (record) => (
              <OrderExpandContent
                record={record}
                onMarkFail={setFailTarget}
                onTrackOrder={(orderCode) =>
                  setTracking({
                    batchCode: record.batch.batchCode,
                    planningIds: loadPlanningMap(record.batch.batchCode).map((e) => e.planningId),
                    orderCode,
                  })
                }
              />
            ),
          }}
        />
      </div>

      <Modal
        open={cancelTarget !== null}
        title={t("cancel.title", { code: cancelTarget?.batchCode ?? "" })}
        okText={t("cancel.ok")}
        okButtonProps={{ danger: true, disabled: !reason.trim(), loading: cancelling }}
        cancelText={t("action.reset")}
        onOk={handleCancelOk}
        onCancel={() => setCancelTarget(null)}
        destroyOnClose
      >
        <Typography.Paragraph>{t("cancel.reasonLabel")}:</Typography.Paragraph>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("cancel.reasonPlaceholder")}
          rows={3}
        />
      </Modal>

      {failTarget !== null && (
        <MarkFailModal open orderCode={failTarget} onClose={() => setFailTarget(null)} />
      )}

      {/* SF-16 Task 8 — tracking modal (timeline 2 cột BE | PARTNER).
          SF-24 Task 4 — wrapper wire stopMeta cho tab bản đồ. */}
      {tracking && (
        <TrackingModalWithMeta target={tracking} onClose={() => setTracking(null)} />
      )}

      {/* SF-16 Task 7 — modal reason hủy vận đơn cả phiếu (auto-note prefill). */}
      <Modal
        open={cancelDeliveryTarget !== null}
        title={t("cancelDelivery.batchTitle", { code: cancelDeliveryTarget?.batchCode ?? "" })}
        okText={t("cancelDelivery.ok")}
        okButtonProps={{ danger: true, disabled: !cancelDeliveryReason.trim() }}
        cancelText={t("action.reset")}
        onOk={() => void handleCancelDeliveryBatch()}
        onCancel={() => setCancelDeliveryTarget(null)}
        destroyOnClose
      >
        <Typography.Paragraph>{t("cancelDelivery.reasonLabel")}:</Typography.Paragraph>
        <Input.TextArea
          value={cancelDeliveryReason}
          onChange={(e) => setCancelDeliveryReason(e.target.value)}
          rows={3}
        />
      </Modal>

      {/* Kết quả hủy per-planning — partial-failure hiển thị từng dòng, không fail im lặng. */}
      <Modal
        open={deliveryCancelResults !== null}
        title={t("cancelDelivery.resultsTitle", { code: deliveryCancelResults?.batchCode ?? "" })}
        footer={
          <Button onClick={() => setDeliveryCancelResults(null)}>
            {t("cancelDelivery.close")}
          </Button>
        }
        onCancel={() => setDeliveryCancelResults(null)}
        destroyOnClose
      >
        {deliveryCancelResults && (
          <>
            <Alert
              style={{ marginBottom: 12 }}
              type={deliveryCancelResults.cancelledCount < deliveryCancelResults.results.length ? "warning" : "success"}
              showIcon
              message={t("cancelDelivery.resultsCancelledCount", {
                count: deliveryCancelResults.cancelledCount,
                total: deliveryCancelResults.results.length,
              })}
            />
            <Table
              size="small"
              pagination={false}
              rowKey="planningId"
              data-testid="cancel-delivery-results"
              dataSource={deliveryCancelResults.results}
              columns={[
                { title: t("cancelDelivery.planningId"), dataIndex: "planningId" },
                { title: t("cancelDelivery.status"), dataIndex: "status" },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
