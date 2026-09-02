/**
 * InstallationTab — "Lắp đặt" card list (SF-20): KTV phụ trách, timeline,
 * đơn giao liên quan, phí dịch vụ. KHÔNG today default (BE-side).
 * Buttons BE-authoritative: allowAssign → "Gán KTV", allowReassign →
 * "Gán lại KTV" (cùng AssignTechnicianModal).
 */
import { useEffect, useState } from 'react';
import { Button, Pagination, Skeleton } from 'antd';
import { UserAddOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, EmptyState, formatVnd } from '@hub-store/shared';
import { TechStatusTag } from './TechStatusTag';
import { useTechFetch } from './useTechFetch';
import { parseTimeline } from './techHelpers';
import { filterInstallationOrders, type InstallationFilter, type InstallationOrderDto } from './techApi';
import { AssignTechnicianModal } from './AssignTechnicianModal';

const PAGE_SIZE = 10;

export function InstallationTab(props: {
  filter: InstallationFilter;
  page: number;
  onPageChange: (page: number) => void;
  onTotal?: (total: number) => void;
}) {
  const { t, i18n } = useTranslation('tech');
  const locale = (i18n.language ?? 'vi').startsWith('vi') ? 'vi' : 'en';
  const page = props.page;
  const [assignOrder, setAssignOrder] = useState<InstallationOrderDto | null>(null);
  const [revision, setRevision] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useTechFetch(
    () => filterInstallationOrders({ ...props.filter, page, pageSize: PAGE_SIZE }),
    [JSON.stringify(props.filter), page, revision],
  );
  if (error) {
    return <EmptyState title={t('error.load')} sub={error} actionLabel={t('filter.reset')} onAction={refetch} />;
  }
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  useEffect(() => {
    props.onTotal?.(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  return (
    <div style={{ opacity: isFetching && !isLoading ? 0.6 : 1, transition: 'opacity .15s ease' }} data-testid="tech-installation-list">
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('empty.title')} sub={t('empty.sub')} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {rows.map((order) => (
              <InstallationCard
                key={order.serviceOrderCode}
                order={order}
                locale={locale}
                onAssign={() => setAssignOrder(order)}
              />
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
              data-testid="tech-installation-pagination"
            />
          </div>
        </>
      )}
      <AssignTechnicianModal
        open={assignOrder !== null}
        order={assignOrder}
        onClose={() => setAssignOrder(null)}
        onAssigned={() => {
          // Assign thành công → card phải hiện KTV mới (acceptance) — refetch list.
          setRevision((r) => r + 1);
        }}
      />
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
          minWidth: 110,
          paddingTop: 2,
        }}
      >
        {props.label}
      </span>
      <span style={{ color: DESIGN_TOKENS.color.textSecondary }}>{props.children}</span>
    </div>
  );
}

export function InstallationCard(props: {
  order: InstallationOrderDto;
  locale: 'vi' | 'en';
  onAssign: () => void;
}) {
  const { t } = useTranslation('tech');
  const { order } = props;
  const timeline = parseTimeline(order.timeline);
  const showAssign = order.buttons.allowAssign;
  const showReassign = order.buttons.allowReassign;

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
      data-testid={`tech-installation-card-${order.serviceOrderCode}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: DESIGN_TOKENS.color.textStrong, fontVariantNumeric: 'tabular-nums' }}>
          {order.serviceOrderCode}
        </span>
        <TechStatusTag status={order.status} locale={props.locale} />
      </div>
      <InfoRow label={t('installation.technician')}>
        {order.technicianCode ? (
          <span style={{ fontWeight: 600 }}>{order.technicianCode}</span>
        ) : (
          <span style={{ color: DESIGN_TOKENS.color.textFaint }}>{t('installation.unassigned')}</span>
        )}
      </InfoRow>
      {order.expectedTime ? (
        <InfoRow label={t('installation.expectedTime')}>{order.expectedTime.replace('T', ' ').slice(0, 16)}</InfoRow>
      ) : null}
      <InfoRow label={t('installation.relatedDelivery')}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {order.deliveryOrderCode || '—'}
        </span>
      </InfoRow>
      <InfoRow label={t('delivery.items')}>
        {order.items.map((item) => `${item.name} ×${item.quantity}`).join(', ') || '—'}
      </InfoRow>
      {timeline.length > 0 ? (
        <InfoRow label={t('installation.timeline')}>
          <span>
            {timeline.map((entry, index) => (
              <span key={index} style={{ display: 'block', fontSize: 12.5 }}>
                <span style={{ color: DESIGN_TOKENS.color.textFaint }}>
                  {entry.at ? entry.at.replace('T', ' ').slice(5, 16) : ''}
                </span>{' '}
                {entry.status ? <TechStatusTag status={entry.status} locale={props.locale} /> : null}{' '}
                {entry.note}
              </span>
            ))}
          </span>
        </InfoRow>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${DESIGN_TOKENS.color.dividerSoft}`, paddingTop: 8 }}>
        <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
          {t('installation.serviceFee')}: {formatVnd(order.serviceFee)}
          {order.feeAdjust !== 0 ? ` · ${t('installation.feeAdjust')}: ${formatVnd(order.feeAdjust)}` : ''}
        </span>
        {/* Buttons BE-authoritative — không flag không nút. Chỉ render action
            FE desktop thực sự có endpoint: assign/reassign (SF-25 mobile
            sở hữu accept/reschedule/cancel). */}
        {(showAssign || showReassign) && (
          <Button
            size="small"
            type={showAssign ? 'primary' : 'default'}
            icon={showAssign ? <UserAddOutlined /> : <UserSwitchOutlined />}
            onClick={props.onAssign}
            data-testid={`tech-assign-${order.serviceOrderCode}`}
          >
            {showAssign ? t('installation.assign') : t('installation.reassign')}
          </Button>
        )}
      </div>
    </div>
  );
}
