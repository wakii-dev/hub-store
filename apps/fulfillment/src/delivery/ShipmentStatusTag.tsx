/**
 * ShipmentStatusTag — pill trạng thái vận đơn NVC theo SF-6 §2.2 (pastel +
 * chấm tròn), màu từ DESIGN_TOKENS qua shipmentToneColors. Pattern TechStatusTag
 * (SF-20) — KHÔNG đụng shared StatusTag (kinds numeric không khớp string NVC).
 */
import { shipmentStatusLabel, shipmentStatusTone, shipmentToneColors } from './shipmentStatuses';

export function ShipmentStatusTag(props: { status: string; locale?: 'vi' | 'en' }) {
  const tone = shipmentStatusTone(props.status);
  const colors = shipmentToneColors(tone);
  const locale = props.locale ?? 'vi';
  return (
    <span
      className={`sf6-status-tag sf6-status-tag--${tone}`}
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
      data-testid={`shipment-status-${props.status}`}
    >
      <span
        aria-hidden="true"
        style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }}
      />
      {shipmentStatusLabel(props.status, locale)}
    </span>
  );
}
