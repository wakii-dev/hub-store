import { Result } from "antd";
import { useTranslation } from "react-i18next";
import { registerFulfillmentResources } from "../i18n";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerFulfillmentResources();

/** Exposed qua federation là `fulfillment/BatchListPage` → route /hub-store-order/batch. */
export default function BatchListPage() {
  const { t } = useTranslation("fulfillment");
  return (
    <div data-probe="fulfillment">
      <Result status="info" title={t("page.batch.title")} subTitle={t("page.batch.subtitle")} />
    </div>
  );
}
