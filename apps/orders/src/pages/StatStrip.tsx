import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BATCH_STATUS, DESIGN_TOKENS, StatStripSkeleton, type BatchStatus } from "@hub-store/shared";
import { useOrderStatusStats } from "../api/orderStatsApi";

/**
 * StatStrip — 5 stat card trên FilterBar: 4 card đếm theo batchStatus + 1 card
 * tổng COD chờ giao (batchStatus 0).
 *
 * TOÀN CỤC (scale fix 2.5M đơn): số liệu từ GET /fulfillment/order-status-stats
 * (GROUP BY batch_status toàn bảng — BFF owns aggregation), KHÔNG còn tính từ
 * items TRANG HIỆN TẠI (Deviation D2 cũ đã xoá — thống kê phải là của toàn bộ
 * data, không phụ thuộc page/filter).
 */
export function StatStrip() {
  const { t } = useTranslation("orders");
  const { stats, isLoading } = useOrderStatusStats();
  if (isLoading) return <StatStripSkeleton />;
  const count = (s: BatchStatus) =>
    stats?.counts.find((c) => c.batchStatus === s)?.count ?? 0;
  const codPending = stats?.codPending ?? 0;

  const cardStyle = (accent: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    background: accent ? DESIGN_TOKENS.color.primaryBg : DESIGN_TOKENS.color.bgWhite,
    border: `1px solid ${accent ? DESIGN_TOKENS.color.primaryBorder : DESIGN_TOKENS.color.divider}`,
    borderRadius: DESIGN_TOKENS.radius.lg,
    boxShadow: DESIGN_TOKENS.shadow.xs,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  });
  const keyStyle: CSSProperties = {
    fontSize: 11.5,
    color: DESIGN_TOKENS.color.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const valueStyle = (accent: boolean): CSSProperties => ({
    fontSize: 19,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: accent ? DESIGN_TOKENS.color.statAccent : DESIGN_TOKENS.color.textStrong,
  });

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
      <div className="sf6-stat-card" style={cardStyle(true)}>
        <span style={keyStyle}>{t("stat.notPrepared")}</span>
        <span style={valueStyle(true)}>{count(BATCH_STATUS.NOT_PREPARED).toLocaleString("vi-VN")}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>{t("stat.preparing")}</span>
        <span style={valueStyle(false)}>{count(BATCH_STATUS.PREPARING).toLocaleString("vi-VN")}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>{t("stat.prepared")}</span>
        <span style={valueStyle(false)}>{count(BATCH_STATUS.PREPARED).toLocaleString("vi-VN")}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>{t("stat.weightExceeded")}</span>
        <span style={valueStyle(false)}>{count(BATCH_STATUS.WEIGHT_EXCEEDED).toLocaleString("vi-VN")}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>{t("stat.codPending")}</span>
        <span style={valueStyle(false)}>
          {codPending.toLocaleString("vi-VN")}
        </span>
      </div>
    </div>
  );
}
