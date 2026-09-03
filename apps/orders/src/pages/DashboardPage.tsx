/**
 * DashboardPage — "Tổng quan vận hành" (/hub-store-order/dashboard, SF-9).
 * Exposed qua federation là `orders/DashboardPage`.
 *
 * MF convention (như D1Page): tự bọc <Provider store> (store per-remote với
 * reducer của api-client singleton `api`; shell KHÔNG cung cấp Redux context).
 * Chart là SVG hand-built — KHÔNG chart lib (antd4 + MF singleton constraint,
 * spec §2). Dữ liệu: GET /fulfillment/dashboard-stats (BFF owns aggregation).
 * SF-11 (FI-256, Task 4): reskin 100% design system SF-6 — page-head mirror D1,
 * stat cards pattern StatStrip (accent cam + semantic accents), chart cards
 * cùng radius/border/shadow với table card. Data-fetch/testid giữ nguyên.
 */
import type { CSSProperties } from "react";
import { Alert, Button, Card, Col, List, Progress, Row, Statistic, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Provider } from "react-redux";
import type { DashboardStats } from "@hub-store/shared";
import { DESIGN_TOKENS } from "@hub-store/shared";
import { createAppStore, useGetDashboardStatsQuery, type AppStore } from "@hub-store/api-client";
import { registerOrdersResources } from "../i18n";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerOrdersResources();

/** Store per-remote — module singleton của bundle orders (createAppStore). */
const ordersStore: AppStore = createAppStore();

/** Token màu chủ đạo — antd 4 theming là BUILD-TIME LESS (không có CSS var runtime). */
const BAR_FILL = DESIGN_TOKENS.color.primary;
/** Nhãn trục SVG — textMuted (SF-6 §1.1). */
const AXIS_LABEL = DESIGN_TOKENS.color.textMuted;

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
      <text x={0} y={12} fontSize={10} fill={AXIS_LABEL}>
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
          <text x={1} y={labelY} fontSize={10} fill={AXIS_LABEL}>
            {data[0].date}
          </text>
          <text x={(midIndex + 0.5) * (W / 30)} y={labelY} fontSize={10} fill={AXIS_LABEL} textAnchor="middle">
            {data[midIndex].date}
          </text>
          <text x={W} y={labelY} fontSize={10} fill={AXIS_LABEL} textAnchor="end">
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

  // SF-6 §2.2 — stat card pattern StatStrip D1: radius.lg, border, shadow.xs.
  // Card đầu accent cam (primaryBg/primaryBorder/statAccent); còn lại trắng.
  const statCardStyle = (accent: boolean): CSSProperties => ({
    background: accent ? DESIGN_TOKENS.color.primaryBg : DESIGN_TOKENS.color.bgWhite,
    border: `1px solid ${accent ? DESIGN_TOKENS.color.primaryBorder : DESIGN_TOKENS.color.divider}`,
    borderRadius: DESIGN_TOKENS.radius.lg,
    boxShadow: DESIGN_TOKENS.shadow.xs,
  });
  // Value 19/700 tabular-nums; accent ngoài stat đầu theo semantic §1.1.
  const statValueStyle = (color?: string): CSSProperties => ({
    fontSize: 19,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: color ?? DESIGN_TOKENS.color.textStrong,
  });
  // Chart/workload card — cùng chrome table card SF-6 (radius.card, border, shadow.sm).
  const panelCardStyle: CSSProperties = {
    background: DESIGN_TOKENS.color.bgWhite,
    border: `1px solid ${DESIGN_TOKENS.color.divider}`,
    borderRadius: DESIGN_TOKENS.radius.card,
    boxShadow: DESIGN_TOKENS.shadow.sm,
    marginTop: 16,
  };

  return (
    <div style={{ padding: 16 }} data-testid="dashboard-root">
      {/* Page-head — SF-6 §2.2: h1 21/700 + nút ghost phải (mirror D1). */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            fontSize: DESIGN_TOKENS.typography.h1.fontSize,
            fontWeight: DESIGN_TOKENS.typography.h1.fontWeight,
            letterSpacing: DESIGN_TOKENS.typography.h1.letterSpacing,
            color: DESIGN_TOKENS.color.textStrong,
            margin: 0,
          }}
        >
          {t("dashboard.title")}
        </h1>
        <Button onClick={() => refetch()} loading={isFetching} data-testid="dashboard-refetch">
          {t("dashboard.refresh")}
        </Button>
      </div>

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
      <Row gutter={16}>
        <Col span={6}>
          <Card data-testid="stat-today" loading={isLoading} style={statCardStyle(true)}>
            <Statistic
              title={t("dashboard.stat.today")}
              value={stats?.totalToday ?? 0}
              valueStyle={statValueStyle(DESIGN_TOKENS.color.statAccent)}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card data-testid="stat-pending" loading={isLoading} style={statCardStyle(false)}>
            <Statistic
              title={t("dashboard.stat.pending")}
              value={stats?.pendingApproval ?? 0}
              valueStyle={statValueStyle(DESIGN_TOKENS.color.status.warning)}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card data-testid="stat-delivering" loading={isLoading} style={statCardStyle(false)}>
            <Statistic
              title={t("dashboard.stat.delivering")}
              value={stats?.delivering ?? 0}
              valueStyle={statValueStyle(DESIGN_TOKENS.color.status.info)}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card
            data-testid="stat-completion-rate"
            loading={isLoading}
            style={statCardStyle(false)}
          >
            <Progress
              type="circle"
              percent={stats?.completionRate ?? 0}
              strokeColor={DESIGN_TOKENS.color.status.success}
            />
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
        style={panelCardStyle}
        data-testid="chart-orders-per-day"
        loading={isLoading}
      >
        <OrdersPerDayChart data={stats?.ordersPerDay ?? []} />
      </Card>

      <Card
        title={t("dashboard.workload.title")}
        style={panelCardStyle}
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
