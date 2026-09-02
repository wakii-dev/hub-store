import { DESIGN_TOKENS } from './design-tokens';

export { DESIGN_TOKENS } from './design-tokens';

/**
 * sharedTheme — theme preset SF-6 direction B cho apps consuming packages/shared.
 *
 * ⚠ antd 4.24 CONSTRAINT (verified against antd 4.24.16 types):
 * ConfigProvider của antd 4 KHÔNG có prop `theme` (đó là antd 5).
 * Trong antd 4, màu/radius customization xảy ra tại BUILD TIME qua
 * LESS variables. Vì vậy preset này expose:
 *   - `sharedTheme`          : token object thuần (single source cho app-level styling)
 *   - `antdLessModifyVars`   : cắm vào LESS build (Vite: css.preprocessorOptions.less.modifyVars)
 *   - `sharedCssVariables`   : CSS custom properties cho non-antd styling
 *
 * FONT — apps PHẢI tự load Roboto (không bundle font binary ở đây):
 *   pnpm add @fontsource/roboto
 *   import '@fontsource/roboto/400.css';
 *   import '@fontsource/roboto/500.css';
 *   import '@fontsource/roboto/700.css';
 */
export const sharedTheme = {
  primary: DESIGN_TOKENS.color.primary,
  borderRadius: DESIGN_TOKENS.radius.control,
  borderRadiusLG: DESIGN_TOKENS.radius.modal,
  fontFamily: DESIGN_TOKENS.fontFamily,
  /** §1.5 body 14px (density chuẩn SaaS table — đổi từ 16) */
  fontSize: DESIGN_TOKENS.typography.body.fontSize,
  typography: DESIGN_TOKENS.typography,
  color: DESIGN_TOKENS.color,
  shadow: DESIGN_TOKENS.shadow,
  layout: DESIGN_TOKENS.layout,
} as const;

export type SharedTheme = typeof sharedTheme;

/** antd 4 LESS variables — hand-off sf6-direction §1.1/§1.2/§1.5. */
export const antdLessModifyVars: Record<string, string> = {
  '@primary-color': DESIGN_TOKENS.color.primary,
  '@primary-color-hover': DESIGN_TOKENS.color.primaryHover,
  '@primary-color-active': DESIGN_TOKENS.color.primaryActive,
  '@primary-1': DESIGN_TOKENS.color.primaryBg,
  '@primary-2': DESIGN_TOKENS.color.primaryBorder,
  '@border-radius-base': `${DESIGN_TOKENS.radius.control}px`,
  '@border-radius-lg': `${DESIGN_TOKENS.radius.modal}px`,
  '@font-family': DESIGN_TOKENS.fontFamily,
  '@font-size-base': `${DESIGN_TOKENS.typography.body.fontSize}px`,
  '@heading-color': DESIGN_TOKENS.color.textStrong,
  '@text-color': DESIGN_TOKENS.color.textPrimary,
  '@text-color-secondary': DESIGN_TOKENS.color.textSecondary,
  '@text-color-disabled': DESIGN_TOKENS.color.textMuted,
  '@success-color': DESIGN_TOKENS.color.status.success,
  '@error-color': DESIGN_TOKENS.color.status.error,
  '@warning-color': DESIGN_TOKENS.color.status.warning,
  '@info-color': DESIGN_TOKENS.color.status.info,
  '@border-color-base': DESIGN_TOKENS.color.border,
  '@border-color-split': DESIGN_TOKENS.color.divider,
  '@layout-body-background': DESIGN_TOKENS.color.bgSubtle,
  '@layout-header-background': DESIGN_TOKENS.color.bgWhite,
  '@layout-sider-background': DESIGN_TOKENS.color.sidebar,
  '@component-background': DESIGN_TOKENS.color.bgWhite,
  '@table-padding-vertical': '13px',
  '@table-padding-horizontal': '14px',
};

/** CSS custom properties — SF-6 direction B. */
export const sharedCssVariables: Record<string, string> = {
  '--primary': DESIGN_TOKENS.color.primary,
  '--primary-hover': DESIGN_TOKENS.color.primaryHover,
  '--primary-active': DESIGN_TOKENS.color.primaryActive,
  '--primary-bg': DESIGN_TOKENS.color.primaryBg,
  '--primary-border': DESIGN_TOKENS.color.primaryBorder,
  '--primary-gradient': DESIGN_TOKENS.color.primaryGradient,
  '--text-strong': DESIGN_TOKENS.color.textStrong,
  '--text-primary': DESIGN_TOKENS.color.textPrimary,
  '--text-secondary': DESIGN_TOKENS.color.textSecondary,
  '--text-muted': DESIGN_TOKENS.color.textMuted,
  '--text-faint': DESIGN_TOKENS.color.textFaint,
  '--border': DESIGN_TOKENS.color.border,
  '--divider': DESIGN_TOKENS.color.divider,
  '--divider-soft': DESIGN_TOKENS.color.dividerSoft,
  '--bg-subtle': DESIGN_TOKENS.color.bgSubtle,
  '--bg-white': DESIGN_TOKENS.color.bgWhite,
  '--bg-soft-white': DESIGN_TOKENS.color.bgSoftWhite,
  '--bg-header-sticky': DESIGN_TOKENS.color.bgHeaderSticky,
  '--sidebar-bg': DESIGN_TOKENS.color.sidebar,
  '--stat-accent': DESIGN_TOKENS.color.statAccent,
  '--success': DESIGN_TOKENS.color.status.success,
  '--success-bg': DESIGN_TOKENS.color.status.successBg,
  '--success-line': DESIGN_TOKENS.color.status.successLine,
  '--error': DESIGN_TOKENS.color.status.error,
  '--error-bg': DESIGN_TOKENS.color.status.errorBg,
  '--error-line': DESIGN_TOKENS.color.status.errorLine,
  '--warning': DESIGN_TOKENS.color.status.warning,
  '--warning-bg': DESIGN_TOKENS.color.status.warningBg,
  '--warning-line': DESIGN_TOKENS.color.status.warningLine,
  '--info': DESIGN_TOKENS.color.status.info,
  '--info-bg': DESIGN_TOKENS.color.status.infoBg,
  '--info-line': DESIGN_TOKENS.color.status.infoLine,
  '--purple': DESIGN_TOKENS.color.status.purple,
  '--purple-bg': DESIGN_TOKENS.color.status.purpleBg,
  '--purple-line': DESIGN_TOKENS.color.status.purpleLine,
  '--shadow-xs': DESIGN_TOKENS.shadow.xs,
  '--shadow-sm': DESIGN_TOKENS.shadow.sm,
  '--shadow-md': DESIGN_TOKENS.shadow.md,
  '--shadow-lg': DESIGN_TOKENS.shadow.lg,
  '--shadow-primary': DESIGN_TOKENS.shadow.primary,
  '--shadow-focus': DESIGN_TOKENS.shadow.focus,
  '--radius-sm': `${DESIGN_TOKENS.radius.sm}px`,
  '--radius-control': `${DESIGN_TOKENS.radius.control}px`,
  '--radius-md': `${DESIGN_TOKENS.radius.md}px`,
  '--radius-lg': `${DESIGN_TOKENS.radius.lg}px`,
  '--radius-xl': `${DESIGN_TOKENS.radius.xl}px`,
  '--radius-card': `${DESIGN_TOKENS.radius.card}px`,
  '--radius-pill': `${DESIGN_TOKENS.radius.pill}px`,
  '--radius-modal': `${DESIGN_TOKENS.radius.modal}px`,
  /** deprecated alias — giữ cho consumer cũ, giá trị = modal */
  '--radius-popup': `${DESIGN_TOKENS.radius.modal}px`,
  '--sidebar-width': `${DESIGN_TOKENS.layout.sidebarWidth}px`,
  '--header-height': `${DESIGN_TOKENS.layout.headerHeight}px`,
};
