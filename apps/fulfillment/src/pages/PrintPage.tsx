import { Result } from "antd";
import { useTranslation } from "react-i18next";
import { registerFulfillmentResources } from "../i18n";

// Chạy 1 lần khi module được import (lần đầu bởi shell lazy load, hoặc standalone boot)
registerFulfillmentResources();

/** Exposed qua federation là `fulfillment/PrintPage` → route /hub-store-order/batch/print. */
export default function PrintPage() {
  const { t } = useTranslation("fulfillment");
  return (
    <div data-probe="fulfillment-print">
      <Result status="info" title={t("page.print.title")} subTitle={t("page.print.subtitle")} />
    </div>
  );
}
