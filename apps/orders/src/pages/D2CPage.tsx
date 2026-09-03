/**
 * D2CPage — "D2C / Dropship" (/hub-store-order/d2c, SF-18 FI-263).
 * Exposed qua federation là `orders/D2CPage`.
 *
 * MF: tự bọc <Provider store> (store per-remote d2cStore — pattern D1Page,
 * api-client là federation singleton). Read-only-ngoài-note: list + filter
 * đa chiều + expand + note modal + export CSV ≤31 ngày (client guard cùng
 * công thức BFF — routes/d2c.ts exportRangeDays).
 */
import { useMemo, useState } from "react";
import { Button, DatePicker, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { Provider } from "react-redux";
import moment from "moment";
import {
  DateRange,
  DateTimeRange,
  FilterBar,
  MultiSelect,
  TextSearch,
  useUrlState,
} from "@hub-store/shared";
import {
  createAppStore,
  fetchD2cOrdersExport,
  useListD2cOrdersQuery,
  type AppStore,
  type PaginationEnvelope,
} from "@hub-store/api-client";
import {
  D2C_CARRIER_OPTIONS,
  D2C_CATEGORY_OPTIONS,
  D2C_SHOP_OPTIONS,
  D2C_STATUSES,
  D2C_TYPE_OPTIONS,
  D2C_FILTER_URL_DEFAULTS,
  buildD2cFilterRequest,
  isValidD2cExportRange,
  type D2cFilterUrlStateShape,
} from "../utils/d2cFilters";
import type { D2cOrderItem } from "../utils/d2cItem";
import { formatVnTime } from "../utils/d2cItem";
import { D2cExpandContent } from "../features/D2cExpandContent";
import { D2cNoteModal } from "../features/D2cNoteModal";

/** Store per-remote — module singleton của bundle orders. */
const d2cStore: AppStore = createAppStore();

/** Status → màu antd Tag (spec T6: pending default/pushed processing/exported success/cancelled error). */
const STATUS_TAG_COLOR: Record<string, string | undefined> = {
  pending: undefined, // default
  pushed: "processing",
  exported: "success",
  cancelled: "error",
};

/** TimeRange — khung giờ đẩy (HH:mm–HH:mm). Controlled value là string ở biên
 * (URL-friendly — pattern DateRange của shared); moment convert nội bộ. */
function TimeRange(props: {
  value: { from: string; to: string } | null;
  onChange: (value: { from: string; to: string } | null) => void;
  placeholder?: [string, string];
}) {
  const momentValue: [moment.Moment, moment.Moment] | null =
    props.value && props.value.from && props.value.to
      ? [moment(props.value.from, "HH:mm"), moment(props.value.to, "HH:mm")]
      : null;
  return (
    <DatePicker.RangePicker
      style={{ width: "100%" }}
      picker="time"
      format="HH:mm"
      value={momentValue}
      placeholder={props.placeholder}
      onChange={(_, timeStrings) => {
        const [from, to] = timeStrings;
        props.onChange(from && to ? { from, to } : null);
      }}
    />
  );
}

function D2CContent() {
  const { t } = useTranslation("d2c");

  // Filter ↔ URL (reload giữ nguyên filter — pattern D1)
  const [filters, setFilters] = useUrlState<D2cFilterUrlStateShape>(D2C_FILTER_URL_DEFAULTS);
  const request = useMemo(() => buildD2cFilterRequest(filters), [filters]);

  const { data, isLoading, isFetching } = useListD2cOrdersQuery(
    request as unknown as Record<string, unknown>,
  );
  const envelope = data as PaginationEnvelope<D2cOrderItem> | undefined;
  const rows = envelope?.items ?? [];
  const total = envelope?.total ?? 0;

  const statusOptions = useMemo(
    () => D2C_STATUSES.map((value) => ({ label: t(`status.${value}`), value })),
    [t],
  );
  const carrierOptions = useMemo(
    () => D2C_CARRIER_OPTIONS.map((value) => ({ label: value, value })),
    [],
  );
  const shopOptions = useMemo(() => D2C_SHOP_OPTIONS.map((value) => ({ label: value, value })), []);
  const categoryOptions = useMemo(
    () => D2C_CATEGORY_OPTIONS.map((value) => ({ label: value, value })),
    [],
  );
  const typeOptions = useMemo(() => D2C_TYPE_OPTIONS.map((value) => ({ label: value, value })), []);

  // Expand (controlled — nút "Chi tiết" toggle cùng hàng với icon expand)
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  // Note modal — mở từ row action hoặc expand content
  const [noteOrder, setNoteOrder] = useState<D2cOrderItem | null>(null);

  // Export range (date-only YYYY-MM-DD — guard ≤31 ngày trước khi gọi API)
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const setFilter = (partial: Partial<D2cFilterUrlStateShape>) => {
    setFilters({ ...partial, page: "1" });
  };

  const handleReset = () => {
    setFilters({ ...D2C_FILTER_URL_DEFAULTS });
  };

  const toggleExpand = (code: string) => {
    setExpandedRowKeys((keys) =>
      keys.includes(code) ? keys.filter((k) => k !== code) : [...keys, code],
    );
  };

  const handleExport = async () => {
    if (!isValidD2cExportRange(exportFrom, exportTo)) {
      message.error(t("export.errorRange"));
      return;
    }
    setExporting(true);
    try {
      const result = await fetchD2cOrdersExport(exportFrom, exportTo);
      if (!result.ok || !result.blob) {
        message.error(result.message ?? t("export.error"));
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `D2C_Order_${exportFrom}_${exportTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<D2cOrderItem> = [
    {
      title: t("columns.orderCode"),
      dataIndex: "orderCode",
      key: "orderCode",
      width: 150,
      fixed: "left",
      render: (code: string) => (
        <Typography.Text copyable={{ text: code, tooltips: [code, "Copied"] }} data-testid={`d2c-order-code-${code}`}>
          {code}
        </Typography.Text>
      ),
    },
    {
      title: t("columns.deliveryId"),
      dataIndex: "deliveryId",
      key: "deliveryId",
      width: 150,
      render: (v: string) => v || t("common.empty"),
    },
    {
      title: t("columns.carrier"),
      dataIndex: "carrier",
      key: "carrier",
      width: 120,
      render: (v: string) => v || t("common.empty"),
    },
    {
      title: t("columns.shop"),
      dataIndex: "shop",
      key: "shop",
      width: 200,
      render: (v: string) => v || t("common.empty"),
    },
    {
      title: t("columns.pushTime"),
      dataIndex: "pushTime",
      key: "pushTime",
      width: 160,
      render: (v: string | undefined) => formatVnTime(v),
    },
    {
      title: t("columns.status"),
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => (
        <Tag color={STATUS_TAG_COLOR[status]} data-testid={`d2c-status-${status}`}>
          {t(`status.${status}`)}
        </Tag>
      ),
    },
    {
      title: t("columns.note"),
      dataIndex: "note",
      key: "note",
      width: 80,
      render: (note: string, record: D2cOrderItem) =>
        note ? (
          <Tooltip title={note}>
            <Tag color="blue" data-testid={`d2c-note-indicator-${record.orderCode}`}>
              {t("columns.noteTag")}
            </Tag>
          </Tooltip>
        ) : (
          t("common.empty")
        ),
    },
    {
      title: t("columns.actions"),
      key: "actions",
      render: (_: unknown, record) => (
        <Space size={4}>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => toggleExpand(record.orderCode)}>
            {t("columns.detail")}
          </Button>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => setNoteOrder(record)}
            data-testid={`d2c-row-note-${record.orderCode}`}
          >
            {t("columns.noteAction")}
          </Button>
        </Space>
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
      setFilters({ page: String(page), pageSize: String(pageSize) });
    },
  };

  return (
    <div style={{ padding: 16 }} data-testid="d2c-page">
      <Typography.Title level={4}>{t("page.title")}</Typography.Title>

      <FilterBar
        onSearch={() => setFilter({})}
        onReset={handleReset}
        searchLabel={t("filters.search")}
        resetLabel={t("filters.reset")}
      >
        <TextSearch
          value={filters.search}
          onChange={(v) => setFilter({ search: v })}
          placeholder={t("filters.searchCode")}
        />
        <MultiSelect
          value={filters.statuses}
          onChange={(v) => setFilter({ statuses: v })}
          options={statusOptions}
          placeholder={t("filters.status")}
        />
        <MultiSelect
          value={filters.carriers}
          onChange={(v) => setFilter({ carriers: v })}
          options={carrierOptions}
          placeholder={t("filters.carrier")}
        />
        <MultiSelect
          value={filters.shops}
          onChange={(v) => setFilter({ shops: v })}
          options={shopOptions}
          placeholder={t("filters.shop")}
        />
        <Select
          style={{ width: "100%" }}
          allowClear
          showSearch
          optionFilterProp="label"
          value={filters.productCategory || undefined}
          onChange={(v) => setFilter({ productCategory: v ?? "" })}
          options={categoryOptions}
          placeholder={t("filters.productCategory")}
          data-testid="d2c-filter-category"
        />
        <Select
          style={{ width: "100%" }}
          allowClear
          showSearch
          optionFilterProp="label"
          value={filters.productType || undefined}
          onChange={(v) => setFilter({ productType: v ?? "" })}
          options={typeOptions}
          placeholder={t("filters.productType")}
          data-testid="d2c-filter-type"
        />
        <DateTimeRange
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
            filters.pushFrom && filters.pushTo
              ? { from: filters.pushFrom, to: filters.pushTo }
              : null
          }
          onChange={(v) => setFilter({ pushFrom: v?.from ?? "", pushTo: v?.to ?? "" })}
          placeholder={[t("filters.pushTime"), t("filters.pushTime")]}
        />
        <TimeRange
          value={
            filters.slotFrom && filters.slotTo ? { from: filters.slotFrom, to: filters.slotTo } : null
          }
          onChange={(v) => setFilter({ slotFrom: v?.from ?? "", slotTo: v?.to ?? "" })}
          placeholder={[t("filters.pushSlot"), t("filters.pushSlot")]}
        />
      </FilterBar>

      {/* Export — chỉ theo from/to (spec §3.3); guard ≤31 ngày client-side */}
      <Space style={{ marginTop: 12 }} data-testid="d2c-export">
        <Typography.Text>{t("export.label")}</Typography.Text>
        <DateRange
          value={exportFrom && exportTo ? { from: exportFrom, to: exportTo } : null}
          onChange={(v) => {
            setExportFrom(v?.from ?? "");
            setExportTo(v?.to ?? "");
          }}
          placeholder={[t("export.from"), t("export.to")]}
        />
        <Button
          type="primary"
          loading={exporting}
          disabled={!exportFrom || !exportTo}
          onClick={() => void handleExport()}
          data-testid="d2c-export-button"
        >
          {t("export.button")}
        </Button>
      </Space>

      <Table<D2cOrderItem>
        style={{ marginTop: 12 }}
        data-testid="d2c-table"
        rowKey="orderCode"
        columns={columns}
        dataSource={rows}
        loading={isLoading || isFetching}
        pagination={pagination}
        scroll={{ x: 1200 }}
        expandable={{
          expandedRowKeys: [...expandedRowKeys],
          onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
          expandedRowRender: (record) => (
            <D2cExpandContent order={record} onEditNote={setNoteOrder} />
          ),
        }}
      />

      <D2cNoteModal open={noteOrder !== null} order={noteOrder} onClose={() => setNoteOrder(null)} />
    </div>
  );
}

/** Exposed root — tự cung cấp Redux store (store per-remote, spec §2). */
export default function D2CPage() {
  return (
    <Provider store={d2cStore}>
      <D2CContent />
    </Provider>
  );
}
