import { lazy, useEffect, useRef, useState } from "react";
import { ConfigProvider, Result, Spin } from "antd";
import enUS from "antd/es/locale/en_US";
import viVN from "antd/es/locale/vi_VN";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePermissions, type Permission } from "@hub-store/shared";
import {
  loadCurrentUser,
  onSessionChange,
  sessionFromUser,
  signinCallback,
  signoutRedirect,
  type ShellSession,
} from "./auth/oidc";
import { LANG_STORAGE_KEY } from "./i18n";
import { firstPathForRole } from "./nav";
import AppLayout from "./features/layout/AppLayout";
import LoginPage from "./features/login/LoginPage";
import ForgotPasswordPage from "./features/login/ForgotPasswordPage";
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
 * OIDC redirect về /callback (SF-4): hoàn tất PKCE exchange → set session →
 * navigate firstPathForRole (acceptance: về đúng landing theo role).
 * StrictMode double-mount → useRef guard (callback chỉ chạy 1 lần).
 */
function CallbackPage(props: { onSignedIn: (session: ShellSession) => void }) {
  const { t } = useTranslation("shell");
  const navigate = useNavigate();
  const handled = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void signinCallback()
      .then((user) => {
        const session = sessionFromUser(user);
        if (!session) throw new Error("Token không chứa role hợp lệ.");
        props.onSignedIn(session);
        navigate(firstPathForRole(session.role), { replace: true });
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <Result status="error" title={t("auth.callback.error")} />;
  }
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
      data-testid="callback-page"
    >
      <Spin tip={t("auth.callback.loading")} />
    </div>
  );
}

/**
 * Shell root: chưa đăng nhập → LoginPage (OIDC redirect) + ForgotPassword;
 * đã đăng nhập → AppLayout + routes (role-gated) + ConfigProvider wrap TOÀN BỘ
 * vùng mount remote (antd singleton đã pin SF-1 → hiệu lực cả trong remotes).
 * Session sync từ UserManager (events addUserLoaded/Unloaded — silent renew
 * cũng đi qua đây).
 */
export default function App() {
  const { i18n } = useTranslation("shell");
  const [session, setSession] = useState<ShellSession | null>(null);
  const [booted, setBooted] = useState(false);
  const [lang, setLang] = useState(i18n.language);

  useEffect(() => {
    const onChange = (lng: string) => setLang(lng);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);

  // Boot + subscribe: user từ storageState/phiên cũ → session; silent renew /
  // logout về sau cũng cập nhật qua events.
  useEffect(() => {
    onSessionChange({
      onSignedIn: (user) => setSession(sessionFromUser(user)),
      onSignedOut: () => setSession(null),
    });
    void loadCurrentUser()
      .then((user) => setSession(user ? sessionFromUser(user) : null))
      .finally(() => setBooted(true));
  }, []);

  const toggleLanguage = () => {
    const next = lang.startsWith("vi") ? "en" : "vi";
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  if (!booted) {
    return (
      <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
        <div
          style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
          data-testid="boot-loading"
        >
          <Spin />
        </div>
      </ConfigProvider>
    );
  }

  if (!session) {
    return (
      <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
      <Routes>
        <Route path="/callback" element={<CallbackPage onSignedIn={setSession} />} />
        <Route
          path="*"
          element={
            <AppLayout
              session={session}
              lang={lang}
              onToggleLanguage={toggleLanguage}
              onSignOut={() => {
                // Keycloak end-session → redirect về origin; addUserUnloaded
                // set session null theo (fallback set tại đây cho retry).
                setSession(null);
                void signoutRedirect();
              }}
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
          }
        />
      </Routes>
    </ConfigProvider>
  );
}
