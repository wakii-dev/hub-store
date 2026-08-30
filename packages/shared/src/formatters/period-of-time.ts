import type { Locale } from './vnd';

export type { Locale } from './vnd';

const pad = (n: number): string => String(n).padStart(2, '0');

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `HH:mm DD/MM/YYYY` — 24h, numeric, locale-neutral (Decision D5+D13). */
function formatDateTime(value: Date | string): string {
  const d = toDate(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * formatPeriodOfTime — D1 column "Thời gian KH mong muốn" (và các cột range khác).
 * Output: `HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY` (en-dash WITH surrounding spaces,
 * no month names — only the label layer translates, never the numbers).
 * No date library dependency.
 */
export function formatPeriodOfTime(
  from: Date | string,
  to: Date | string,
  _locale?: Locale,
): string {
  return `${formatDateTime(from)} – ${formatDateTime(to)}`;
}
