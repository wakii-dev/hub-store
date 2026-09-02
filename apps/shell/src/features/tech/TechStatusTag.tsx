/**
 * TechStatusTag — pill trạng thái local theo SF-6 §2.2 (pastel + chấm tròn),
 * màu từ DESIGN_TOKENS qua toneColors. KHÔNG đụng shared StatusTag (kinds
 * của nó không có delivery-status 10 mã; packages/** ngoài touch map).
 */
import { statusLabel, statusTone, toneColors } from './techHelpers';

export function TechStatusTag(props: { status: string; locale?: 'vi' | 'en' }) {
  const tone = statusTone(props.status);
  const colors = toneColors(tone);
  const locale = props.locale ?? 'vi';
  return (
    <span
      className="sf6-status-tag"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 11px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: colors.bg,
        border: `1px solid ${colors.line}`,
        color: colors.text,
      }}
      data-testid={`tech-status-${props.status}`}
    >
      <span
        aria-hidden="true"
        style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }}
      />
      {statusLabel(props.status, locale)}
    </span>
  );
}
