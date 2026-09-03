/**
 * TransferHubModal — SF-28 T2 "YC chuyển kho" (ticket flow MỚI, KHÔNG đụng
 * HubStoreTransferModal D1c cũ). Design: docs/superpowers/designs/sf-28-direction.md
 * §2.1 — hướng B master-detail: modal 880px, 2 cột `292px 1fr`.
 *
 * - Cột trái — detail pane: mã đơn + tag (Chưa soạn / Tách nợ) + 5 D-row
 *   (mã soạn · shop · địa chỉ giao · kho hiện tại · COD) — LUÔN hiển thị,
 *   kể cả khi form bị khóa bởi debt-split.
 * - Cột phải — form pane: search kho đích debounce 300ms → GET
 *   /master-data/shops?q= → Radio suggest list + lý do chuyển kho required.
 * - isDebtSplittingOrder → form pane thay bằng debt-card (§2.1) + disable
 *   input/confirm — render ngay (§3, không đợi bấm confirm); cột trái giữ nguyên.
 * - Confirm → POST /fulfillment/{code}/transfer-tickets → "✓ Đã tạo yêu cầu"
 *   800ms → onClose (invalidate Fulfillment LIST → badge D1 refetch).
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Radio, message } from "antd";
import { useTranslation } from "react-i18next";
import {
  DESIGN_TOKENS,
  formatVnd,
  type HubStoreOrderFilterItem,
} from "@hub-store/shared";
import { useCreateTransferTicketMutation, useSearchShopsQuery } from "../api/ordersApi";

const DEBOUNCE_MS = 300;
const CONFIRMED_FLASH_MS = 800;

export interface TransferHubModalProps {
  open: boolean;
  order: HubStoreOrderFilterItem | null;
  onClose: () => void;
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function tagPillStyle(color: string, bg: string, line: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 8px",
    borderRadius: DESIGN_TOKENS.radius.pill,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "18px",
    color,
    background: bg,
    border: `1px solid ${line}`,
    whiteSpace: "nowrap",
  };
}

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: "16px 0 7px",
        fontSize: DESIGN_TOKENS.typography.overline.fontSize,
        fontWeight: DESIGN_TOKENS.typography.overline.fontWeight,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: DESIGN_TOKENS.color.textFaint,
      }}
    >
      {children}
    </div>
  );
}

export function TransferHubModal({ open, order, onClose }: TransferHubModalProps) {
  const { t } = useTranslation("orders");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), DEBOUNCE_MS);
  const [targetCode, setTargetCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [create, { isLoading: creating }] = useCreateTransferTicketMutation();

  // Search chỉ chạy khi có từ khóa (debounce 300ms — design §6 dev-decided).
  const { data: shopsData, isLoading: shopsLoading } = useSearchShopsQuery(debouncedSearch, {
    skip: !open || debouncedSearch.length === 0,
  });

  const debtSplit = order?.isDebtSplittingOrder === true;

  const candidates = useMemo(() => {
    const items = shopsData?.items ?? [];
    return items.filter((s) => !order || s.shopCode !== order.shopAssignment.shopCode);
  }, [shopsData, order]);

  const resetAndClose = () => {
    setSearch("");
    setTargetCode(null);
    setReason("");
    setConfirmed(false);
    onClose();
  };

  // Reset state khi mở modal với đơn mới (destroyOnClose không reset hook state).
  useEffect(() => {
    if (open) {
      setSearch("");
      setTargetCode(null);
      setReason("");
      setConfirmed(false);
    }
  }, [open, order?.fulfillCode]);

  const canSubmit =
    !!order && !debtSplit && !confirmed && !!targetCode && reason.trim().length > 0;

  const handleConfirm = async () => {
    if (!order || !targetCode) return;
    const shop = candidates.find((s) => s.shopCode === targetCode);
    if (!shop) return;
    try {
      await create({
        code: order.fulfillCode,
        toHub: `${shop.shopName} (${shop.shopCode})`,
        fromHub: `${order.shopAssignment.shopName} (${order.shopAssignment.shopCode})`,
        reason: reason.trim(),
      }).unwrap();
      setConfirmed(true);
      setTimeout(resetAndClose, CONFIRMED_FLASH_MS);
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      message.error(data?.message ?? t("transferHub.error"));
    }
  };

  const disabledControlStyle: React.CSSProperties = debtSplit
    ? {
        background: DESIGN_TOKENS.color.status.neutralBg,
        borderColor: DESIGN_TOKENS.color.status.neutralLine,
        color: DESIGN_TOKENS.color.textFaint,
        cursor: "not-allowed",
      }
    : {};

  // D-row list — 5 hàng cố định (design §2.1 cột trái).
  const assignment = order
    ? `${order.shopAssignment.shopName} (${order.shopAssignment.shopCode})`
    : "—";
  const dRows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t("transferHub.kv.batchCode"), value: order?.batchCode ?? "—", mono: true },
    { label: t("transferHub.kv.shop"), value: assignment },
    { label: t("transferHub.kv.address"), value: order?.customerAddress ?? "—" },
    { label: t("transferHub.kv.currentHub"), value: assignment },
    { label: t("transferHub.kv.cod"), value: formatVnd(order?.codAmount ?? 0), mono: true },
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
          {t("transferHub.title")}
        </span>
      }
      open={open}
      onCancel={resetAndClose}
      width={880}
      destroyOnClose
      bodyStyle={{ padding: 0 }}
      footer={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: DESIGN_TOKENS.color.bgSoftWhite,
            borderTop: `1px solid ${DESIGN_TOKENS.color.divider}`,
            margin: "-10px -16px",
            padding: "12px 24px",
            borderRadius: `0 0 ${DESIGN_TOKENS.radius.modal}px ${DESIGN_TOKENS.radius.modal}px`,
          }}
        >
          {debtSplit ? (
            <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
              {t("transferHub.footerHintDebt")}
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
              {t("transferHub.footerHint")}{" "}
              <span
                style={tagPillStyle(
                  DESIGN_TOKENS.color.status.warning,
                  DESIGN_TOKENS.color.status.warningBg,
                  DESIGN_TOKENS.color.status.warningLine,
                )}
              >
                {t("transferHub.footerTagPending")}
              </span>{" "}
              {t("transferHub.footerHintSuffix")}
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={resetAndClose}>{t("transferHub.close")}</Button>
            <Button
              type="primary"
              disabled={!canSubmit || debtSplit}
              loading={creating}
              onClick={() => void handleConfirm()}
              data-testid="transfer-hub-confirm"
            >
              {confirmed ? t("transferHub.confirmed") : t("transferHub.confirm")}
            </Button>
          </div>
        </div>
      }
    >
      <div
        data-testid="transfer-hub-modal"
        style={{ display: "grid", gridTemplateColumns: "292px 1fr" }}
      >
        {/* Cột trái — detail pane: LUÔN hiển thị, kể cả khi form bị khóa (§2.1) */}
        <div
          style={{
            background: DESIGN_TOKENS.color.bgSoftWhite,
            borderRight: `1px solid ${DESIGN_TOKENS.color.dividerSoft}`,
            padding: "18px 20px",
          }}
        >
          <div
            style={{
              fontSize: DESIGN_TOKENS.typography.overline.fontSize,
              fontWeight: DESIGN_TOKENS.typography.overline.fontWeight,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: DESIGN_TOKENS.color.textFaint,
            }}
          >
            {t("transferHub.orderKicker")}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 19,
              fontWeight: 700,
              color: DESIGN_TOKENS.color.textStrong,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {order?.fulfillCode ?? "—"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {order?.batchStatus === 0 && (
              <span
                style={tagPillStyle(
                  DESIGN_TOKENS.color.status.info,
                  DESIGN_TOKENS.color.status.infoBg,
                  DESIGN_TOKENS.color.status.infoLine,
                )}
              >
                {t("transferHub.tagNotPrepared")}
              </span>
            )}
            {debtSplit && (
              <span
                style={tagPillStyle(
                  DESIGN_TOKENS.color.status.purple,
                  DESIGN_TOKENS.color.status.purpleBg,
                  DESIGN_TOKENS.color.status.purpleLine,
                )}
              >
                {t("transferHub.tagDebt")}
              </span>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            {dRows.map((row, i) => (
              <div
                key={row.label}
                style={{
                  padding: "9px 0",
                  borderTop: i === 0 ? undefined : `1px solid ${DESIGN_TOKENS.color.dividerSoft}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: DESIGN_TOKENS.color.textMuted,
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    lineHeight: 1.45,
                    color: DESIGN_TOKENS.color.textStrong,
                    fontVariantNumeric: row.mono ? "tabular-nums" : undefined,
                    wordBreak: "break-word",
                  }}
                >
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cột phải — form pane (debt-split → debt-card thay block form, §2.1) */}
        <div style={{ padding: "18px 22px 20px" }}>
          {debtSplit && (
            <div
              data-testid="transfer-hub-debt-block"
              style={{
                marginTop: 16,
                borderRadius: DESIGN_TOKENS.radius.xl,
                background: DESIGN_TOKENS.color.status.errorBg,
                border: `1px solid ${DESIGN_TOKENS.color.status.errorLine}`,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: DESIGN_TOKENS.color.status.error,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    borderRadius: DESIGN_TOKENS.radius.pill,
                    background: DESIGN_TOKENS.color.status.error,
                    color: DESIGN_TOKENS.color.bgWhite,
                    fontSize: 13,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  !
                </span>
                {t("transferHub.debtTitle")}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: DESIGN_TOKENS.color.status.error,
                }}
              >
                {t("transferHub.debtBody")}
              </div>
            </div>
          )}

          {/* Kho đích — search + suggest list */}
          <Overline>{t("transferHub.targetLabel")}</Overline>
          <Input
            placeholder={t("transferHub.searchPlaceholder")}
            value={search}
            disabled={debtSplit}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="transfer-hub-search"
            style={debtSplit ? disabledControlStyle : undefined}
          />
          {!debtSplit && (
            <div
              style={{
                marginTop: 10,
                borderRadius: DESIGN_TOKENS.radius.xl,
                border: `1px solid ${DESIGN_TOKENS.color.divider}`,
                overflow: "hidden",
                background: DESIGN_TOKENS.color.bgWhite,
              }}
            >
              {shopsLoading ? (
                [0, 1].map((i) => (
                  <div key={i} style={{ height: 44, padding: "11px 14px" }}>
                    <div
                      style={{
                        height: 12,
                        borderRadius: 6,
                        background: DESIGN_TOKENS.color.dividerSoft,
                      }}
                    />
                  </div>
                ))
              ) : candidates.length === 0 ? (
                <div
                  style={{ padding: "11px 14px", fontSize: 12.5, color: DESIGN_TOKENS.color.textFaint }}
                >
                  {t("transferHub.noResult")}
                </div>
              ) : (
                candidates.map((shop) => (
                  <div
                    key={shop.shopCode}
                    onClick={() => setTargetCode(shop.shopCode)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      cursor: "pointer",
                      background:
                        targetCode === shop.shopCode
                          ? DESIGN_TOKENS.color.primaryBg
                          : DESIGN_TOKENS.color.bgWhite,
                      boxShadow:
                        targetCode === shop.shopCode
                          ? `inset 3px 0 0 ${DESIGN_TOKENS.color.primary}`
                          : undefined,
                      borderTop: `1px solid ${DESIGN_TOKENS.color.dividerSoft}`,
                    }}
                    data-testid="transfer-hub-target"
                  >
                    <Radio checked={targetCode === shop.shopCode} />
                    <div>
                      <div
                        style={{ fontSize: 13.5, fontWeight: 600, color: DESIGN_TOKENS.color.textStrong }}
                      >
                        {shop.shopName}
                      </div>
                      <div style={{ fontSize: 12, color: DESIGN_TOKENS.color.textMuted }}>
                        {shop.address}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Lý do chuyển kho */}
          <Overline>{t("transferHub.reasonLabel")}</Overline>
          <Input.TextArea
            value={reason}
            disabled={debtSplit}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("transferHub.reasonPlaceholder")}
            style={{ minHeight: 80, ...(debtSplit ? disabledControlStyle : {}) }}
            data-testid="transfer-hub-reason"
          />
        </div>
      </div>
    </Modal>
  );
}
