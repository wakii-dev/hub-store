import { ConfigProvider } from "antd";
import viVN from "antd/es/locale/vi_VN";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { getI18n } from "@hub-store/shared";
import { registerFulfillmentResources } from "./i18n";
import { fulfillmentStore } from "./store";
import BatchListPage from "./pages/BatchListPage";

/**
 * Standalone root — chỉ dùng khi `vite` chạy RIÊNG app fulfillment (dev mode).
 * Khi chạy federated dưới shell, shell cung cấp I18nextProvider + ConfigProvider
 * + BrowserRouter; store vẫn là của remote (per-remote store — spec §2).
 */
registerFulfillmentResources();

export default function App() {
  // Resolve tại render time (không phải module top-level) — i18n init
  // xảy ra trong main.tsx sau khi module graph đã load.
  const i18n = getI18n();
  if (!i18n) return null;
  return (
    <Provider store={fulfillmentStore}>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider locale={viVN}>
          <BrowserRouter>
            <BatchListPage />
          </BrowserRouter>
        </ConfigProvider>
      </I18nextProvider>
    </Provider>
  );
}
