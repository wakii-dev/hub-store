import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Select, Tooltip } from 'antd';
import {
  ProfileOutlined,
  SolutionOutlined,
  PrinterOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { ROLES, usePermissions, sharedCssVariables, type Permission, type Role } from '@hub-store/shared';
import { signOut, switchRole, type AuthSession } from '../../auth/session';

// Tokens §7 — sidebar 48px dark, header 55px trắng, FPT orange qua LESS modifyVars.
const SIDEBAR_WIDTH = 48;
const HEADER_HEIGHT = 55;

interface NavItem {
  path: string;
  labelKey: string;
  icon: ReactNode;
  permission: Permission;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/hub-store-order/order',
    labelKey: 'nav.orders',
    icon: <ProfileOutlined />,
    permission: 'orders.view',
  },
  {
    path: '/hub-store-order/batch',
    labelKey: 'nav.batch',
    icon: <SolutionOutlined />,
    permission: 'fulfillment.view',
  },
  {
    path: '/hub-store-order/batch/print',
    labelKey: 'nav.print',
    icon: <PrinterOutlined />,
    permission: 'fulfillment.print',
  },
];

/** Route nào user hiện KHÔNG có quyền xem → đưa về route được phép đầu tiên. */
function firstPermittedPath(can: (p: Permission) => boolean): string {
  return NAV_ITEMS.find((item) => can(item.permission))?.path ?? NAV_ITEMS[2].path;
}

/**
 * AppLayout — chrome shell theo tokens §7: sidebar 48px dark (nav icon filter
 * theo permission), header 55px trắng (title / VI-EN / role switcher / user /
 * logout), main = mount region cho remotes. ConfigProvider wrap từ App (ngoài).
 */
export default function AppLayout(props: {
  session: AuthSession;
  lang: string;
  onToggleLanguage: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('shell');
  const { role, can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [switching, setSwitching] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => can(item.permission));

  // Role switch xong: nếu route hiện tại không còn được phép → về route được phép.
  useEffect(() => {
    if (!switching) return;
    const current = NAV_ITEMS.find((item) => location.pathname.startsWith(item.path));
    if (current && !can(current.permission)) {
      navigate(firstPermittedPath(can), { replace: true });
    }
    setSwitching(false);
  }, [switching, location.pathname, can, navigate]);

  const handleRoleChange = async (next: Role) => {
    if (next === role) return;
    await switchRole(next);
    setSwitching(true);
  };

  const handleSignOut = () => {
    signOut();
    props.onSignOut();
  };

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
          <Select<Role>
            size="small"
            value={role ?? undefined}
            onChange={(next) => void handleRoleChange(next)}
            style={{ minWidth: 140 }}
            data-testid="role-switcher"
          >
            {ROLES.map((r) => (
              <Select.Option key={r} value={r}>
                {t(`auth.role.${r}`)}
              </Select.Option>
            ))}
          </Select>
          <Button size="small" onClick={props.onToggleLanguage} data-testid="lang-toggle">
            {props.lang.startsWith('vi') ? 'EN' : 'VI'}
          </Button>
          <Button size="small" icon={<LogoutOutlined />} onClick={handleSignOut} data-testid="logout-button">
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
                  {item.icon}
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
