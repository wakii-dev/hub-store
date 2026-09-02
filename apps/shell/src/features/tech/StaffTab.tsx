/**
 * StaffTab — bảng "KTV-CTV theo ngày" (SF-20): số đơn giao/lắp, vùng.
 * BE không có aggregate endpoint → derive FE-side: registry từ suggest
 * (union theo region codes của đơn lắp) + group đơn lắp theo staff × ngày
 * (buildStaffRows). Click row → StaffDetailModal nhóm theo ngày.
 */
import { useMemo, useState } from 'react';
import { Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, EmptyState } from '@hub-store/shared';
import { useTechFetch } from './useTechFetch';
import { dedupeRegions } from './techHelpers';
import { buildRegistry, buildStaffRows, type StaffRow } from './staffModel';
import {
  filterInstallationOrders,
  suggestTechnicians,
  type InstallationFilter,
} from './techApi';
import { StaffDetailModal } from './StaffDetailModal';

export function StaffTab(props: {
  filter: InstallationFilter;
  onTotal?: (total: number) => void;
}) {
  const { t } = useTranslation('tech');
  const [detail, setDetail] = useState<StaffRow | null>(null);

  // 1 fetch duy nhất: đơn lắp (không paginate — hợp lý cho 1 ngày) rồi
  // derive registry + rows. suggest chạy song song theo regions quan sát được.
  const { data, isLoading, isFetching, error, refetch } = useTechFetch(async () => {
    const envelope = await filterInstallationOrders({ ...props.filter, pageSize: 200 });
    const regions = dedupeRegions(envelope.items.map((o) => o.regionCode ?? ''));
    const registry = await buildRegistry(regions, suggestTechnicians);
    return { envelope, registry };
  }, [JSON.stringify(props.filter)]);

  const rows = useMemo(
    () => buildStaffRows(data?.envelope.items ?? [], data?.registry ?? []),
    [data],
  );

  if (error) {
    return <EmptyState title={t('error.load')} sub={error} actionLabel={t('filter.reset')} onAction={refetch} />;
  }

  const columns: ColumnsType<StaffRow> = [
    {
      title: t('staff.table.staff'),
      dataIndex: 'name',
      key: 'name',
      render: (_, row) => (
        <span>
          <span style={{ fontWeight: 600, color: DESIGN_TOKENS.color.textStrong }}>{row.name}</span>{' '}
          <span style={{ color: DESIGN_TOKENS.color.textMuted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            ({row.code})
          </span>
        </span>
      ),
    },
    {
      title: t('staff.table.type'),
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (type: string) => (
        <span
          style={{
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            background: DESIGN_TOKENS.color.primaryBg,
            border: `1px solid ${DESIGN_TOKENS.color.primaryBorder}`,
            color: DESIGN_TOKENS.color.statAccent,
          }}
        >
          {t(`staff.type.${type === 'CTV' ? 'CTV' : 'KTV'}`)}
        </span>
      ),
    },
    { title: t('staff.table.day'), dataIndex: 'days', key: 'days', render: (_, row) => row.days.map((d) => d.day).join(', ') || '—' },
    {
      title: t('staff.table.deliveryCount'),
      dataIndex: 'totalDelivery',
      key: 'totalDelivery',
      width: 130,
      render: (value: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>,
    },
    {
      title: t('staff.table.installCount'),
      dataIndex: 'totalInstall',
      key: 'totalInstall',
      width: 130,
      render: (value: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>,
    },
    { title: t('staff.table.region'), dataIndex: 'regions', key: 'regions', render: (regions: string[]) => regions.join(', ') || '—' },
  ];

  return (
    <div style={{ opacity: isFetching && !isLoading ? 0.6 : 1, transition: 'opacity .15s ease' }} data-testid="tech-staff-table">
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('empty.title')} sub={t('empty.sub')} />
      ) : (
        <div
          style={{
            background: DESIGN_TOKENS.color.bgWhite,
            border: `1px solid ${DESIGN_TOKENS.color.divider}`,
            borderRadius: DESIGN_TOKENS.radius.card,
            boxShadow: DESIGN_TOKENS.shadow.sm,
            overflow: 'hidden',
          }}
        >
          <Table<StaffRow>
            rowKey="code"
            columns={columns}
            dataSource={rows}
            pagination={false}
            onRow={(record) => ({
              onClick: () => setDetail(record),
              style: { cursor: 'pointer' },
              'data-testid': `tech-staff-row-${record.code}`,
            })}
          />
        </div>
      )}
      <StaffDetailModal row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
