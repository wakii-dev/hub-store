import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
// antd 4 full LESS source — primary #EB6E09 qua vite less modifyVars (xem vite.config.ts)
import "antd/dist/antd.less";
import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { initI18n } from "@hub-store/shared";
import { LANG_STORAGE_KEY, shellResources } from "./i18n";
import App from "./App";

// Shell owns i18n init — MỘT instance duy nhất, remotes dùng qua MF singleton.
const i18n = initI18n({
  resources: shellResources,
  lng: localStorage.getItem(LANG_STORAGE_KEY) ?? "vi",
});

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
