import { useState } from 'react';
import { Button, Card } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signinRedirect } from '../../auth/oidc';

/**
 * Login (SF-4): OIDC redirect PKCE — nút Đăng nhập → Keycloak hosted login
 * (form username/password của Keycloak; KHÔNG ROPC, KHÔNG gửi password qua
 * shell). Sau verify → /callback → landing firstPathForRole.
 *
 * Giữ design language + testid login-page/login-submit (E2E auth.setup dùng).
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
        background: '#F2F4F7',
      }}
      data-testid="login-page"
    >
      <Card style={{ width: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#101828', margin: 0 }}>
            {t('auth.login.title')}
          </h1>
          <p style={{ fontSize: 12, color: '#98A2B3', marginTop: 8 }}>
            {t('auth.login.subtitle')}
          </p>
        </div>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={signingIn}
          onClick={handleLogin}
          data-testid="login-submit"
        >
          {t('auth.login.button')}
        </Button>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/forgot-password" style={{ fontSize: 12 }} data-testid="forgot-password-link">
            {t('auth.forgot.link')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
