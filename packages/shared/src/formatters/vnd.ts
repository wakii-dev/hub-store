export type Locale = 'vi' | 'en';

/**
 * formatVnd — COD format (Decision D2):
 *  VI: `15.000.000đ`   (dot thousands, `đ` suffix, no space)
 *  EN: `15,000,000 ₫`  (comma thousands, `₫` suffix with space)
 * Pure — no Intl (identical output mọi runtime/ICU version).
 * Non-integer amounts are rounded to the nearest đồng (VND has no decimals).
 */
export function formatVnd(amount: number, locale: Locale = 'vi'): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const separator = locale === 'vi' ? '.' : ',';
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return locale === 'vi' ? `${sign}${grouped}đ` : `${sign}${grouped} ₫`;
}
