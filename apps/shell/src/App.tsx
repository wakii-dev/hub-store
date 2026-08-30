import React, { lazy, useEffect, useState } from "react";
import { ConfigProvider } from "antd";
import enUS from "antd/es/locale/en_US";
import viVN from "antd/es/locale/vi_VN";
import { Button, Result } from "antd";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { sharedCssVariables } from "@hub-store/shared";
import { LANG_STORAGE_KEY } from "./i18n";
import RemoteBoundary from "./RemoteBoundary";

// Federation lazy imports — exposes contract ĐÃ PIN (spec §2.7)
const D1Page = lazy(() => import("orders/D1Page"));
const BatchListPage = lazy(() => import("fulfillment/BatchListPage"));
const PrintPage = lazy(() => import("fulfillment/PrintPage"));

const navLinkStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 11,
  textDecoration: "none",
  textAlign: "center",
  lineHeight: 1.2,
};

function NotFound() {
  const { t } = useTranslation("shell");
  return <Result status="404" title={t("notfound.title")} />;
}

/**
 * Shell skeleton — SF-6 sở hữu AppLayout thật; đây chỉ là layout tối thiểu
 * (sidebar 48px dark + header 55px + mount region cho remotes).
 */
export default function App() {
  const { t, i18n } = useTranslation("shell");
  const [lang, setLang] = useState(i18n.language);

  useEffect(() => {
    const onChange = (lng: string) => setLang(lng);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);

  const toggleLanguage = () => {
    const next = lang.startsWith("vi") ? "en" : "vi";
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  return (
    <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
      <div style={{ ...(sharedCssVariables as React.CSSProperties), display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <header
          style={{
            height: 55,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            background: "#fff",
            borderBottom: "1px solid #eee",
          }}
        >
          <strong>{t("header.title")}</strong>
          <Button size="small" onClick={toggleLanguage}>
            {lang.startsWith("vi") ? "EN" : "VI"}
          </Button>
        </header>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Skeleton sidebar — usePermissions + role switcher là của SF-6 */}
          <nav
            style={{
              width: 48,
              flexShrink: 0,
              background: "#001529",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              paddingTop: 16,
            }}
          >
            <Link style={navLinkStyle} to="/hub-store-order/order" title={t("nav.orders")}>
              ĐH
            </Link>
            <Link style={navLinkStyle} to="/hub-store-order/batch" title={t("nav.batch")}>
              PS
            </Link>
            <Link style={navLinkStyle} to="/hub-store-order/batch/print" title={t("nav.print")}>
              In
            </Link>
          </nav>
          <main style={{ flex: 1, minWidth: 0, padding: 16 }}>
            <Routes>
              <Route path="/" element={<Navigate to="/hub-store-order/order" replace />} />
              <Route
                path="/hub-store-order/order"
                element={
                  <RemoteBoundary>
                    <D1Page />
                  </RemoteBoundary>
                }
              />
              <Route
                path="/hub-store-order/batch"
                element={
                  <RemoteBoundary>
                    <BatchListPage />
                  </RemoteBoundary>
                }
              />
              <Route
                path="/hub-store-order/batch/print"
                element={
                  <RemoteBoundary>
                    <PrintPage />
                  </RemoteBoundary>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}
