import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Button, ConfigProvider, Result, Spin } from "antd";
import viVN from "antd/es/locale/vi_VN";
import { I18nextProvider, useTranslation } from "react-i18next";
import { getI18n } from "@hub-store/shared";
import {
  loadCurrentUser,
  onSessionChange,
  sessionFromUser,
  signinCallback,
  signinRedirect,
  signoutRedirect,
  type MobileSession,
} from "./auth/oidc";
import type { User } from "oidc-client-ts";
import BottomNav from "./features/layout/BottomNav";
import MyOrdersPage from "./features/my-orders/MyOrdersPage";
import AccountPage from "./features/account/AccountPage";

/** Spinner full-screen khi đang boot / chờ redirect Keycloak. */
function BootSpinner(props: { tip: string; testid: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      data-testid={props.testid}
    >
      <Spin tip={props.tip} />
    </div>
  );
}

/**
 * OIDC redirect về /callback: hoàn tất PKCE exchange → set user → navigate
 * '/' . StrictMode double-mount → useRef guard (callback chỉ chạy 1 lần) —
 * pattern shell SF-4. Callback chạy ở trạng thái CHƯA login (App route bên
 * ngoài check user) nên session-null trap của shell không xảy ra tại đây.
 */
function CallbackPage(props: { onSignedIn: (user: User) => void }) {
  const { t } = useTranslation("ktvMobile");
  const navigate = useNavigate();
  const handled = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void signinCallback()
      .then((user) => {
        props.onSignedIn(user);
        navigate("/", { replace: true });
      })
      .catch((err: unknown) => {
        console.error("[ktv-mobile] signinCallback failed:", err);
        setError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <Result status="error" title={t("auth.callback.error")} />;
  }
  return <BootSpinner tip={t("auth.callback.loading")} testid="ktv-callback-page" />;
}

/**
 * Chưa đăng nhập → tự signinRedirect sang Keycloak (spinner trong lúc chờ).
 * useRef guard chống lặp (StrictMode double-mount / re-render khi redirect
 * chưa kịp điều hướng).
 */
function LoginGate() {
  const { t } = useTranslation("ktvMobile");
  const redirecting = useRef(false);
  useEffect(() => {
    if (redirecting.current) return;
    redirecting.current = true;
    void signinRedirect();
  }, []);
  return <BootSpinner tip={t("auth.loading")} testid="ktv-login-gate" />;
}

/** Role gate: đã login nhưng không có role technician → 403 + logout. */
function ForbiddenPage(props: { onSignOut: () => void }) {
  const { t } = useTranslation("ktvMobile");
  return (
    <div data-testid="ktv-forbidden">
      <Result status="403" title={t("forbidden.title")} subTitle={t("forbidden.sub")} />
      <div style={{ textAlign: "center" }}>
        <Button type="primary" danger onClick={props.onSignOut}>
          {t("account.logout")}
        </Button>
      </div>
    </div>
  );
}

/** Vùng đã đăng nhập + có role technician: routes + bottom-nav. */
function MobileShell(props: { session: MobileSession; onSignOut: () => void }) {
  return (
    <div style={{ minHeight: "100vh", paddingBottom: "calc(56px + env(safe-area-inset-bottom))" }}>
      <Routes>
        <Route path="/" element={<MyOrdersPage session={props.session} />} />
        <Route
          path="/account"
          element={<AccountPage session={props.session} onSignOut={props.onSignOut} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

/**
 * KTV/CTV mobile root (SF-25 T3): boot → loadCurrentUser (storageState/phiên
 * cũ) → 3 trạng thái tách bạch:
 *   - user === null → LoginGate (auto signinRedirect);
 *   - user đã login NHƯNG không có role technician → ForbiddenPage (403 +
 *     logout — nếu chỉ check session sẽ rơi vào vòng lặp redirect Keycloak:
 *     Keycloak thấy session đang login → redirect về → lại LoginGate...);
 *   - có session (role technician) → MobileShell.
 * /callback mount ở TẦNG NGOÀI (không phụ thuộc trạng thái) — trap shell
 * App.tsx: để sau check đã-login thì PKCE exchange chết tĩnh.
 */
export default function App() {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [authed, setAuthed] = useState(false);
  const [booted, setBooted] = useState(false);

  const applyUser = (user: User | null) => {
    setAuthed(Boolean(user));
    setSession(user ? sessionFromUser(user) : null);
  };

  useEffect(() => {
    onSessionChange({
      onSignedIn: (user) => applyUser(user),
      onSignedOut: () => applyUser(null),
    });
    void loadCurrentUser()
      .then((user) => applyUser(user))
      .finally(() => setBooted(true));
  }, []);

  const onSignOut = () => {
    // Keycloak end-session → redirect về origin; addUserUnloaded set session
    // null theo (fallback set tại đây cho retry — pattern shell).
    applyUser(null);
    void signoutRedirect();
  };

  // Instance i18n do main.tsx init (singleton shared) — react-i18next KHÔNG tự
  // thấy instance factory (createInstance ≠ default i18next global), phải wrap
  // I18nextProvider (pattern orders App.tsx).
  const i18n = getI18n();

  return (
    <I18nextProvider i18n={i18n!}>
    <ConfigProvider locale={viVN}>
      <BrowserRouter>
        {!booted ? (
          <BootSpinner tip="…" testid="ktv-boot-loading" />
        ) : (
          <Routes>
            <Route
              path="/callback"
              element={<CallbackPage onSignedIn={applyUser} />}
            />
            <Route
              path="*"
              element={
                !authed ? (
                  <LoginGate />
                ) : session ? (
                  <MobileShell session={session} onSignOut={onSignOut} />
                ) : (
                  <ForbiddenPage onSignOut={onSignOut} />
                )
              }
            />
          </Routes>
        )}
      </BrowserRouter>
    </ConfigProvider>
    </I18nextProvider>
  );
}
