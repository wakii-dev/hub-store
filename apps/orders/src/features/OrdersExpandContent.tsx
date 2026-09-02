/**
 * Expand content — items[] sản phẩm (REQUIREMENTS D1 expand) + COD.
 * Detail endpoint GET /fulfillment/{code} WAIVE có chủ đích (spec §3.8 pin):
 * expand dùng items[] đã có trong filter response — không gọi thêm API.
 * SF-13 (additive): dòng Khách (tên + SĐT, ẩn nếu rỗng) + link Đơn gốc
 * (oldFulfillCode — đơn giao lại) copyable.
 */
import { Table, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { formatVnd, type HubStoreOrderFilterItem, type HubStoreOrderProduct } from "@hub-store/shared";

export function OrdersExpandContent({ order }: { order: HubStoreOrderFilterItem }) {
  const { t } = useTranslation("orders");

  const columns = [
    { title: t("expand.productCode"), dataIndex: "productCode", key: "productCode" },
    { title: t("expand.productName"), dataIndex: "productName", key: "productName" },
    { title: t("expand.quantity"), dataIndex: "quantity", key: "quantity", width: 80, align: "right" as const },
  ];

  return (
    <div style={{ padding: "4px 8px" }} data-testid={`expand-${order.fulfillCode}`}>
      <Table<HubStoreOrderProduct>
        size="small"
        rowKey={(p) => p.productCode}
        columns={columns}
        dataSource={order.items}
        pagination={false}
        title={() => t("expand.products")}
      />
      <div style={{ marginTop: 8, display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Typography.Text>
          {t("expand.totalQuantity")}: <strong>{order.totalQuantity}</strong>
        </Typography.Text>
        <Typography.Text data-testid={`cod-${order.fulfillCode}`}>
          {t("expand.cod")}: <strong>{formatVnd(order.codAmount)}</strong>
        </Typography.Text>
        {(order.customerName || order.customerPhone) && (
          <Typography.Text data-testid={`customer-${order.fulfillCode}`}>
            {t("expand.customer")}:{" "}
            <strong>{[order.customerName, order.customerPhone].filter(Boolean).join(" · ")}</strong>
          </Typography.Text>
        )}
        {order.oldFulfillCode && (
          <Typography.Text
            copyable={{ text: order.oldFulfillCode }}
            data-testid="old-order-link"
          >
            {t("expand.oldOrder")}: <strong>{order.oldFulfillCode}</strong>
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
