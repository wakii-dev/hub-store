import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, Input, Select } from 'antd';
import { ROLES, type Role } from '@hub-store/shared';
import { signIn } from '../../auth/session';
import { firstPathForRole } from '../../nav';

/**
 * Login stub — giả lập SSO (spec: KHÔNG OTP/KHÔNG user-pass thật; production
 * đổi sang OIDC theo auth/oidc.ts). Chọn role + tên → ký fake JWT → vào layout.
 */
export default function LoginPage(props: {
  onSignIn: (sub: string, role: Role) => void;
}) {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const [sub, setSub] = useState('dev-user');
  const [role, setRole] = useState<Role>('Coordinator');
  const [signingIn, setSigningIn] = useState(false);

  const handleLogin = async () => {
    setSigningIn(true);
    try {
      await signIn(sub, role);
      props.onSignIn(sub, role);
      // Landing về route ĐẦU TIÊN role được phép (§2) — WarehouseOps không
      // có orders.view, hard-code /order sẽ rơi thẳng vào 403.
      navigate(firstPathForRole(role), { replace: true });
    } finally {
      setSigningIn(false);
    }
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
        <Form layout="vertical">
          <Form.Item label={t('auth.login.username')}>
            <Input value={sub} onChange={(e) => setSub(e.target.value)} data-testid="login-username" />
          </Form.Item>
          <Form.Item label={t('auth.login.role')}>
            <Select<Role> value={role} onChange={setRole} data-testid="login-role" style={{ width: '100%' }}>
              {ROLES.map((r) => (
                <Select.Option key={r} value={r}>
                  {t(`auth.role.${r}`)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
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
        </Form>
      </Card>
    </div>
  );
}
