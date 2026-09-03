/**
 * TransferTicketHistoryModal — SF-28 T3 (design §2.2): lịch sử ticket chuyển
 * kho của 1 đơn, modal 640px, testid transfer-ticket-history-modal.
 *
 * - Dữ liệu: getTransferTickets(orderCode) — API trả ORDER BY created_at DESC
 *   (mới nhất lên đầu, đúng thứ tự design yêu cầu).
 * - Bảng trong block radius 14 border lineLight, testid transfer-history-table:
 *   Ticket · Trạng thái duyệt · Kho đích · Lý do · Thời gian & người xác nhận.
 * - PENDING → confirmed_by trống → dòng phụ "—".
 * - Empty state testid transfer-history-empty (EmptyState sf6).
 * - Loading: 3 skeleton row (§3 — không spinner toàn modal).
 * - Entry: click badge `transfer-badge-${code}` trên D1 (wire ở D1Page).
 */
import { useMemo } from "react";
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { DESIGN_TOKENS, EmptyState } from "@hub-store/shared";
import { useGetTransferTicketsQuery, type TransferTicket } from "../api/ordersApi";

export interface TransferTicketHistoryModalProps {
  orderCode: string | null;
  open: boolean;
  onClose: () => void;
}

/** Tag màu theo trạng thái ticket (tokens sf6 semantic — khớp badge D1). */
const STATUS_TAG_META: Record<string, { color: string; bg: string; line: string }> = {
  PENDING: {
    color: DESIGN_TOKENS.color.status.warning,
    bg: DESIGN_TOKENS.color.status.warningBg,
    line: DESIGN_TOKENS.color.status.warningLine,
  },
  APPROVED: {
    color: DESIGN_TOKENS.color.status.success,
    bg: DESIGN_TOKENS.color.status.successBg,
    line: DESIGN_TOKENS.color.status.successLine,
  },
  REJECTED: {
    color: DESIGN_TOKENS.color.status.error,
    bg: DESIGN_TOKENS.color.status.errorBg,
    line: DESIGN_TOKENS.color.status.errorLine,
  },
};

function statusTagStyle(meta: { color: string; bg: string; line: string }): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: DESIGN_TOKENS.radius.pill,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "18px",
    color: meta.color,
    background: meta.bg,
    border: `1px solid ${meta.line}`,
    whiteSpace: "nowrap",
  };
}

export function TransferTicketHistoryModal({ orderCode, open, onClose }: TransferTicketHistoryModalProps) {
  const { t, i18n } = useTranslation("orders");

  const { data, isLoading } = useGetTransferTicketsQuery(orderCode ?? "", {
    skip: !open || !orderCode,
  });
  const tickets: TransferTicket[] = data?.items ?? [];

  // Thời gian format theo locale (vi → DD/MM/YYYY HH:mm) — tabular-nums (design §1).
  const timeFormatter = useMemo(() => {
    const locale = (i18n.language ?? "vi").startsWith("vi") ? "vi-VN" : "en-GB";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [i18n.language]);

  const columns = [
    t("transferHistory.col.ticket"),
    t("transferHistory.col.status"),
    t("transferHistory.col.toHub"),
    t("transferHistory.col.reason"),
    t("transferHistory.col.time"),
  ];

  return (
    <Modal
      title={
        <span
          style={{
            fontSize: DESIGN_TOKENS.typography.h2.fontSize,
            fontWeight: DESIGN_TOKENS.typography.h2.fontWeight,
            letterSpacing: DESIGN_TOKENS.typography.h2.letterSpacing,
            color: DESIGN_TOKENS.color.textStrong,
          }}
        >
          {t("transferHistory.title")}
          {orderCode ? (
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: DESIGN_TOKENS.color.textMuted,
                marginLeft: 8,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {orderCode}
            </span>
          ) : null}
        </span>
      }
      open={open}
      onCancel={onClose}
      width={640}
      destroyOnClose
      footer={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
            {t("transferHistory.footerCount", { count: tickets.length })}
          </span>
          <Button onClick={onClose}>{t("transferHistory.close")}</Button>
        </div>
      }
    >
      <div data-testid="transfer-ticket-history-modal">
        {isLoading ? (
          // Loading — 3 skeleton row (§3)
          <div
            style={{
              borderRadius: DESIGN_TOKENS.radius.xl,
              border: `1px solid ${DESIGN_TOKENS.color.divider}`,
              overflow: "hidden",
            }}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ padding: "12px 14px" }}>
                <div
                  style={{
                    height: 12,
                    borderRadius: 6,
                    background: DESIGN_TOKENS.color.dividerSoft,
                  }}
                />
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div data-testid="transfer-history-empty">
            <EmptyState
              title={t("transferHistory.empty.title")}
              sub={t("transferHistory.empty.sub")}
            />
          </div>
        ) : (
          <div
            data-testid="transfer-history-table"
            style={{
              borderRadius: DESIGN_TOKENS.radius.xl,
              border: `1px solid ${DESIGN_TOKENS.color.divider}`,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "90px 100px 1fr 1fr 160px",
                gap: 8,
                background: DESIGN_TOKENS.color.bgHeaderSticky,
                padding: "10px 14px",
                fontSize: 11.5,
                fontWeight: 600,
                color: DESIGN_TOKENS.color.textMuted,
              }}
            >
              {columns.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {tickets.map((ticket, i) => {
              const meta = STATUS_TAG_META[ticket.status] ?? STATUS_TAG_META.PENDING;
              const statusLabel =
                ticket.status === "APPROVED"
                  ? t("transferHub.tagApproved")
                  : ticket.status === "REJECTED"
                    ? t("transferHub.tagRejected")
                    : t("transferHistory.tagPending");
              const confirmed =
                ticket.confirmedBy && ticket.confirmedBy.length > 0
                  ? ticket.confirmedBy
                  : t("common.empty");
              return (
                <div
                  key={ticket.ticketCode}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px 100px 1fr 1fr 160px",
                    gap: 8,
                    alignItems: "start",
                    padding: "12px 14px",
                    borderTop:
                      i === 0 ? undefined : `1px solid ${DESIGN_TOKENS.color.dividerSoft}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: DESIGN_TOKENS.color.textStrong,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {ticket.ticketCode}
                  </span>
                  <span>
                    <span style={statusTagStyle(meta)}>{statusLabel}</span>
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: DESIGN_TOKENS.color.textSecondary,
                      wordBreak: "break-word",
                    }}
                  >
                    {ticket.toHub}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: DESIGN_TOKENS.color.textSecondary,
                      maxWidth: 170,
                      wordBreak: "break-word",
                    }}
                  >
                    {ticket.reason || t("common.empty")}
                  </span>
                  <span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        color: DESIGN_TOKENS.color.textSecondary,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {timeFormatter.format(new Date(ticket.createdAt))}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
                      {t("transferHistory.confirmedBy")}: {confirmed}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
