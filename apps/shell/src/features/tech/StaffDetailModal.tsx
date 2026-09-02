/**
 * StaffDetailModal — KTV-CTV detail (SF-20 acceptance: per staff nhóm
 * theo ngày — đơn giao + đơn lắp đặt). Data từ buildStaffRows (đã group).
 */
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';
import { TechStatusTag } from './TechStatusTag';
import type { StaffRow } from './staffModel';

export function StaffDetailModal(props: {
  row: StaffRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('tech');
  const row = props.row;
  return (
    <Modal
      open={row !== null}
      title={t('staff.detail.title', { name: row?.name ?? '' })}
      onCancel={props.onClose}
      footer={null}
      width={640}
      data-testid="tech-staff-detail-modal"
    >
      {row && row.days.length === 0 ? <span>{t('staff.detail.empty')}</span> : null}
      {row?.days.map((day) => {
        const dayOrders = row.installations.filter(
          (o) => (o.expectedTime || o.createdAt).slice(0, 10) === day.day,
        );
        return (
          <div key={day.day} style={{ marginBottom: 16 }} data-testid={`tech-staff-day-${day.day}`}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: DESIGN_TOKENS.color.bgHeaderSticky,
                border: `1px solid ${DESIGN_TOKENS.color.divider}`,
                borderRadius: DESIGN_TOKENS.radius.control,
                padding: '8px 14px',
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13.5, color: DESIGN_TOKENS.color.textStrong, fontVariantNumeric: 'tabular-nums' }}>
                {day.day}
              </span>
              <span style={{ fontSize: 12.5, color: DESIGN_TOKENS.color.textMuted }}>
                {t('staff.table.installCount')}: {day.installCount} · {t('staff.table.deliveryCount')}:{' '}
                {day.deliveryCount}
              </span>
            </div>
            {dayOrders.map((order) => (
              <div
                key={order.serviceOrderCode}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 14px',
                  borderBottom: `1px solid ${DESIGN_TOKENS.color.dividerSoft}`,
                  fontSize: 13,
                }}
              >
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: DESIGN_TOKENS.color.textStrong }}>
                    {order.serviceOrderCode}
                  </span>
                  <TechStatusTag status={order.status} />
                </span>
                <span style={{ color: DESIGN_TOKENS.color.textMuted, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                  {t('installation.relatedDelivery')}: {order.deliveryOrderCode || '—'}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </Modal>
  );
}
