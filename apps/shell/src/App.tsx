import { lazy, useEffect, useRef, useState } from "react";
import { ConfigProvider, notification, Result, Spin } from "antd";
import enUS from "antd/es/locale/en_US";
import viVN from "antd/es/locale/vi_VN";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { pageview, usePermissions, type Permission } from "@hub-store/shared";
import {
  loadCurrentUser,
  onSessionChange,
  sessionFromUser,
  signinCallback,
  signoutRedirect,
  type ShellSession,
} from "./auth/oidc";
import { LANG_STORAGE_KEY } from "./i18n";
import { pollNotifications, type NewNotification } from "./lib/notificationPoller";
import { pushLogin, pushLogout } from "./lib/push";
import { firstPathForRole } from "./nav";
import AppLayout from "./features/layout/AppLayout";
import LoginPage from "./features/login/LoginPage";
import ForgotPasswordPage from "./features/login/ForgotPasswordPage";
import TechServicePage from "./features/tech/TechServicePage";
import UsersPage from "./features/users/UsersPage";
import AuditPage from "./features/audit/AuditPage";
import PrintersPage from "./pages/PrintersPage";
import AreaListPage from "./pages/area-staff/AreaListPage";
import AreaFormPage from "./pages/area-staff/AreaFormPage";
import SettlementPage from "./pages/settlement/SettlementPage";
import RemoteBoundary from "./RemoteBoundary";

// Federation lazy imports — exposes contract ĐÃ PIN (spec §2.7)
const DashboardPage = lazy(() => import("orders/DashboardPage"));
const D1Page = lazy(() => import("orders/D1Page"));
const D2CPage = lazy(() => import("orders/D2CPage"));
const BatchListPage = lazy(() => import("fulfillment/BatchListPage"));
const PrintPage = lazy(() => import("fulfillment/PrintPage"));

function NotFound() {
  const { t } = useTranslation("shell");
  return <Result status="404" title={t("notfound.title")} />;
}

/** SF-23 T7 — GA pageview theo route change (off-mode → window.__gaBuffer). */
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    pageview(location.pathname);
  }, [location.pathname]);
  return null;
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
      .catch((err: unknown) => {
        console.error("[shell] signinCallback failed:", err);
        setError(true);
      });
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

  // SF-23 T6 ⚠ MECHANISM (plan-critic P1): onSessionChange KHÔNG fire khi
  // restore từ storage (boot đi qua loadCurrentUser() → setSession, bypass
  // manager events) — hook pushLogin/pushLogout + polling trên session STATE
  // ở đây che phủ CẢ login mới LẪN boot-restore (external_id sống qua reload).
  // ShellSession = {sub, role} — external_id = sub (preferred_username).
  useEffect(() => {
    if (!session) {
      pushLogout();
      return;
    }
    pushLogin(session.sub);
    const show = (items: NewNotification[]) =>
      items.forEach((n) => notification.info({ message: n.title, description: n.body }));
    const poll = () => pollNotifications().then(show).catch(() => {
      /* poll fail (BFF chưa lên / mạng) — im lặng, chu kỳ sau thử lại */
    });
    void poll();
    const timer = setInterval(() => void poll(), 30_000);
    return () => {
      clearInterval(timer);
      pushLogout();
    };
    // Review nhóm C: dep trên object `session` — identity đổi mỗi setSession
    // (silent renew, poll update) dù sub giữ nguyên → poll/login bị reset vô ích.
    // Chỉ rerun khi identity (sub) thực sự đổi — guard !session bên trong xử
    // lý null.
  }, [session?.sub]);

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
          {/* /callback PHẢI mount khi session còn null — redirect Keycloak về
              đây LÚC CHƯA login; để ở nhánh đã-login thì CallbackPage không
              bao giờ chạy (PKCE exchange chết tĩnh, màn hình kẹt LoginPage). */}
          <Route path="/callback" element={<CallbackPage onSignedIn={setSession} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
        <RouteTracker />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={lang.startsWith("vi") ? viVN : enUS}>
      <Routes>
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
                  path="/hub-store-order/dashboard"
                  element={
                    <RequirePermission permission="dashboard.view">
                      <RemoteBoundary>
                        <DashboardPage />
                      </RemoteBoundary>
                    </RequirePermission>
                  }
                />
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
                  path="/hub-store-order/d2c"
                  element={
                    <RequirePermission permission="d2c.view">
                      <RemoteBoundary>
                        <D2CPage />
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
                {/* SF-20 — màn tech service là shell-owned (không remote): import trực tiếp. */}
                <Route
                  path="/hub-store-order/tech"
                  element={
                    <RequirePermission permission="orders.view">
                      <TechServicePage />
                    </RequirePermission>
                  }
                />
                {/* SF-17 — shell-local pages (KHÔNG qua Module Federation). */}
                <Route
                  path="/area-staff"
                  element={
                    <RequirePermission permission="areastaff.view">
                      <AreaListPage />
                    </RequirePermission>
                  }
                />
                {/* SF-14 — đối soát COD, shell-local (axios wrapper, không RTKQ). */}
                <Route
                  path="/settlement"
                  element={
                    <RequirePermission permission="settlement.view">
                      <SettlementPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <RequirePermission permission="users.manage">
                      <UsersPage currentUsername={session.sub} />
                    </RequirePermission>
                  }
                />
                {/* SF-11 — Audit viewer (Manager-only, shell-local page). */}
                <Route
                  path="/audit"
                  element={
                    <RequirePermission permission="audit.view">
                      <AuditPage />
                    </RequirePermission>
                  }
                />
                {/* SF-21 — quản lý máy in, shell-local (Admin duy nhất). */}
                <Route
                  path="/printers"
                  element={
                    <RequirePermission permission="printers.manage">
                      <PrintersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/area-staff/new"
                  element={
                    <RequirePermission permission="areastaff.manage">
                      <AreaFormPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/area-staff/:code/edit"
                  element={
                    <RequirePermission permission="areastaff.manage">
                      <AreaFormPage />
                    </RequirePermission>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          }
        />
      </Routes>
      <RouteTracker />
    </ConfigProvider>
  );
}
