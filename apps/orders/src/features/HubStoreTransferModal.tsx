/**
 * HubStoreTransferModal — D1c "Chuyển kho CN khác" (REQUIREMENTS §3 D1c).
 *
 * - Select kho đích (GET /master-data/shops, loại kho hiện tại của đơn).
 * - disable khi isDebtSplittingOrder=true (§9 — server cũng reject rule 2 §3.6).
 * - Confirm → POST /fulfillment/{code}/assign-shop-hub (invalidates LIST → refetch).
 * - History: POST /fulfillment/{code}/history (READ semantics spec §3.8) —
 *   load khi mở modal, refetch sau khi chuyển thành công.
 */
import { useMemo, useState } from "react";
import { Alert, Button, Modal, Select, Space, Table, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useGetShopsQuery } from "@hub-store/api-client";
import type { HubStoreOrderFilterItem, OrderHistoryEntry, ShopsResponse } from "@hub-store/shared";
import { useAssignShopHubMutation, useGetAssignHistoryQuery } from "../api/ordersApi";

const BATCH_STATUS_NOT_PREPARED = 0;

export interface HubStoreTransferModalProps {
  open: boolean;
  order: HubStoreOrderFilterItem | null;
  onClose: () => void;
}

export function HubStoreTransferModal({ open, order, onClose }: HubStoreTransferModalProps) {
  const { t } = useTranslation("orders");
  const [targetShop, setTargetShop] = useState<string | undefined>(undefined);
  const [assign, { isLoading: assigning }] = useAssignShopHubMutation();

  const { data: shopsData } = useGetShopsQuery();
  const shops = (shopsData as ShopsResponse | undefined)?.items ?? [];

  // Lịch sử load khi mở modal (skip khi đóng/không có đơn) — refetch sau assign.
  const {
    data: history,
    refetch: refetchHistory,
    isLoading: historyLoading,
  } = useGetAssignHistoryQuery(order?.fulfillCode ?? "", {
    skip: !open || !order,
  });

  const shopOptions = useMemo(
    () =>
      shops
        .filter((s) => !order || s.shopCode !== order.shopAssignment.shopCode)
        .map((s) => ({ label: `${s.shopName} — ${s.address}`, value: s.shopCode })),
    [shops, order],
  );

  const debtSplit = order?.isDebtSplittingOrder === true;
  const canSubmit = !!order && !debtSplit && !!targetShop && order.batchStatus === BATCH_STATUS_NOT_PREPARED;

  const handleConfirm = async () => {
    if (!order || !targetShop) return;
    try {
      await assign({ code: order.fulfillCode, toShopCode: targetShop }).unwrap();
      void refetchHistory();
    } catch {
      // lỗi đã hiển thị qua envelope — giữ modal mở cho user thử lại/đóng.
    }
  };

  const historyColumns = [
    { title: t("columns.originalTime"), dataIndex: "timestamp", key: "timestamp", width: 180 },
    { title: "Action", dataIndex: "action", key: "action", width: 160 },
    {
      title: t("transfer.targetShop"),
      key: "transfer",
      render: (_: unknown, record: OrderHistoryEntry) =>
        `${record.fromShopCode ?? "—"} → ${record.toShopCode ?? "—"}`,
    },
  ];

  return (
    <Modal
      title={t("transfer.title")}
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      {order && (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Typography.Text strong data-testid="transfer-order-code">
            {order.fulfillCode}
          </Typography.Text>

          {debtSplit && (
            <Alert type="warning" showIcon message={t("transfer.debtSplitWarning")} data-testid="transfer-debt-warning" />
          )}

          <div>
            <Typography.Text type="secondary">
              {t("transfer.currentShop")}: {order.shopAssignment.shopName} ({order.shopAssignment.shopCode})
            </Typography.Text>
          </div>

          <div>
            <Typography.Text>{t("transfer.targetShop")}</Typography.Text>
            <Select
              style={{ width: "100%", marginTop: 4 }}
              placeholder={t("transfer.selectPlaceholder")}
              options={shopOptions}
              value={targetShop}
              onChange={setTargetShop}
              disabled={debtSplit}
              showSearch
              optionFilterProp="label"
              data-testid="transfer-target-shop"
            />
          </div>

          <Space>
            <Button onClick={onClose} data-testid="transfer-cancel">
              {t("transfer.cancel")}
            </Button>
            <Button
              type="primary"
              disabled={!canSubmit || assigning}
              loading={assigning}
              onClick={() => void handleConfirm()}
              data-testid="transfer-confirm"
            >
              {t("transfer.confirm")}
            </Button>
          </Space>

          <Typography.Title level={5} style={{ marginBottom: 0 }}>
            {t("transfer.history")}
          </Typography.Title>
          <Table<OrderHistoryEntry>
            size="small"
            rowKey={(r) => `${r.timestamp}-${r.action}`}
            columns={historyColumns}
            dataSource={history ?? []}
            loading={historyLoading}
            pagination={false}
            locale={{ emptyText: t("transfer.historyEmpty") }}
          />
        </Space>
      )}
    </Modal>
  );
}
