/**
 * Design tokens — SF-6 direction B "Modern SaaS Airy" (user-chosen).
 * Source of truth: docs/superpowers/designs/sf6-direction.md §1.
 * Mọi màu/radius/typography trong packages/shared PHẢI dẫn từ đây.
 */
export const DESIGN_TOKENS = {
  color: {
    primary: '#EB6E09', // FPT Orange
    primaryHover: '#F68A2E',
    primaryActive: '#D96408',
    primaryBg: '#FEF6EE',
    primaryBorder: '#FDEADA',
    primaryGradient:
      'linear-gradient(135deg, #F68A2E 0%, #EB6E09 60%, #D96408 100%)',
    textStrong: '#101828',
    textPrimary: '#1D2939',
    textSecondary: '#344054',
    textMuted: '#667085',
    textFaint: '#98A2B3',
    border: '#D0D5DD',
    divider: '#EAECF0',
    dividerSoft: '#F2F4F7',
    bgSubtle: '#F7F8FA',
    bgWhite: '#FFFFFF',
    bgSoftWhite: '#FCFCFD',
    bgHeaderSticky: '#FBFCFD',
    sidebar: '#101828',
    statAccent: '#C25A06',
    status: {
      success: '#039855',
      successBg: '#ECFDF3',
      successLine: '#ABEFC6',
      error: '#D92D20',
      errorBg: '#FEF3F2',
      errorLine: '#FECDCA',
      warning: '#B54708',
      warningBg: '#FFFAEB',
      warningLine: '#FEDF89',
      info: '#1570EF',
      infoBg: '#EFF8FF',
      infoLine: '#B2DDFF',
      purple: '#6941C6',
      purpleBg: '#F9F5FF',
      purpleLine: '#E9D7FE',
      neutral: '#475467',
      neutralBg: '#F2F4F7',
      neutralLine: '#E4E7EC',
    },
  },
  /** Shadow scale — hand-off §1.3 */
  shadow: {
    xs: '0 1px 2px rgba(16,24,40,.05)',
    sm: '0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)',
    md: '0 6px 16px -4px rgba(16,24,40,.10), 0 2px 6px -2px rgba(16,24,40,.06)',
    lg: '0 20px 48px -12px rgba(16,24,40,.22)',
    primary: '0 3px 10px rgba(235,110,9,.35)',
    focus: '0 0 0 4px rgba(235,110,9,.12)',
  },
  /** Typo scale — hand-off §1.5 (body 14 = density chuẩn SaaS table) */
  typography: {
    h1: { fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontSize: 14, fontWeight: 700 },
    body: { fontSize: 14 },
    bodySm: { fontSize: 13 },
    caption: { fontSize: 12.5 },
    overline: { fontSize: 11, fontWeight: 600 },
  },
  /**
   * Radius scale — hand-off §1.2. `popup` giữ làm deprecated alias của
   * `modal` (plan-critic P0-1: tránh vỡ consumer; gỡ khi repo-wide grep sạch).
   */
  radius: { sm: 5, control: 8, md: 10, lg: 12, xl: 14, card: 16, pill: 999, modal: 20, popup: 20 },
  layout: { sidebarWidth: 64, headerHeight: 60 },
  fontFamily: "'Roboto', sans-serif",
} as const;
