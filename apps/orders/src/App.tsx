import { ConfigProvider } from "antd";
import viVN from "antd/es/locale/vi_VN";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { getI18n } from "@hub-store/shared";
import { registerOrdersResources } from "./i18n";
import D1Page from "./pages/D1Page";

/**
 * Standalone root — chỉ dùng khi `vite` chạy RIÊNG app orders (dev mode).
 * Khi chạy federated dưới shell, shell cung cấp I18nextProvider + ConfigProvider.
 */
registerOrdersResources();

export default function App() {
  // Resolve tại render time (không phải module top-level) — i18n init
  // xảy ra trong main.tsx sau khi module graph đã load.
  const i18n = getI18n();
  if (!i18n) return null;
  return (
    <I18nextProvider i18n={i18n}>
      <ConfigProvider locale={viVN}>
        {/* Standalone owns router — federated dưới shell dùng RRD singleton của shell */}
        <BrowserRouter>
          <D1Page />
        </BrowserRouter>
      </ConfigProvider>
    </I18nextProvider>
  );
}
