import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from 'antd';
import {
  ProfileOutlined,
  SolutionOutlined,
  PrinterOutlined,
  EnvironmentOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { usePermissions, sharedCssVariables } from '@hub-store/shared';
import type { ShellSession } from '../../auth/oidc';
import { NAV_ROUTES } from '../../nav';

// Tokens §7 — sidebar 48px dark, header 55px trắng, FPT orange qua LESS modifyVars.
const SIDEBAR_WIDTH = 48;
const HEADER_HEIGHT = 55;

/** Icon map theo path — data route/permission nằm ở src/nav.ts (shared với LoginPage). */
const NAV_ICONS: Record<string, ReactNode> = {
  '/hub-store-order/order': <ProfileOutlined />,
  '/hub-store-order/batch': <SolutionOutlined />,
  '/hub-store-order/batch/print': <PrinterOutlined />,
  '/area-staff': <EnvironmentOutlined />,
};

/**
 * AppLayout — chrome shell theo tokens §7: sidebar 48px dark (nav icon filter
 * theo permission), header 55px trắng (title / VI-EN / user / logout), main =
 * mount region cho remotes. ConfigProvider wrap từ App (ngoài).
 * SF-4: role đến từ Keycloak (realm role) — role switcher dev-stub đã bỏ.
 */
export default function AppLayout(props: {
  session: ShellSession;
  lang: string;
  onToggleLanguage: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('shell');
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleNav = NAV_ROUTES.filter((item) => can(item.permission));

  return (
    <div
      style={{ ...(sharedCssVariables as React.CSSProperties), display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <header
        style={{
          height: HEADER_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: '#FFFFFF',
          borderBottom: '1px solid #EAECF0',
        }}
        data-testid="app-header"
      >
        <strong style={{ fontSize: 16, color: '#101828' }}>{t('header.title')}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#475467' }} data-testid="header-user">
            {props.session.sub}
          </span>
          <Button size="small" onClick={props.onToggleLanguage} data-testid="lang-toggle">
            {props.lang.startsWith('vi') ? 'EN' : 'VI'}
          </Button>
          <Button size="small" icon={<LogoutOutlined />} onClick={props.onSignOut} data-testid="logout-button">
            {t('auth.logout')}
          </Button>
        </div>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav
          style={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            background: '#001529',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            paddingTop: 12,
          }}
          data-testid="app-sidebar"
        >
          {visibleNav.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Tooltip key={item.path} title={t(item.labelKey)} placement="right">
                <a
                  href={item.path}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.path);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 2,
                    fontSize: 16,
                    textDecoration: 'none',
                    color: active ? '#FFFFFF' : '#A6ADB4',
                    background: active ? '#EB6E09' : 'transparent',
                  }}
                  data-testid={`nav-${item.labelKey.split('.')[1]}`}
                >
                  {NAV_ICONS[item.path]}
                </a>
              </Tooltip>
            );
          })}
        </nav>
        <main style={{ flex: 1, minWidth: 0, padding: 16 }} data-testid="remote-mount">
          {props.children}
        </main>
      </div>
    </div>
  );
}
