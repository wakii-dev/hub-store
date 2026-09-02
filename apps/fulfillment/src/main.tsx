import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
// antd 4 full LESS source — primary #EB6E09 qua vite less modifyVars (xem vite.config.ts)
import "antd/dist/antd.less";
import "@hub-store/shared/src/theme/sf6-antd-overrides.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "@hub-store/shared";
import { fulfillmentResources } from "./i18n";

// Init i18n TRƯỚC, rồi mới dynamic-import App để garant thứ tự:
// các exposed page đăng ký resources tại module top-level qua getI18n().
initI18n({ resources: fulfillmentResources });

void import("./App").then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
