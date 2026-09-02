/**
 * techHelpers — pure helpers màn tech service (SF-20) — test-first.
 */
import { DESIGN_TOKENS } from '@hub-store/shared';
import { TECH_STATUSES, type SuggestedTechnicianDto, type TechStatus } from './techApi';

export type StatusTone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/** 10 mã trạng thái → tone pastel semantic SF-6 §1.1 (tokens-only). */
export const STATUS_TONE_MAP: Readonly<Record<TechStatus, StatusTone>> = {
  NEW: 'info',
  CONFIRMED: 'info',
  PROCESSING: 'warning',
  SHIPPING: 'warning',
  DELIVERED: 'success',
  FAILED: 'error',
  REDELIVERY: 'warning',
  RESCHEDULED: 'warning',
  CANCELLED: 'error',
  RETURNED: 'neutral',
};

/** Unknown status → info (an toàn như StatusTag shared). */
export function statusTone(status: string): StatusTone {
  return (STATUS_TONE_MAP as Readonly<Record<string, StatusTone>>)[status] ?? 'info';
}

/** Tone → { text, bg, line } từ DESIGN_TOKENS (không hex cứng ngoài tokens). */
export function toneColors(tone: StatusTone): { text: string; bg: string; line: string } {
  const s = DESIGN_TOKENS.color.status;
  switch (tone) {
    case 'success':
      return { text: s.success, bg: s.successBg, line: s.successLine };
    case 'error':
      return { text: s.error, bg: s.errorBg, line: s.errorLine };
    case 'warning':
      return { text: s.warning, bg: s.warningBg, line: s.warningLine };
    case 'info':
      return { text: s.info, bg: s.infoBg, line: s.infoLine };
    case 'neutral':
      return { text: s.neutral, bg: s.neutralBg, line: s.neutralLine };
  }
}

/** Options cho MultiSelect trạng thái (value = string wire). */
export function statusOptions(locale: 'vi' | 'en'): { label: string; value: string }[] {
  return TECH_STATUSES.map((s) => ({ label: statusLabel(s, locale), value: s }));
}

export function statusLabel(status: string, locale: 'vi' | 'en'): string {
  const vi: Record<TechStatus, string> = {
    NEW: 'Mới',
    CONFIRMED: 'Đã xác nhận',
    PROCESSING: 'Đang xử lý',
    SHIPPING: 'Đang giao',
    DELIVERED: 'Đã giao',
    FAILED: 'Giao thất bại',
    REDELIVERY: 'Giao lại',
    RESCHEDULED: 'Đổi lịch',
    CANCELLED: 'Đã hủy',
    RETURNED: 'Đã trả về',
  };
  const en: Record<TechStatus, string> = {
    NEW: 'New',
    CONFIRMED: 'Confirmed',
    PROCESSING: 'Processing',
    SHIPPING: 'Shipping',
    DELIVERED: 'Delivered',
    FAILED: 'Failed',
    REDELIVERY: 'Redelivery',
    RESCHEDULED: 'Rescheduled',
    CANCELLED: 'Cancelled',
    RETURNED: 'Returned',
  };
  const map = locale === 'en' ? en : vi;
  return (map as Record<string, string>)[status] ?? status;
}

/**
 * Guard timeline JSONB passthrough — chỉ nhận array các entry hợp lệ;
 * mọi shape khác → [] (render guarded, không crash).
 */
export function parseTimeline(raw: unknown): { at: string; status: string; note: string; actor: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map((e) => ({
      at: typeof e.at === 'string' ? e.at : '',
      status: typeof e.status === 'string' ? e.status : '',
      note: typeof e.note === 'string' ? e.note : '',
      actor: typeof e.actor === 'string' ? e.actor : '',
    }));
}

/** YYYY-MM-DD từ ISO-8601/date string; rỗng/không parse được → ''. */
export function dayOf(iso: string): string {
  if (!iso) return '';
  const datePart = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
}

/** Hôm nay theo timezone LOCAL (không toISOString/UTC) — filter mặc định. */
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Staff registry derive từ region codes quan sát được trong data. */
export function dedupeRegions(codes: string[]): string[] {
  return [...new Set(codes.filter((c) => c.trim() !== ''))].sort();
}

/** Union suggest lists theo region — dedupe theo code (suggest đã sort workload asc). */
export function unionTechnicians(lists: SuggestedTechnicianDto[][]): SuggestedTechnicianDto[] {
  const byCode = new Map<string, SuggestedTechnicianDto>();
  for (const list of lists) {
    for (const tech of list) {
      if (!byCode.has(tech.code)) byCode.set(tech.code, tech);
    }
  }
  return [...byCode.values()];
}
