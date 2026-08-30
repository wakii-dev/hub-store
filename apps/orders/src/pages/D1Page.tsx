import { Result } from "antd";
import { useTranslation } from "react-i18next";
import { registerOrdersResources } from "../i18n";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerOrdersResources();

/** Exposed qua federation là `orders/D1Page` → route /hub-store-order/order. */
export default function D1Page() {
  const { t } = useTranslation("orders");
  return (
    <div data-probe="orders">
      <Result status="info" title={t("page.title")} subTitle={t("page.subtitle")} />
    </div>
  );
}
