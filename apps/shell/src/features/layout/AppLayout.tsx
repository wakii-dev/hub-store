import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from 'antd';
import {
  DashboardOutlined,
  ProfileOutlined,
  SolutionOutlined,
  PrinterOutlined,
  ToolOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  SendOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  KeyOutlined,
  MenuOutlined,
  MenuFoldOutlined,
} from '@ant-design/icons';
import { DESIGN_TOKENS, usePermissions, sharedCssVariables } from '@hub-store/shared';
import type { ShellSession } from '../../auth/oidc';
import { NAV_ROUTES } from '../../nav';
import { AvatarUpload } from './AvatarUpload';
import FontSizeSlider from './FontSizeSlider';
import FullscreenToggle from './FullscreenToggle';
import HotkeyHelperModal from './HotkeyHelperModal';
import VersionCheck from './VersionCheck';

// Tokens SF-6 §1.4 — rail 64px #101828, header 60px trắng, FPT orange gradient.
const SIDEBAR_WIDTH = DESIGN_TOKENS.layout.sidebarWidth; // 64
const HEADER_HEIGHT = DESIGN_TOKENS.layout.headerHeight; // 60

/** Icon map theo path — data route/permission nằm ở src/nav.ts (shared với LoginPage). */
const NAV_ICONS: Record<string, ReactNode> = {
  '/hub-store-order/dashboard': <DashboardOutlined />,
  '/hub-store-order/order': <ProfileOutlined />,
  '/hub-store-order/batch': <SolutionOutlined />,
  '/hub-store-order/batch/print': <PrinterOutlined />,
  '/hub-store-order/tech': <ToolOutlined />,
  '/users': <TeamOutlined />,
  '/area-staff': <EnvironmentOutlined />,
  '/hub-store-order/d2c': <SendOutlined />,
  '/audit': <FileSearchOutlined />,
};

/** Logo gradient cam — hand-off §2.1 (34×34 header, 36×36 rail). */
function GradientLogo({ size }: { size: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: DESIGN_TOKENS.color.primaryGradient,
        boxShadow: DESIGN_TOKENS.shadow.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: DESIGN_TOKENS.color.bgWhite,
        fontWeight: 700,
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      IS
    </div>
  );
}

/**
 * AppLayout — chrome shell theo SF-6 direction B (hand-off §2.1): rail 64px
 * #101828 (nav icon 40×40, active gradient + indicator — class sf6-nav-*,
 * CSS trong sf6-antd-overrides.css), header 60px trắng shadow.xs (logo
 * gradient + 2 dòng text / VI-EN pill / user chip / logout ghost), main =
 * mount region cho remotes. ConfigProvider wrap từ App (ngoài).
 * SF-4: role đến từ Keycloak (realm role) — role switcher dev-stub đã bỏ.
 * DOM/testid giữ nguyên (app-header, app-sidebar, nav-*, lang-toggle,
 * logout-button, header-user, remote-mount).
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
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);

  // SF-11 (FI-256 Task 3) — nav off-canvas ≤768px: hamburger toggle class
  // sf11-nav-open trên wrapper (CSS trong sf6-antd-overrides.css); route change
  // → auto-close. Desktop (1440×900): navOpen luôn false → không render thêm gì.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const visibleNav = NAV_ROUTES.filter((item) => can(item.permission));

  const langPillStyle: CSSProperties = {
    height: 34,
    padding: '0 14px',
    borderRadius: DESIGN_TOKENS.radius.pill,
    border: `1px solid ${DESIGN_TOKENS.color.divider}`,
    background: DESIGN_TOKENS.color.bgWhite,
    boxShadow: DESIGN_TOKENS.shadow.xs,
    color: DESIGN_TOKENS.color.textSecondary,
    fontSize: 12.5,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'all .15s ease',
  };

  return (
    <div
      className={navOpen ? 'sf11-nav-open' : undefined}
      style={{ ...(sharedCssVariables as CSSProperties), display: 'flex', flexDirection: 'column', minHeight: '100vh', background: DESIGN_TOKENS.color.bgSubtle }}
    >
      {navOpen && (
        <div
          aria-hidden="true"
          className="sf11-nav-backdrop"
          onClick={() => setNavOpen(false)}
        />
      )}
      <header
        style={{
          height: HEADER_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: DESIGN_TOKENS.color.bgWhite,
          borderBottom: `1px solid ${DESIGN_TOKENS.color.divider}`,
          boxShadow: DESIGN_TOKENS.shadow.xs,
          position: 'relative',
          zIndex: 10,
        }}
        data-testid="app-header"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* SF-11 — hamburger nav ≤768px (element MỚI, display:none desktop qua CSS) */}
          <button
            type="button"
            className="sf11-nav-toggle"
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
            data-testid="sf11-nav-toggle"
          >
            {navOpen ? <MenuFoldOutlined /> : <MenuOutlined />}
          </button>
          <GradientLogo size={34} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <strong style={{ fontSize: 14.5, fontWeight: 700, color: DESIGN_TOKENS.color.textStrong }}>
              {t('header.title')}
            </strong>
            <span style={{ fontSize: 11, color: DESIGN_TOKENS.color.textMuted }}>
              {t('header.subtitle')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* SF-21 D6: font-size slider — node MỚI, không đổi testid header có sẵn. */}
          <FontSizeSlider />
          {/* SF-21 D7/D8: fullscreen toggle + version badge/prompt — nodes MỚI. */}
          <FullscreenToggle />
          {/* SF-21 D5: hotkey helper — node MỚI, mở bảng phím tắt. */}
          <Tooltip title="Phím tắt">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => setHotkeyHelpOpen(true)}
              data-testid="hotkey-helper-button"
              aria-label="Phím tắt"
            />
          </Tooltip>
          <VersionCheck />
          <span
            style={{ ...langPillStyle }}
            onClick={props.onToggleLanguage}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onToggleLanguage();
              }
            }}
            data-testid="lang-toggle"
            role="button"
            tabIndex={0}
          >
            {props.lang.startsWith('vi') ? 'VI' : 'EN'}
          </span>
          <span
            style={{
              height: 34,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 12px 0 6px',
              borderRadius: DESIGN_TOKENS.radius.pill,
              border: `1px solid ${DESIGN_TOKENS.color.divider}`,
              background: DESIGN_TOKENS.color.bgWhite,
              boxShadow: DESIGN_TOKENS.shadow.xs,
            }}
          >
            {/* SF-21: avatar upload chip — fallback initials như cũ (span
                aria-hidden giữ nguyên DOM fallback, testid không đổi). */}
            <AvatarUpload
              userId={props.session.sub}
              size={28}
              fallback={
                <span
                  aria-hidden="true"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: DESIGN_TOKENS.color.primaryGradient,
                    color: DESIGN_TOKENS.color.bgWhite,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textTransform: 'uppercase',
                  }}
                >
                  {props.session.sub.slice(0, 2)}
                </span>
              }
            />
            <span style={{ fontSize: 12.5, fontWeight: 500, color: DESIGN_TOKENS.color.textPrimary }} data-testid="header-user">
              {props.session.sub}
            </span>
          </span>
          <Button type="text" icon={<LogoutOutlined />} onClick={props.onSignOut} data-testid="logout-button">
            {t('auth.logout')}
          </Button>
        </div>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav
          style={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            background: DESIGN_TOKENS.color.sidebar,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '14px 0',
          }}
          data-testid="app-sidebar"
        >
          <GradientLogo size={36} />
          <div style={{ height: 10 }} />
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
                  className={active ? 'sf6-nav-item sf6-nav-item-active' : 'sf6-nav-item'}
                  style={{
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: DESIGN_TOKENS.radius.lg,
                    fontSize: 17,
                    textDecoration: 'none',
                    color: active ? DESIGN_TOKENS.color.bgWhite : DESIGN_TOKENS.color.textFaint,
                  }}
                  data-testid={`nav-${item.labelKey.split('.')[1]}`}
                >
                  {NAV_ICONS[item.path]}
                </a>
              </Tooltip>
            );
          })}
        </nav>
        <main style={{ flex: 1, minWidth: 0, padding: '24px 28px' }} data-testid="remote-mount">
          {props.children}
        </main>
      </div>
      <HotkeyHelperModal open={hotkeyHelpOpen} onClose={() => setHotkeyHelpOpen(false)} />
    </div>
  );
}
