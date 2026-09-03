/**
 * OrderCard — card đơn hôm nay trên MyOrdersPage (SF-25 T4 + T5 actions):
 * code + status pill + khung giờ (expectedTime/deliveryDate) + địa chỉ ngắn
 * (receiver/province) + số món + nút thao tác install (Accept/Complete theo
 * flags BE — BE-authoritative, flag false → không render). Tap card →
 * /order/:code (detail T7). Sau mutate, page thay order trong state →
 * card render lại pill + flags mới từ response.
 */
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';
import type { DeliveryOrderDto, InstallationOrderDto } from '../../api/ktvApi';
import AcceptButton from '../actions/AcceptButton';
import CompleteButton from '../actions/CompleteButton';
import StatusPill from './StatusPill';

export type OrderCardKind = 'install' | 'delivery';

/** Discriminated union — kind narrow được order type lúc render (tsc strict). */
export type OrderCardItem =
  | { kind: 'install'; order: InstallationOrderDto }
  | { kind: 'delivery'; order: DeliveryOrderDto };

/** ISO datetime → HH:mm (+07) — expectedTime seed dạng ISO offset. */
function timeHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/** deliveryDate date-only (YYYY-MM-DD) → dd/MM. */
function dateShort(date: string): string {
  const d = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}

export type OrderCardProps = OrderCardItem & {
  /** session.sub — body technicianCode (BFF vẫn ép từ token — defense-in-depth). */
  technicianCode: string;
  /** Sau mutate: page thay order trong list state (status + buttons mới). */
  onOrderUpdated: (order: InstallationOrderDto) => void;
};

export default function OrderCard(props: OrderCardProps) {
  const { t } = useTranslation('ktvMobile');
  const navigate = useNavigate();
  const code =
    props.kind === 'install' ? props.order.serviceOrderCode : props.order.code;
  const time =
    props.kind === 'install'
      ? timeHm(props.order.expectedTime)
      : dateShort(props.order.deliveryDate);
  const receiver = props.kind === 'install' ? '' : props.order.receiver.name;
  const address = receiver
    ? `${receiver} · ${props.order.province}`
    : props.order.province;

  return (
    <div
      data-testid={`ktv-order-card-${code}`}
      role="button"
      tabIndex={0}
      onClick={() => void navigate(`/order/${encodeURIComponent(code)}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void navigate(`/order/${encodeURIComponent(code)}`);
        }
      }}
      style={{
        background: DESIGN_TOKENS.color.bgWhite,
        border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        borderRadius: DESIGN_TOKENS.radius.lg,
        boxShadow: DESIGN_TOKENS.shadow.xs,
        padding: '12px 14px',
        marginBottom: 10,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: DESIGN_TOKENS.typography.h3.fontSize,
            fontWeight: 700,
            color: DESIGN_TOKENS.color.textStrong,
          }}
        >
          {code}
        </span>
        <StatusPill status={props.order.status} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: DESIGN_TOKENS.typography.bodySm.fontSize,
          color: DESIGN_TOKENS.color.textSecondary,
        }}
      >
        <span style={{ fontWeight: 600 }}>{time}</span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: DESIGN_TOKENS.color.textMuted,
          }}
        >
          {address}
        </span>
      </div>
      <div style={{ fontSize: DESIGN_TOKENS.typography.caption.fontSize, color: DESIGN_TOKENS.color.textFaint }}>
        {t('myorders.items', { count: props.order.items.length })}
      </div>
      {props.kind === 'install' &&
      (props.order.buttons.allowAccept || props.order.buttons.allowComplete) ? (
        <div
          data-testid={`ktv-actions-${code}`}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: 8, marginTop: 2 }}
        >
          <AcceptButton
            order={props.order}
            technicianCode={props.technicianCode}
            onUpdated={props.onOrderUpdated}
          />
          <CompleteButton
            order={props.order}
            technicianCode={props.technicianCode}
            onUpdated={props.onOrderUpdated}
          />
        </div>
      ) : null}
    </div>
  );
}
