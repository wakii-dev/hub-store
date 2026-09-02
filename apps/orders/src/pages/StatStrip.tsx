import type { CSSProperties } from "react";
import { DESIGN_TOKENS, type BatchStatus } from "@hub-store/shared";
import type { HubStoreOrderFilterItem } from "@hub-store/shared";

/**
 * StatStrip — SF-6 hand-off §2.2: 5 stat card trên FilterBar.
 * 4 card đếm theo batchStatus + 1 card tổng COD chờ giao (batchStatus 0).
 *
 * ⚠ Page-scoped (Deviation D2, spec-critic P0-1): FilterOrdersResponse không
 * có aggregate — số liệu tính từ items TRANG HIỆN TẠI, sub-label ghi rõ.
 * REQUIREMENT-GAP đã comment lên FI-245 đề xuất aggregate API.
 */
export function StatStrip({
  items,
  isLoading,
}: {
  items: HubStoreOrderFilterItem[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return null; // skeleton do parent render (StatStripSkeleton cùng shared)
  }
  const count = (s: BatchStatus) =>
    items.filter((o) => o.batchStatus === s).length;
  const codPending = items
    .filter((o) => o.batchStatus === 0)
    .reduce((sum, o) => sum + (o.codAmount ?? 0), 0);

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
        <span style={keyStyle}>Chưa soạn</span>
        <span style={valueStyle(true)}>{count(0)}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>Đang soạn</span>
        <span style={valueStyle(false)}>{count(1)}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>Đã soạn</span>
        <span style={valueStyle(false)}>{count(2)}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>Lỗi vượt trọng lượng</span>
        <span style={valueStyle(false)}>{count(3)}</span>
      </div>
      <div className="sf6-stat-card" style={cardStyle(false)}>
        <span style={keyStyle}>Tổng COD chờ giao (VND)</span>
        <span style={valueStyle(false)}>
          {codPending.toLocaleString("vi-VN")}
        </span>
      </div>
    </div>
  );
}
