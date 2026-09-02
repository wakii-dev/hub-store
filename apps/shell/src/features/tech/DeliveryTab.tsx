/**
 * DeliveryTab — "Giao hàng" card list (SF-20): trạng thái, tài xế,
 * người gửi/nhận, phí, SP. Filter mặc định hôm nay áp BE-side (cả
 * from+to absent). Pagination client hiển thị từ envelope BFF.
 */
import { useEffect } from 'react';
import { Pagination, Skeleton } from 'antd';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, EmptyState, formatVnd } from '@hub-store/shared';
import { PhoneLink } from './PhoneLink';
import { TechStatusTag } from './TechStatusTag';
import { useTechFetch } from './useTechFetch';
import { filterDeliveryOrders, type DeliveryFilter, type DeliveryOrderDto } from './techApi';

const PAGE_SIZE = 10;

export function DeliveryTab(props: {
  filter: DeliveryFilter;
  page: number;
  onPageChange: (page: number) => void;
  onTotal?: (total: number) => void;
}) {
  const { t, i18n } = useTranslation('tech');
  const locale = (i18n.language ?? 'vi').startsWith('vi') ? 'vi' : 'en';
  const page = props.page;

  const { data, isLoading, isFetching, error, refetch } = useTechFetch(
    () => filterDeliveryOrders({ ...props.filter, page, pageSize: PAGE_SIZE }),
    [JSON.stringify(props.filter), page],
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  // useEffect PHẢI trước mọi early return (Rules of Hooks — reviewer P0).
  useEffect(() => {
    props.onTotal?.(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  if (error) {
    return <EmptyState title={t('error.load')} sub={error} actionLabel={t('common.refetch')} onAction={refetch} />;
  }

  return (
    <div style={{ opacity: isFetching && !isLoading ? 0.6 : 1, transition: 'opacity .15s ease' }} data-testid="tech-delivery-list">
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('empty.title')} sub={t('empty.sub')} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {rows.map((order) => (
              <DeliveryCard key={order.code} order={order} locale={locale} />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: DESIGN_TOKENS.color.bgSoftWhite,
              border: `1px solid ${DESIGN_TOKENS.color.divider}`,
              borderRadius: DESIGN_TOKENS.radius.card,
              padding: '14px 18px',
              marginTop: 14,
            }}
          >
            <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
              {t('pagination.total', { total })}
            </span>
            <Pagination
              size="small"
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={props.onPageChange}
              data-testid="tech-delivery-pagination"
            />
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span
        style={{
          color: DESIGN_TOKENS.color.textFaint,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          minWidth: 88,
          paddingTop: 2,
        }}
      >
        {props.label}
      </span>
      <span style={{ color: DESIGN_TOKENS.color.textSecondary }}>{props.children}</span>
    </div>
  );
}

export function DeliveryCard(props: { order: DeliveryOrderDto; locale: 'vi' | 'en' }) {
  const { t } = useTranslation('tech');
  const { order } = props;
  return (
    <div
      style={{
        background: DESIGN_TOKENS.color.bgWhite,
        border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        borderRadius: DESIGN_TOKENS.radius.card,
        boxShadow: DESIGN_TOKENS.shadow.sm,
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      data-testid={`tech-delivery-card-${order.code}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: DESIGN_TOKENS.color.textStrong, fontVariantNumeric: 'tabular-nums' }}>
          {order.code}
        </span>
        <TechStatusTag status={order.status} locale={props.locale} />
      </div>
      <InfoRow label={t('delivery.driver')}>
        <PhoneLink phone={order.driverPhone} name={order.driverName} />
      </InfoRow>
      <InfoRow label={t('delivery.receiver')}>
        <PhoneLink phone={order.receiver.phone} name={order.receiver.name} />
      </InfoRow>
      <InfoRow label={t('delivery.sender')}>
        <PhoneLink phone={order.sender.phone} name={order.sender.name} />
      </InfoRow>
      <InfoRow label={t('delivery.items')}>
        {order.items.map((item) => `${item.name} ×${item.quantity}`).join(', ') || '—'}
      </InfoRow>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${DESIGN_TOKENS.color.dividerSoft}`, paddingTop: 8 }}>
        <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
          {t('delivery.date')}: {order.deliveryDate} · {order.province}
          {order.regionCode ? ` (${order.regionCode})` : ''}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: DESIGN_TOKENS.color.textStrong, fontVariantNumeric: 'tabular-nums' }}>
          {t('delivery.fee')}: {formatVnd(order.fee)}
          {order.tip > 0 ? ` · ${t('delivery.tip')}: ${formatVnd(order.tip)}` : ''}
        </span>
      </div>
    </div>
  );
}
