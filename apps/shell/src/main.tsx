import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
// antd 4 full LESS source — primary #EB6E09 qua vite less modifyVars (xem vite.config.ts)
import "antd/dist/antd.less";
import "@hub-store/shared/src/theme/sf6-antd-overrides.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { initAnalytics, initI18n } from "@hub-store/shared";
import {
  installUnauthorizedInterceptor,
  registerTokenGetter,
} from "./auth/oidc";
import { LANG_STORAGE_KEY, shellResources } from "./i18n";
import { registerServiceWorker } from "./lib/pwa";
import { initOneSignal } from "./lib/push";
import App from "./App";

// SF-11 convergence fix: pre-warm MF share cache cho react/jsx-runtime.
// Pre-bundle react-pdf (D3 PrintPage) import jsx-runtime qua MF virtual
// loadShare — resolve ASYNC; nếu không pre-warm, render đầu của <Document>
// chạy trước khi share kịp resolve → "_jsx2 is not a function" (race thắng/thua
// tuỳ navigation flow). Cache là global trên trang — pre-warm 1 lần ở host
// che phủ mọi remote.
void import("react/jsx-runtime");

// Shell owns i18n init — MỘT instance duy nhất, remotes dùng qua MF singleton.
const i18n = initI18n({
  resources: shellResources,
  lng: localStorage.getItem(LANG_STORAGE_KEY) ?? "vi",
});

// setTokenGetter registration (spec §2 SF-6): shell đăng ký token-getter vào
// api-client singleton LÚC INIT — KHÔNG React context xuyên MF boundary; mọi
// request RTK Query/axios của remotes tự mang Bearer token từ session (SF-4:
// access token OIDC). 401 từ BFF → redirect login.
registerTokenGetter();
installUnauthorizedInterceptor();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      {/* RRD singleton → shell owns BrowserRouter (spec §2.7) */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>,
);

// SF-23 T1: PWA — đăng ký service worker (silent no-op khi không hỗ trợ).
registerServiceWorker();
// SF-23 T6: OneSignal web push (env-gated — VITE_ONESIGNAL_APP_ID trống → no-op).
initOneSignal();
// SF-23 T7: GA4 dual-mode (env-gated — VITE_GA_MEASUREMENT_ID trống → off-mode
// buffer, không network). Review P0 nhóm C: thiếu lệnh gọi này → on-mode chết.
initAnalytics();
