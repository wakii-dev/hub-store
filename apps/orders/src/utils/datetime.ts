/**
 * datetime helpers — convert DateRange/DateTimeRange picker strings sang
 * ISO-8601 với offset cho BFF/Java.
 *
 * ⚠ Java filter parse `OffsetDateTime.parse` (InMemoryOrderRepository):
 * format string của FilterBar primitives ("YYYY-MM-DD" / "YYYY-MM-DD HH:mm")
 * KHÔNG parse được → silently thành Instant.MIN/MAX → filter sai im lặng.
 * Mọi giá trị gửi API PHẢI qua helper bên dưới (moment .toISOString() → UTC 'Z').
 */
import moment from 'moment';

const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';

/** ISO string hoặc undefined nếu input rỗng/không parse được. */
export function toIsoDatetime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = moment(value, [DATETIME_FORMAT, DATE_FORMAT], true);
  return m.isValid() ? m.toISOString() : undefined;
}

/**
 * Ngày đơn lẻ → ISO: `from` = 00:00, `to` = 23:59:59.999 (endOf day) —
 * dùng cho filter "Thời gian tạo đơn" (date range, không có giờ).
 */
export function toIsoDateBoundary(value: string | undefined, edge: 'from' | 'to'): string | undefined {
  if (!value) return undefined;
  const m = moment(value, DATE_FORMAT, true);
  if (!m.isValid()) return undefined;
  return (edge === 'from' ? m.startOf('day') : m.endOf('day')).toISOString();
}

export { DATE_FORMAT, DATETIME_FORMAT };
