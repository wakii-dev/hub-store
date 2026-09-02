import { DESIGN_TOKENS } from '../../theme/design-tokens';

/** Tone preset — 4 tokens duy nhất (SF-6 §1.1 status pastel). Single-source với theme. */
export type StatusTone = 'success' | 'error' | 'warning' | 'info';

/** Tone → pastel background (antd Tag color prop giữ mechanism này). */
export const STATUS_TAG_TOKENS: Record<StatusTone, string> = {
  success: DESIGN_TOKENS.color.status.successBg,
  error: DESIGN_TOKENS.color.status.errorBg,
  warning: DESIGN_TOKENS.color.status.warningBg,
  info: DESIGN_TOKENS.color.status.infoBg,
};

/** Tone → solid text color (chữ + chấm tròn ::before currentColor). */
export const STATUS_TAG_TEXT: Record<StatusTone, string> = {
  success: DESIGN_TOKENS.color.status.success,
  error: DESIGN_TOKENS.color.status.error,
  warning: DESIGN_TOKENS.color.status.warning,
  info: DESIGN_TOKENS.color.status.info,
};

/** Tone → border line color (pattern Untitled-UI pastel). */
export const STATUS_TAG_LINE: Record<StatusTone, string> = {
  success: DESIGN_TOKENS.color.status.successLine,
  error: DESIGN_TOKENS.color.status.errorLine,
  warning: DESIGN_TOKENS.color.status.warningLine,
  info: DESIGN_TOKENS.color.status.infoLine,
};

export type StatusTagKind =
  | 'batchStatus'
  | 'orderStatus'
  | 'coordinationStatus'
  | 'batchEntityStatus';

export type StatusLocale = 'vi' | 'en';

/**
 * value → tone. Unknown value → fallback 'info' (xử lý ở StatusTag).
 * Mapping: pending/in-progress → info|warning, done → success, lỗi/hủy → error.
 */
export const STATUS_TAG_TONE_MAPS: Record<
  StatusTagKind,
  Readonly<Record<number, StatusTone>>
> = {
  batchStatus: { 0: 'info', 1: 'warning', 2: 'success', 3: 'error' },
  orderStatus: { 0: 'warning', 1: 'success', 2: 'error' },
  coordinationStatus: { 0: 'info', 1: 'warning', 2: 'success' },
  batchEntityStatus: { 0: 'info', 1: 'success', 2: 'error' },
};

/**
 * Labels VI từ REQUIREMENTS §4 / spec §3.4.
 * EN là bản dịch do SF-1 đề xuất (REQUIREMENTS chỉ có VI) — SF-6 i18n
 * có thể override qua namespace `common.*` nếu cần.
 */
export const STATUS_TAG_LABELS: Record<
  StatusTagKind,
  Readonly<Record<number, { vi: string; en: string }>>
> = {
  batchStatus: {
    0: { vi: 'Chưa soạn', en: 'Not prepared' },
    1: { vi: 'Đang soạn', en: 'Preparing' },
    2: { vi: 'Đã soạn', en: 'Prepared' },
    3: { vi: 'Lỗi vượt trọng lượng', en: 'Weight limit exceeded' },
  },
  orderStatus: {
    0: { vi: 'Chờ duyệt', en: 'Pending approval' },
    1: { vi: 'Đã duyệt', en: 'Approved' },
    2: { vi: 'Từ chối duyệt', en: 'Rejected' },
  },
  coordinationStatus: {
    0: { vi: 'Chờ điều phối', en: 'Pending coordination' },
    1: { vi: 'Đang điều phối', en: 'Coordinating' },
    2: { vi: 'Hoàn tất điều phối', en: 'Coordination completed' },
  },
  batchEntityStatus: {
    0: { vi: 'Đang soạn', en: 'Active' },
    1: { vi: 'Hoàn tất', en: 'Completed' },
    2: { vi: 'Đã hủy', en: 'Cancelled' },
  },
};
