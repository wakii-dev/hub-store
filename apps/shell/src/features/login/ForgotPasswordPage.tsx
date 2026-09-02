import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Result } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';
import { getAxiosInstance } from '@hub-store/api-client';

/**
 * Forgot password (SF-4 C1 — DEV-ONLY): nhập username + password mới → BFF
 * /auth/reset-password → Keycloak Admin API set password. KHÔNG email, KHÔNG
 * OTP — không có bước xác minh danh tính, CHỈ DÀNH CHO DEV (production cần
 * OTP email hoặc Keycloak built-in forgot-password — xem README).
 *
 * Page MỚI, không đụng DOM/testid mà E2E business specs phụ thuộc.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation('shell');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: { username: string; newPassword: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await getAxiosInstance().post('/auth/reset-password', {
        username: values.username,
        newPassword: values.newPassword,
      });
      setDone(true);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('auth.forgot.error');
      setError(message);
    } finally {
      setSubmitting(false);
    }
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
      data-testid="forgot-password-page"
    >
      <Card
        style={{
          width: 380,
          borderRadius: DESIGN_TOKENS.radius.modal,
          boxShadow: DESIGN_TOKENS.shadow.lg,
          border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        }}
      >
        {done ? (
          <Result status="success" title={t('auth.forgot.success')} />
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h1
                style={{
                  fontSize: DESIGN_TOKENS.typography.h2.fontSize,
                  fontWeight: DESIGN_TOKENS.typography.h2.fontWeight,
                  color: DESIGN_TOKENS.color.textStrong,
                  margin: 0,
                }}
              >
                {t('auth.forgot.title')}
              </h1>
            </div>
            <Alert
              type="warning"
              showIcon
              message={t('auth.forgot.devWarning')}
              style={{ marginBottom: 16, fontSize: 12 }}
            />
            {error ? (
              <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
            ) : null}
            <Form layout="vertical" onFinish={(values) => void handleSubmit(values as { username: string; newPassword: string })}>
              <Form.Item
                label={t('auth.forgot.username')}
                name="username"
                rules={[{ required: true }]}
              >
                <Input data-testid="forgot-username" />
              </Form.Item>
              <Form.Item
                label={t('auth.forgot.newPassword')}
                name="newPassword"
                rules={[{ required: true, min: 6 }]}
              >
                <Input.Password data-testid="forgot-new-password" />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting}
                data-testid="forgot-submit"
              >
                {t('auth.forgot.submit')}
              </Button>
            </Form>
          </>
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link
            to="/"
            style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.primary, fontWeight: 600 }}
            data-testid="back-to-login-link"
          >
            {t('auth.forgot.backToLogin')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
