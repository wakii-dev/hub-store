/**
 * SF-21 D6 — font-size slider runtime (antd4 KHÔNG có runtime token — LESS
 * compile build-time). Cơ chế: CSS variable `--app-font-size` set trên
 * <html> qua inline style; global stylesheet (sf6-antd-overrides.css) map
 * body font-size = var + `font-size: inherit` cho main text surfaces.
 * Persist localStorage `sf.fontSize` — mọi giá trị user-writable đều clamp.
 */

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 20;
export const FONT_SIZE_DEFAULT = 14;
const FONT_SIZE_STORAGE_KEY = 'sf.fontSize';

/** Clamp về [12, 20] và làm tròn số nguyên. */
export function clampFontSize(n: number): number {
  const int = Math.round(n);
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, int));
}

/** Set CSS variable trên <html> + persist localStorage. */
export function applyFontSize(px: number): void {
  const clamped = clampFontSize(px);
  document.documentElement.style.setProperty('--app-font-size', `${clamped}px`);
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(clamped));
  } catch {
    // localStorage có thể bị chặn (privacy mode) — scale vẫn áp dụng phiên này.
  }
}

/**
 * Đọc localStorage → clamp (giá trị invalid/NaN → default 14), áp dụng và
 * trả về giá trị đã áp. Gọi 1 lần lúc mount AppLayout/header.
 */
export function initFontSizeFromStorage(): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  } catch {
    raw = null;
  }
  const parsed = raw === null ? Number.NaN : Number(raw);
  const px = Number.isFinite(parsed) ? clampFontSize(parsed) : FONT_SIZE_DEFAULT;
  applyFontSize(px);
  return px;
}
