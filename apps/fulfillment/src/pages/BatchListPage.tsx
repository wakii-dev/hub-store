import { useMemo, useState } from "react";
import {
  Button,
  DatePicker,
  Input,
  message,
  Modal,
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
  DELIVERY_FAIL_REASON,
  DELIVERY_FAIL_REASON_LABELS,
  FilterBar,
  MultiSelect,
  StatusTag,
  TextSearch,
  formatPeriodOfTime,
  formatVnd,
  useUrlState,
  type Batch,
  type BatchEntityStatus,
  type BatchingItem,
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
import { fulfillmentStore } from "../store";
import { registerFulfillmentResources } from "../i18n";
import { MarkFailModal } from "../features/MarkFailModal";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerFulfillmentResources();

const PAGE_SIZE = 10;
const DATE_FORMAT = "YYYY-MM-DD";

/** Message từ BFF error envelope (AxiosBaseQueryError.data = ErrorEnvelope). */
function errMessage(err: unknown): string {
  const e = err as { data?: { message?: string }; error?: string };
  return e?.data?.message ?? e?.error ?? "";
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
}: {
  record: BatchRow;
  onMarkFail: (orderCode: string) => void;
}) {
  const { t, i18n } = useTranslation("fulfillment");
  const locale: Locale = i18n.language.startsWith("vi") ? "vi" : "en";
  const { batch, item } = record;
  const { data: orders } = useGetBatchOrdersQuery(batch.batchCode);
  const [redeliverOrder, { isLoading: redelivering }] = useRedeliverOrderMutation();

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
      </Space>
      <ProductTable products={item.items} />
    </div>
  );
}

/** Exposed qua federation là `fulfillment/BatchListPage` → route /hub-store-order/batch. */
export default function BatchListPage() {
  return (
    <Provider store={fulfillmentStore}>
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

  // Hủy phiếu — modal confirm + reason (bắt buộc).
  const [cancelTarget, setCancelTarget] = useState<Batch | null>(null);
  const [reason, setReason] = useState("");

  // Mark thất bại (D7) — mã đơn đang mở modal (mount theo điều kiện → reset state).
  const [failTarget, setFailTarget] = useState<string | null>(null);

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
            </Space>
          </Space>
        );
      },
    },
  ];

  return (
    <div data-probe="fulfillment" style={{ padding: 16 }}>
      <Typography.Title level={4}>{t("page.batch.title")}</Typography.Title>

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

      <Table<BatchRow>
        style={{ marginTop: 16 }}
        rowKey={(r) => `${r.item.batchCode}-${r.item.orderCode}`}
        size="middle"
        loading={isLoading || isFetching}
        dataSource={rows}
        columns={columns}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => setPage(p),
        }}
        expandable={{
          expandedRowRender: (record) => (
            <OrderExpandContent record={record} onMarkFail={setFailTarget} />
          ),
        }}
      />

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
    </div>
  );
}
