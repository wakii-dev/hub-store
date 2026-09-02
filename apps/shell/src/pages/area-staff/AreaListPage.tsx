/**
 * AreaListPage — "Khu vực hoạt động nhân viên" (/area-staff) — SHELL-LOCAL
 * page (SF-17 spec §8: không qua Module Federation). antd4 Table + FilterBar
 * (pattern D1Page); data qua areaStaffApi (axios singleton BFF).
 * List LUÔN gồm inactive — row dim + Tag "Ngừng hoạt động" (client-side).
 * Toggle Switch + nút tạo gate theo `areastaff.manage`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FilterBar, TextSearch, sharedCssVariables } from '@hub-store/shared';
import type { RegionDto } from '@hub-store/shared';
import { usePermissions } from '@hub-store/shared';
import {
  TITLE_CODES,
  areaStaffApi,
  resolveWardsByProvince,
  type ListFilters,
  type ServiceEmployeeDto,
} from '../../api/areaStaffApi';

export default function AreaListPage() {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManage = can('areastaff.manage');

  const [filters, setFilters] = useState<ListFilters>({});
  const [rows, setRows] = useState<ServiceEmployeeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [regions, setRegions] = useState<RegionDto[]>([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  const regionByCode = useMemo(() => new Map(regions.map((r) => [r.code, r])), [regions]);

  const load = useCallback(
    (f: ListFilters) => {
      setLoading(true);
      areaStaffApi
        .list(f)
        .then((resp) => {
          setRows(resp.items ?? []);
          setTotal(resp.total ?? 0);
        })
        .catch(() => message.error(t('area.error.load')))
        .finally(() => setLoading(false));
    },
    [t],
  );

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  useEffect(() => {
    areaStaffApi.regions().then(setRegions).catch(() => message.error(t('area.error.regions')));
  }, [t]);

  const provinceOptions = useMemo(
    () =>
      regions
        .filter((r) => r.type === 'province')
        .map((r) => ({ label: r.name, value: r.code })),
    [regions],
  );

  const titleOptions = TITLE_CODES.map((code) => ({ label: t(`area.title.${code}`), value: code }));

  const columns: ColumnsType<ServiceEmployeeDto> = [
    {
      title: t('area.col.index'),
      key: 'index',
      width: 56,
      render: (_v, _r, i) => i + 1,
    },
    {
      title: t('area.col.code'),
      dataIndex: 'employeeCode',
      key: 'employeeCode',
      width: 140,
    },
    { title: t('area.col.fullName'), dataIndex: 'fullName', key: 'fullName' },
    {
      title: t('area.col.title'),
      dataIndex: 'titleCode',
      key: 'titleCode',
      width: 150,
      render: (code: string) => t(`area.title.${code}`),
    },
    {
      title: t('area.col.paymentAccount'),
      dataIndex: 'paymentAccount',
      key: 'paymentAccount',
      width: 160,
    },
    {
      title: t('area.col.regions'),
      dataIndex: 'regionCodes',
      key: 'regionCodes',
      render: (codes: string[]) => {
        const names = codes
          .map((c) => regionByCode.get(c)?.name ?? c)
          .slice(0, 3)
          .join(', ');
        const more = codes.length > 3 ? ` +${codes.length - 3}` : '';
        return `${names}${more}`;
      },
    },
    {
      title: t('area.col.status'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 160,
      render: (active: boolean) =>
        active ? (
          <Tag color="processing">{t('area.status.active')}</Tag>
        ) : (
          <Tag color="default" data-testid="area-inactive-tag">
            {t('area.status.inactive')}
          </Tag>
        ),
    },
  ];

  return (
    <div style={sharedCssVariables as React.CSSProperties}>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('area.title')}
        </Typography.Title>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/area-staff/new')}
            data-testid="area-create-btn"
          >
            {t('area.create')}
          </Button>
        )}
      </Space>

      <FilterBar
        onSearch={() => load(filters)}
        onReset={() => setFilters({})}
        searchLabel={t('area.search')}
        resetLabel={t('area.filter.reset')}
      >
        <Select
          allowClear
          placeholder={t('area.filter.titleCode')}
          options={titleOptions}
          value={filters.titleCode || undefined}
          onChange={(v) => setFilters((f) => ({ ...f, titleCode: v }))}
          style={{ width: '100%' }}
          data-testid="area-filter-title"
        />
        <TextSearch
          value={filters.query ?? ''}
          onChange={(v) => setFilters((f) => ({ ...f, query: v }))}
          onSearch={() => load({ ...filters })}
          placeholder={t('area.filter.name')}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('area.filter.region')}
          options={provinceOptions}
          value={filters.regionCode || undefined}
          onChange={(v) => setFilters((f) => ({ ...f, regionCode: v }))}
          style={{ width: '100%' }}
          data-testid="area-filter-region"
        />
      </FilterBar>

      <div data-testid="area-list">
      <Table<ServiceEmployeeDto>
        style={{ marginTop: 12 }}
        rowKey="employeeCode"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ total, pageSize: 20, showTotal: (n) => `${n}` }}
        onRow={(record) => ({
          'data-testid': `area-row-${record.employeeCode}`,
          style: record.isActive ? undefined : { opacity: 0.45 },
        })}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
          expandedRowRender: (record) => {
            const groups = resolveWardsByProvince(record.regionCodes ?? [], regions);
            if (groups.length === 0) return null;
            return (
              <div data-testid={`area-wards-${record.employeeCode}`}>
                <Typography.Text strong>{t('area.expand.title')}</Typography.Text>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  {groups.map((g) => (
                    <li key={g.province?.code ?? g.wards.map((w) => w.code).join('-')}>
                      <Typography.Text strong>{g.province?.name ?? '?'}</Typography.Text>
                      {' — '}
                      {g.wards.map((w) => w.name).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            );
          },
          expandIcon: ({ expanded, record }) => (
            <Button
              type="text"
              size="small"
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                const code = record.employeeCode;
                setExpandedRowKeys((keys) =>
                  keys.includes(code) ? keys.filter((k) => k !== code) : [...keys, code],
                );
              }}
              data-testid={`area-expand-${record.employeeCode}`}
            />
          ),
        }}
        locale={{ emptyText: t('area.empty') }}
      />
      </div>
    </div>
  );
}
