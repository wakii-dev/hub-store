import { useState } from 'react';
import { Button, Card } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';
import { signinRedirect } from '../../auth/oidc';

/**
 * Login (SF-4): OIDC redirect PKCE — nút Đăng nhập → Keycloak hosted login
 * (form username/password của Keycloak; KHÔNG ROPC, KHÔNG gửi password qua
 * shell). Sau verify → /callback → landing firstPathForRole.
 *
 * SF-6 §2.4: card trắng radius 20 shadow.lg trên nền #F7F8FA, logo gradient
 * 40×40, nút gradient full-width h44, link quên mật khẩu cam.
 * Giữ testid login-page/login-submit/forgot-password-link (E2E auth.setup dùng).
 */
export default function LoginPage() {
  const { t } = useTranslation('shell');
  const [signingIn, setSigningIn] = useState(false);

  const handleLogin = () => {
    setSigningIn(true);
    // Redirect rời trang — không cần un-set (navigate đi Keycloak).
    void signinRedirect();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(180deg, rgba(235,110,9,0.03) 0%, ${DESIGN_TOKENS.color.bgSubtle} 40%)`,
      }}
      data-testid="login-page"
    >
      <Card
        style={{
          width: 380,
          borderRadius: DESIGN_TOKENS.radius.modal,
          boxShadow: DESIGN_TOKENS.shadow.lg,
          border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              margin: '0 auto 12px',
              borderRadius: 10,
              background: DESIGN_TOKENS.color.primaryGradient,
              boxShadow: DESIGN_TOKENS.shadow.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            IS
          </div>
          <h1
            style={{
              fontSize: DESIGN_TOKENS.typography.h1.fontSize,
              fontWeight: DESIGN_TOKENS.typography.h1.fontWeight,
              color: DESIGN_TOKENS.color.textStrong,
              margin: 0,
            }}
          >
            {t('auth.login.title')}
          </h1>
          <p style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted, marginTop: 8 }}>
            {t('auth.login.subtitle')}
          </p>
        </div>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={signingIn}
          onClick={handleLogin}
          style={{ height: 44, fontSize: 14, fontWeight: 600 }}
          data-testid="login-submit"
        >
          {t('auth.login.button')}
        </Button>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link
            to="/forgot-password"
            style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.primary, fontWeight: 600 }}
            data-testid="forgot-password-link"
          >
            {t('auth.forgot.link')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
