import { DESIGN_TOKENS } from './design-tokens';

export { DESIGN_TOKENS } from './design-tokens';

/**
 * sharedTheme — theme preset §7 cho apps consuming packages/shared.
 *
 * ⚠ antd 4.24 CONSTRAINT (verified against antd 4.24.16 types):
 * ConfigProvider của antd 4 KHÔNG có prop `theme` (đó là antd 5).
 * Trong antd 4, màu/radius customization xảy ra tại BUILD TIME qua
 * LESS variables. Vì vậy preset này expose:
 *   - `sharedTheme`          : token object thuần (single source cho app-level styling)
 *   - `antdLessModifyVars`   : cắm vào LESS build (Vite: css.preprocessorOptions.less.modifyVars)
 *   - `sharedCssVariables`   : CSS custom properties tên theo §7 cho non-antd styling
 *
 * FONT — apps PHẢI tự load Roboto (không bundle font binary ở đây):
 *   pnpm add @fontsource/roboto
 *   import '@fontsource/roboto/400.css';
 *   import '@fontsource/roboto/500.css';
 *   import '@fontsource/roboto/700.css';
 * (hoặc @font-face tương đương trong app entry — shell SF-6 owns thực thi)
 */
export const sharedTheme = {
  primary: DESIGN_TOKENS.color.primary,
  borderRadius: DESIGN_TOKENS.radius.control,
  borderRadiusLG: DESIGN_TOKENS.radius.popup,
  fontFamily: DESIGN_TOKENS.fontFamily,
  /** §7 body 16px (antd default 14 — override có chủ đích) */
  fontSize: DESIGN_TOKENS.typography.body.fontSize,
  typography: DESIGN_TOKENS.typography,
  color: DESIGN_TOKENS.color,
  layout: DESIGN_TOKENS.layout,
} as const;

export type SharedTheme = typeof sharedTheme;

/** antd 4 LESS variables — biến tên theo antd 4 default theme. */
export const antdLessModifyVars: Record<string, string> = {
  '@primary-color': DESIGN_TOKENS.color.primary,
  '@border-radius-base': `${DESIGN_TOKENS.radius.control}px`,
  '@border-radius-lg': `${DESIGN_TOKENS.radius.popup}px`,
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
};

/** CSS custom properties — tên y hệt §7. */
export const sharedCssVariables: Record<string, string> = {
  '--primary': DESIGN_TOKENS.color.primary,
  '--text-strong': DESIGN_TOKENS.color.textStrong,
  '--text-primary': DESIGN_TOKENS.color.textPrimary,
  '--text-secondary': DESIGN_TOKENS.color.textSecondary,
  '--text-muted': DESIGN_TOKENS.color.textMuted,
  '--border': DESIGN_TOKENS.color.border,
  '--divider': DESIGN_TOKENS.color.divider,
  '--bg-subtle': DESIGN_TOKENS.color.bgSubtle,
  '--bg-white': DESIGN_TOKENS.color.bgWhite,
  '--success': DESIGN_TOKENS.color.status.success,
  '--success-bg': DESIGN_TOKENS.color.status.successBg,
  '--error': DESIGN_TOKENS.color.status.error,
  '--warning': DESIGN_TOKENS.color.status.warning,
  '--warning-bg': DESIGN_TOKENS.color.status.warningBg,
  '--info': DESIGN_TOKENS.color.status.info,
  '--info-bg': DESIGN_TOKENS.color.status.infoBg,
  '--radius-control': `${DESIGN_TOKENS.radius.control}px`,
  '--radius-popup': `${DESIGN_TOKENS.radius.popup}px`,
  '--sidebar-width': `${DESIGN_TOKENS.layout.sidebarWidth}px`,
  '--header-height': `${DESIGN_TOKENS.layout.headerHeight}px`,
};
