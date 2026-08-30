import { ConfigProvider } from "antd";
import viVN from "antd/es/locale/vi_VN";
import { I18nextProvider } from "react-i18next";
import { getI18n } from "@hub-store/shared";
import { registerFulfillmentResources } from "./i18n";
import BatchListPage from "./pages/BatchListPage";

/**
 * Standalone root — chỉ dùng khi `vite` chạy RIÊNG app fulfillment (dev mode).
 * Khi chạy federated dưới shell, shell cung cấp I18nextProvider + ConfigProvider.
 */
registerFulfillmentResources();

export default function App() {
  // Resolve tại render time (không phải module top-level) — i18n init
  // xảy ra trong main.tsx sau khi module graph đã load.
  const i18n = getI18n();
  if (!i18n) return null;
  return (
    <I18nextProvider i18n={i18n}>
      <ConfigProvider locale={viVN}>
        <BatchListPage />
      </ConfigProvider>
    </I18nextProvider>
  );
}
