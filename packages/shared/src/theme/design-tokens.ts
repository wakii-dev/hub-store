/**
 * Design tokens — single source, trích REQUIREMENTS §7 (production CSS).
 * Mọi màu/radius/typography trong packages/shared PHẢI dẫn từ đây.
 */
export const DESIGN_TOKENS = {
  color: {
    primary: '#EB6E09', // FPT Orange
    textStrong: '#101828',
    textPrimary: '#1D2939',
    textSecondary: '#475467',
    textMuted: '#98A2B3',
    border: '#D0D5DD',
    divider: '#EAECF0',
    bgSubtle: '#F2F4F7',
    bgWhite: '#FFFFFF',
    status: {
      success: '#389E0D',
      successBg: '#F6FFED',
      error: '#F5222D',
      warning: '#D58F04',
      warningBg: '#FFF6E6',
      info: '#0066D3',
      infoBg: '#ECF1FB',
    },
  },
  /** Typo scale §7: h1 24 bold · h2 20 bold · body 16 · label 14 · caption 12 */
  typography: {
    h1: { fontSize: 24, fontWeight: 700 },
    h2: { fontSize: 20, fontWeight: 700 },
    body: { fontSize: 16 },
    label: { fontSize: 14 },
    caption: { fontSize: 12 },
  },
  /** radius-control 2px (controls/inputs) · radius-popup 8px (modals/popups) */
  radius: { control: 2, popup: 8 },
  layout: { sidebarWidth: 48, headerHeight: 55 },
  fontFamily: "'Roboto', sans-serif",
} as const;
