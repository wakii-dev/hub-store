import { lazy, useEffect, useState } from "react";
import { ConfigProvider, Result } from "antd";
import enUS from "antd/es/locale/en_US";
import viVN from "antd/es/locale/vi_VN";
import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePermissions, type Permission, type Role } from "@hub-store/shared";
import { LANG_STORAGE_KEY } from "./i18n";
import { getSession, restoreSession } from "./auth/session";
import type { AuthSession } from "./auth/session";
import AppLayout from "./features/layout/AppLayout";
import LoginPage from "./features/login/LoginPage";
import RemoteBoundary from "./RemoteBoundary";

// Federation lazy imports — exposes contract ĐÃ PIN (spec §2.7)
const D1Page = lazy(() => import("orders/D1Page"));
const BatchListPage = lazy(() => import("fulfillment/BatchListPage"));
const PrintPage = lazy(() => import("fulfillment/PrintPage"));

function NotFound() {
  const { t } = useTranslation("shell");
  return <Result status="404" title={t("notfound.title")} />;
}

/** Route gating §2 — chặn Ở TẦNG SHELL ROUTE MOUNT (trước remote render). */
function RequirePermission(props: { permission: Permission; children: React.ReactNode }) {
  const { t } = useTranslation("shell");
  const { can } = usePermissions();
  if (!can(props.permission)) {
    return (
      <div data-testid="forbidden">
        <Result status="403" title={t("forbidden.title")} subTitle={t("forbidden.subtitle")} />
      </div>
    );
  }
  return <>{props.children}</>;
}

/**
 * Shell root: chưa đăng nhập → LoginPage (stub); đã đăng nhập → AppLayout +
 * routes (role-gated) + ConfigProvider (locale theo lang) wrap TOÀN BỘ vùng
 * mount remote (antd singleton đã pin SF-1 → hiệu lực cả trong remotes).
 */
export default function App() {
  const { t, i18n } = useTranslation("shell");
  const [session, setSession] = useState<AuthSession | null>(() => getSession());
  const [lang, setLang] = useState(i18n.language);

  useEffect(() => {
    const onChange = (lng: string) => setLang(lng);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);

  // Boot: verify token thật (signature + exp) — hết hạn → về login.
  useEffect(() => {
    void restoreSession().then((restored) => setSession(restored));
  }, []);

  const toggleLanguage = () => {
    const next = lang.startsWith("vi") ? "en" : "vi";
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  const handleSignIn = (_sub: string, _role: Role) => setSession(getSession());

  if (!session) {
    return (
      <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
        <LoginPage onSignIn={handleSignIn} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
      <AppLayout
        session={session}
        lang={lang}
        onToggleLanguage={toggleLanguage}
        onSignOut={() => setSession(null)}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/hub-store-order/order" replace />} />
          <Route
            path="/hub-store-order/order"
            element={
              <RequirePermission permission="orders.view">
                <RemoteBoundary>
                  <D1Page />
                </RemoteBoundary>
              </RequirePermission>
            }
          />
          <Route
            path="/hub-store-order/batch"
            element={
              <RequirePermission permission="fulfillment.view">
                <RemoteBoundary>
                  <BatchListPage />
                </RemoteBoundary>
              </RequirePermission>
            }
          />
          <Route
            path="/hub-store-order/batch/print"
            element={
              <RequirePermission permission="fulfillment.print">
                <RemoteBoundary>
                  <PrintPage />
                </RemoteBoundary>
              </RequirePermission>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </ConfigProvider>
  );
}
