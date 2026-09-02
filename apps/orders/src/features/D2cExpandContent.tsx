/**
 * D2cExpandContent — expand row D2C (SF-18, spec §3.4): push/export info,
 * người nhận, serviceType, tách nợ, note + nút "Ghi chú" mở note modal.
 */
import { Button, Descriptions, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import type { D2cOrderItem } from "../utils/d2cItem";
import { formatVnTime } from "../utils/d2cItem";

export interface D2cExpandContentProps {
  order: D2cOrderItem;
  onEditNote: (order: D2cOrderItem) => void;
}

export function D2cExpandContent({ order, onEditNote }: D2cExpandContentProps) {
  const { t } = useTranslation("d2c");

  return (
    <div style={{ padding: "4px 8px" }} data-testid={`d2c-expand-${order.orderCode}`}>
      <Descriptions size="small" bordered column={2}>
        <Descriptions.Item label={t("expand.pushTime")}>
          <span data-testid={`d2c-push-time-${order.orderCode}`}>{formatVnTime(order.pushTime)}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.exportEmployee")}>
          {order.exportEmployee || t("common.empty")}
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.exportTime")}>
          {formatVnTime(order.exportTime)}
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.serviceType")}>
          {order.serviceType || t("common.empty")}
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.receiverName")}>
          {order.receiverName || t("common.empty")}
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.receiverPhone")}>
          {order.receiverPhone || t("common.empty")}
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.receiverAddress")} span={2}>
          {order.receiverAddress || t("common.empty")}
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.debtSplitting")}>
          <span data-testid={`d2c-debt-splitting-${order.orderCode}`}>
            {order.isDebtSplitting ? t("expand.yes") : t("expand.no")}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label={t("expand.note")}>
          {order.note ? <Typography.Text>{order.note}</Typography.Text> : t("common.empty")}
        </Descriptions.Item>
      </Descriptions>
      <Space style={{ marginTop: 8 }}>
        <Button
          type="primary"
          size="small"
          onClick={() => onEditNote(order)}
          data-testid={`d2c-expand-note-${order.orderCode}`}
        >
          {t("expand.editNote")}
        </Button>
      </Space>
    </div>
  );
}
