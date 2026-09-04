/**
 * Timeline — card tiến trình đơn (SF-25 T7): parse timeline_json passthrough
 * `{at, status, note, actor}` (schema SF-19, BFF append qua 3 RPCs T2), sắp
 * theo `at` TĂNG DẦN (thứ tự mảng không phải contract), render StatusPill +
 * note + giờ vi-VN (+07). Rỗng → EmptyState. Parse guarded — JSON lỗi /
 * entry sai shape → [] (không crash trang detail).
 */
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, EmptyState } from '@hub-store/shared';
import StatusPill from '../my-orders/StatusPill';

export interface TimelineEntry {
  at: string;
  status: string;
  note?: string;
  actor?: string;
}

/** Parse + sort tăng dần theo `at`; entry thiếu at/status bị loại. */
export function parseTimeline(raw: unknown): TimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is TimelineEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as { at?: unknown }).at === 'string' &&
        typeof (e as { status?: unknown }).status === 'string',
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** ISO datetime → vi-VN (+07): "07:00 02/09/2026". ISO hỏng → nguyên văn. */
export function formatTimelineAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(d);
}

export default function Timeline(props: { entries: TimelineEntry[] }) {
  const { t } = useTranslation('ktvMobile');
  if (props.entries.length === 0) {
    return <EmptyState title={t('detail.timeline.empty')} />;
  }
  return (
    <div
      data-testid="ktv-timeline"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {props.entries.map((e, i) => (
        <div key={`${e.at}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusPill status={e.status} />
            <span
              style={{
                fontSize: DESIGN_TOKENS.typography.caption.fontSize,
                color: DESIGN_TOKENS.color.textFaint,
              }}
            >
              {formatTimelineAt(e.at)}
            </span>
          </div>
          {e.note ? (
            <span
              style={{
                fontSize: DESIGN_TOKENS.typography.bodySm.fontSize,
                color: DESIGN_TOKENS.color.textSecondary,
              }}
            >
              {e.note}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
