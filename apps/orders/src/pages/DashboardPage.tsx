/**
 * DashboardPage — "Tổng quan vận hành" (/hub-store-order/dashboard, SF-9).
 * Exposed qua federation là `orders/DashboardPage`.
 *
 * MF convention (như D1Page): tự bọc <Provider store> (store per-remote với
 * reducer của api-client singleton `api`; shell KHÔNG cung cấp Redux context).
 * Chart là SVG hand-built — KHÔNG chart lib (antd4 + MF singleton constraint,
 * spec §2). Dữ liệu: GET /fulfillment/dashboard-stats (BFF owns aggregation).
 */
import { Alert, Button, Card, Col, List, Progress, Row, Statistic, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Provider } from "react-redux";
import type { DashboardStats } from "@hub-store/shared";
import { createAppStore, useGetDashboardStatsQuery, type AppStore } from "@hub-store/api-client";
import { registerOrdersResources } from "../i18n";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerOrdersResources();

/** Store per-remote — module singleton của bundle orders (createAppStore). */
const ordersStore: AppStore = createAppStore();

/** Token màu chủ đạo — antd 4 theming là BUILD-TIME LESS (không có CSS var runtime). */
const BAR_FILL = "#EB6E09";

interface DayCount {
  date: string;
  count: number;
}

/**
 * SVG bar chart hand-built (plan Task 3: 1 file, không prematurize).
 * viewBox cố định 600×180 — responsive theo container width (plan §4).
 */
function OrdersPerDayChart({ data }: { data: DayCount[] }) {
  const W = 600;
  const H = 180;
  const top = 20; // dải trên cho nhãn max
  const bottom = 160; // bars vẽ từ top → bottom (cao ~140px)
  const labelY = 176;
  const barW = W / 30 - 2;
  const maxVal = Math.max(1, ...data.map((d) => d.count));
  const midIndex = Math.floor((data.length - 1) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" data-testid="chart-orders-per-day-svg">
      {/* Nhãn max trục y */}
      <text x={0} y={12} fontSize={10} fill="#999">
        {maxVal}
      </text>
      {data.map((d, i) => {
        const height = (d.count / maxVal) * (bottom - top);
        return (
          <rect
            key={d.date}
            data-testid={`bar-${d.date}`}
            x={i * (W / 30) + 1}
            y={bottom - height}
            width={barW}
            height={height}
            fill={BAR_FILL}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
      {/* Nhãn ngày: đầu / giữa / cuối */}
      {data.length > 0 && (
        <>
          <text x={1} y={labelY} fontSize={10} fill="#999">
            {data[0].date}
          </text>
          <text x={(midIndex + 0.5) * (W / 30)} y={labelY} fontSize={10} fill="#999" textAnchor="middle">
            {data[midIndex].date}
          </text>
          <text x={W} y={labelY} fontSize={10} fill="#999" textAnchor="end">
            {data[data.length - 1].date}
          </text>
        </>
      )}
    </svg>
  );
}

function DashboardContent() {
  const { t } = useTranslation("orders");
  const { data, isLoading, isFetching, isError, refetch } = useGetDashboardStatsQuery();

  const stats: DashboardStats | undefined = data;

  return (
    <div style={{ padding: 16 }} data-testid="dashboard-root">
      <Row justify="space-between" align="middle">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("dashboard.title")}
        </Typography.Title>
        <Button onClick={() => refetch()} loading={isFetching} data-testid="dashboard-refetch">
          {t("dashboard.refresh")}
        </Button>
      </Row>

      {/* Review P1: query fail → Alert + retry, KHÔNG render số 0 gây hiểu nhầm. */}
      {isError && (
        <Alert
          type="error"
          showIcon
          message={t("dashboard.error.title")}
          style={{ marginTop: 16 }}
          data-testid="dashboard-error"
          action={
            <Button size="small" danger onClick={() => refetch()}>
              {t("dashboard.refresh")}
            </Button>
          }
        />
      )}

      {!isError && (
        <>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card data-testid="stat-today" loading={isLoading}>
            <Statistic title={t("dashboard.stat.today")} value={stats?.totalToday ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card data-testid="stat-pending" loading={isLoading}>
            <Statistic title={t("dashboard.stat.pending")} value={stats?.pendingApproval ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card data-testid="stat-delivering" loading={isLoading}>
            <Statistic title={t("dashboard.stat.delivering")} value={stats?.delivering ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card data-testid="stat-completion-rate" loading={isLoading}>
            <Progress type="circle" percent={stats?.completionRate ?? 0} />
            <div>
              <Typography.Text type="secondary" data-testid="stat-cancel-rate">
                {t("dashboard.stat.cancelCaption", { rate: stats?.cancelRate ?? 0 })}
              </Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title={t("dashboard.chart.title")}
        style={{ marginTop: 16 }}
        data-testid="chart-orders-per-day"
        loading={isLoading}
      >
        <OrdersPerDayChart data={stats?.ordersPerDay ?? []} />
      </Card>

      <Card
        title={t("dashboard.workload.title")}
        style={{ marginTop: 16 }}
        data-testid="workload-list"
        loading={isLoading}
      >
        <List
          dataSource={stats?.workload ?? []}
          rowKey={(w) => w.staffId || "unassigned"}
          renderItem={(w) => (
            <List.Item data-testid={`workload-row-${w.staffId || "unassigned"}`}>
              <span>{w.name}</span>
              <span>{w.orderCount}</span>
            </List.Item>
          )}
        />
      </Card>
        </>
      )}
    </div>
  );
}

/** Exposed root — tự cung cấp Redux store (store per-remote, spec §2). */
export default function DashboardPage() {
  return (
    <Provider store={ordersStore}>
      <DashboardContent />
    </Provider>
  );
}
