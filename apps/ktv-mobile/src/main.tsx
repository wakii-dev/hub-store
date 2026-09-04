import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
// antd 4 full LESS source — primary #EB6E09 qua vite less modifyVars (xem vite.config.ts)
import "antd/dist/antd.less";
import "@hub-store/shared/src/theme/sf6-antd-overrides.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "@hub-store/shared";
import { installUnauthorizedInterceptor, registerTokenGetter } from "./auth/oidc";
import { ktvMobileResources } from "./i18n";
import { registerServiceWorker } from "./lib/pwa";

// Thứ tự init (SF-25 T3): i18n TRƯỚC (trap SF-20 — resources phải có sẵn trước
// khi App mount) → token getter + 401 interceptor (axios bearer) → PWA SW
// (readyState fast-path) → dynamic-import App.
initI18n({ resources: ktvMobileResources });
registerTokenGetter();
installUnauthorizedInterceptor();
registerServiceWorker();

void import("./App").then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
