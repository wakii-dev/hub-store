/**
 * SF-11 — Audit viewer (FI-256, Manager-only). Shell-local page, pattern
 * features/users/UsersPage.tsx. Data qua RTKQ slice audit — GET /fulfillment/audit
 * server-paginated. testids: audit-page, audit-table,
 * audit-filter-actor, audit-filter-action.
 */
import { useState } from "react";
import { Alert, Button, Input, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import {
  DateRange,
  DESIGN_TOKENS,
  EmptyState,
  TableSkeleton,
  type DateRangeValue,
} from "@hub-store/shared";
import { useListAuditQuery, type AuditListItem } from "@hub-store/api-client";

const PAGE_SIZE = 20;

/** ISO → 'HH:mm DD/MM/YYYY' theo múi giờ VN (D6 — khớp convention dashboard). */
function formatVnTime(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("day")}/${get("month")}/${get("year")}`;
}

/** JSONB freeform (D7) — chỉ expand khi là object; null/primitive → không expand. */
function hasDetail(record: AuditListItem): boolean {
  return record.detail != null && typeof record.detail === "object";
}

export default function AuditPage() {
  const { t } = useTranslation("shell");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useListAuditQuery({
    actor,
    action,
    dateFrom: range?.from,
    dateTo: range?.to,
    page,
    pageSize: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const updateFilter = (apply: () => void): void => {
    apply();
    setPage(1); // filter đổi → về trang 1 (server-paginated)
  };

  const columns: ColumnsType<AuditListItem> = [
    { title: t("audit.column.time"), dataIndex: "createdAt", render: formatVnTime },
    { title: t("audit.column.actor"), dataIndex: "actor" },
    {
      title: t("audit.column.action"),
      dataIndex: "action",
      render: (action: string) => <Tag>{action}</Tag>,
    },
    {
      title: t("audit.column.target"),
      render: (_, record) => `${record.targetType}/${record.targetId}`,
    },
  ];

  return (
    <div data-testid="audit-page">
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
        {t("audit.title")}
      </Typography.Title>
      <Space wrap size={12} style={{ marginBottom: 12 }}>
        <Input
          allowClear
          placeholder={t("audit.filter.actor")}
          value={actor}
          onChange={(e) => updateFilter(() => setActor(e.target.value))}
          style={{ width: 200 }}
          data-testid="audit-filter-actor"
        />
        <Input
          allowClear
          placeholder={t("audit.filter.action")}
          value={action}
          onChange={(e) => updateFilter(() => setAction(e.target.value))}
          style={{ width: 200 }}
          data-testid="audit-filter-action"
        />
        <DateRange
          value={range}
          onChange={(value) => updateFilter(() => setRange(value))}
          placeholder={[t("audit.filter.dateFrom"), t("audit.filter.dateTo")]}
        />
      </Space>

      {/* Initial load → skeleton (SF-6 §2.2, không spinner toàn trang). */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        /* Lỗi API ≠ dữ liệu rỗng — không được ngụy trang thành EmptyState (review P1). */
        <Alert
          type="error"
          showIcon
          message={t("audit.error")}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {t("audit.errorRetry")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <div
          style={{
            background: DESIGN_TOKENS.color.bgWhite,
            border: `1px solid ${DESIGN_TOKENS.color.divider}`,
            borderRadius: DESIGN_TOKENS.radius.card,
            boxShadow: DESIGN_TOKENS.shadow.sm,
          }}
        >
          <EmptyState title={t("audit.empty")} sub={t("audit.emptyHint")} />
        </div>
      ) : (
        /* Table card — SF-6 §2.2: radius 16, border, shadow.sm (pattern D1). */
        <div
          style={{
            background: DESIGN_TOKENS.color.bgWhite,
            border: `1px solid ${DESIGN_TOKENS.color.divider}`,
            borderRadius: DESIGN_TOKENS.radius.card,
            boxShadow: DESIGN_TOKENS.shadow.sm,
            overflow: "hidden",
            transition: "opacity .15s ease",
            opacity: isFetching ? 0.6 : 1,
          }}
        >
          <Table<AuditListItem>
            rowKey="id"
            data-testid="audit-table"
            size="middle"
            loading={isFetching && !isLoading}
            dataSource={items}
            columns={columns}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              showTotal: (tTotal: number) => t("audit.pagination.total", { total: tTotal }),
              onChange: (nextPage: number) => setPage(nextPage),
            }}
            expandable={{
              rowExpandable: hasDetail,
              expandedRowRender: (record) =>
                hasDetail(record) ? (
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(record.detail, null, 2)}
                  </pre>
                ) : null,
            }}
          />
        </div>
      )}
    </div>
  );
}
