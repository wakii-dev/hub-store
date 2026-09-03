/**
 * OrderDetailPage — chi tiết đơn (SF-25 T7, thay stub T4b): route
 * /order/:code. Không có endpoint get-by-code → refetch 2 filter hôm nay
 * (pattern T4) rồi tìm theo code — covers direct URL entry + reload.
 *
 * Contract DTO: installation KHÔNG có receiver/toạ độ (proto
 * InstallationOrder — chỉ province) → ẩn section khách hàng + map card;
 * delivery CÓ receiver (name/phone/location) → PhoneLink tel: + MapView
 * deep-link. Graceful degradation theo data có thật, không tự suy.
 *
 * Nút thao tác accept/complete/reschedule là components Task 5/6 — mount tại
 * ktv-detail-actions (chỉ install); sau mutate state local thay bằng
 * response.order (pill + timeline + flags refresh).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Skeleton } from 'antd';
import { DESIGN_TOKENS, EmptyState } from '@hub-store/shared';
import type { MobileSession } from '../../auth/oidc';
import {
  fetchMyDeliveries,
  fetchMyInstallations,
  type DeliveryOrderDto,
  type InstallationOrderDto,
} from '../../api/ktvApi';
import StatusPill from '../my-orders/StatusPill';
import AcceptButton from '../actions/AcceptButton';
import CompleteButton from '../actions/CompleteButton';
import RescheduleButton from '../actions/RescheduleButton';
import Timeline, { parseTimeline } from './Timeline';
import AddressMapCard from './AddressMapCard';
import PhoneLink from './PhoneLink';

/** Discriminated union — code duy nhất qua cả 2 loại đơn. */
type DetailOrder =
  | { kind: 'install'; order: InstallationOrderDto }
  | { kind: 'delivery'; order: DeliveryOrderDto };

/** ISO datetime → HH:mm (+07) — copy pattern OrderCard.timeHm (không export). */
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

/** coordination là JSONB passthrough unknown — lấy note nếu shape đúng. */
function coordinationNote(coordination: unknown): string | undefined {
  if (coordination && typeof coordination === 'object') {
    const note = (coordination as { note?: unknown }).note;
    if (typeof note === 'string' && note.trim()) return note;
  }
  return undefined;
}

function SectionCard(props: { title: string; testid?: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={props.testid}
      style={{
        background: DESIGN_TOKENS.color.bgWhite,
        border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        borderRadius: DESIGN_TOKENS.radius.lg,
        boxShadow: DESIGN_TOKENS.shadow.xs,
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: DESIGN_TOKENS.typography.overline.fontSize,
          fontWeight: DESIGN_TOKENS.typography.overline.fontWeight,
          textTransform: 'uppercase',
          color: DESIGN_TOKENS.color.textMuted,
        }}
      >
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

export default function OrderDetailPage(props: { session: MobileSession }) {
  const { t } = useTranslation('ktvMobile');
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<DetailOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Guard race: chỉ nhận kết quả request mới nhất (code đổi nhanh).
  const seq = useRef(0);

  const load = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(false);
    // 2 filter song song — URL trực tiếp không biết đơn thuộc tab nào.
    // KHÔNG lọc date: đơn đã reschedule sang ngày mai/gia hạn expectedTime
    // vẫn phải mở được từ URL (e2e S4 — detail = "đơn của mình", mọi ngày).
    void Promise.all([
      fetchMyInstallations(props.session.sub),
      fetchMyDeliveries(props.session.name ?? props.session.sub),
    ]).then(
      ([installations, deliveries]) => {
        if (id !== seq.current) return;
        const install = installations.find((o) => o.serviceOrderCode === code);
        const delivery = deliveries.find((o) => o.code === code);
        setOrder(
          install
            ? { kind: 'install', order: install }
            : delivery
              ? { kind: 'delivery', order: delivery }
              : null,
        );
        setLoading(false);
      },
      (err: unknown) => {
        console.error('[ktv-mobile] fetch order detail failed:', err);
        if (id !== seq.current) return;
        setLoading(false);
        setError(true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, props.session.sub, props.session.name]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ padding: 16 }} data-testid="ktv-detail-loading">
        <Skeleton active title paragraph={{ rows: 1 }} />
        <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 2 }} />
        <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 3 }} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState
          title={t('myorders.load.error')}
          sub={t('myorders.load.errorSub')}
          actionLabel={t('myorders.retry')}
          onAction={load}
        />
      </div>
    );
  }
  if (!order) {
    return (
      <div style={{ padding: 16 }} data-testid="ktv-detail-not-found">
        <EmptyState
          title={t('detail.notFound.title')}
          sub={t('detail.notFound.sub')}
          actionLabel={t('myorders.detail.back')}
          onAction={() => void navigate('/')}
        />
      </div>
    );
  }

  const isInstall = order.kind === 'install';
  const receiver = isInstall ? null : order.order.receiver;
  const timelineEntries = isInstall ? parseTimeline(order.order.timeline) : null;

  // Mutate accept/complete/reschedule (T5/T6): thay order install trong state
  // bằng response.order — pill + timeline + flags refresh từ order mới.
  const handleInstallUpdated = (updated: InstallationOrderDto) => {
    setOrder((prev) => (prev && prev.kind === 'install' ? { kind: 'install', order: updated } : prev));
  };

  return (
    <div style={{ padding: 16 }} data-testid="ktv-order-detail">
      <Button
        type="link"
        onClick={() => void navigate('/')}
        style={{
          paddingLeft: 0,
          color: DESIGN_TOKENS.color.primary,
          fontWeight: 600,
        }}
        data-testid="ktv-detail-back"
      >
        {t('myorders.detail.back')}
      </Button>

      {/* Header: code + status pill + khung giờ. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          margin: '8px 0 14px',
        }}
      >
        <h2
          data-testid="ktv-detail-code"
          style={{
            margin: 0,
            fontSize: DESIGN_TOKENS.typography.h2.fontSize,
            fontWeight: DESIGN_TOKENS.typography.h2.fontWeight,
            color: DESIGN_TOKENS.color.textStrong,
          }}
        >
          {code}
        </h2>
        <StatusPill status={order.order.status} />
      </div>
      <p
        data-testid="ktv-detail-time"
        style={{
          margin: '0 0 14px',
          fontSize: DESIGN_TOKENS.typography.bodySm.fontSize,
          color: DESIGN_TOKENS.color.textMuted,
        }}
      >
        {isInstall
          ? timeHm(order.order.expectedTime)
          : order.order.deliveryDate}
      </p>

      {/* Khách hàng — CHỈ delivery có receiver trên contract (install proto
          không có field liên hệ → ẩn section, không render khung rỗng). */}
      {receiver ? (
        <SectionCard title={t('detail.customer')} testid="ktv-detail-customer">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: DESIGN_TOKENS.typography.h3.fontSize,
                fontWeight: DESIGN_TOKENS.typography.h3.fontWeight,
                color: DESIGN_TOKENS.color.textPrimary,
              }}
            >
              {receiver.name}
            </span>
            <PhoneLink phone={receiver.phone} />
          </div>
        </SectionCard>
      ) : null}

      {/* Địa chỉ + map (coords chỉ có ở delivery receiver.location). */}
      <AddressMapCard
        code={code}
        province={order.order.province}
        note={isInstall ? undefined : coordinationNote(order.order.coordination)}
        coords={receiver?.location ?? null}
      />

      {/* Timeline — chỉ install có timeline_json (delivery DTO không có). */}
      {timelineEntries ? (
        <SectionCard title={t('detail.timeline')} testid="ktv-detail-timeline">
          <Timeline entries={timelineEntries} />
        </SectionCard>
      ) : null}

      {/* T5/T6 action buttons — chỉ install (delivery không có mutate route);
          từng button tự gate theo flag BE-authoritative (flag false → null). */}
      {isInstall ? (
        <div data-testid="ktv-detail-actions" style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <AcceptButton
            order={order.order}
            technicianCode={props.session.sub}
            onUpdated={handleInstallUpdated}
          />
          <CompleteButton
            order={order.order}
            technicianCode={props.session.sub}
            onUpdated={handleInstallUpdated}
          />
          <RescheduleButton
            order={order.order}
            technicianCode={props.session.sub}
            onUpdated={handleInstallUpdated}
          />
        </div>
      ) : null}
    </div>
  );
}
