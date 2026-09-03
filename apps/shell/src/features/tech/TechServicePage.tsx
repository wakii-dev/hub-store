/**
 * TechServicePage — "Đơn dịch vụ kỹ thuật" (/hub-store-order/tech, SF-20).
 * 3 tab Giao hàng / Lắp đặt / KTV-CTV (context pack item 1); filter lưu URL +
 * sessionStorage (item 2); tab là URL param. Shell-owned (không qua MF remote)
 * → import trực tiếp, không lazy-federation.
 */
import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Tabs } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, DateRange, MultiSelect } from '@hub-store/shared';
import { statusOptions } from './techHelpers';
import { parseTab, TECH_FILTER_URL_DEFAULTS, useTechFilters, type TechFilterState, type TechTab } from './useTechFilters';
import { DeliveryTab } from './DeliveryTab';
import { InstallationTab } from './InstallationTab';
import { StaffTab } from './StaffTab';
import { MapTab } from './MapTab';
import { registerTechResources } from './tech.i18n';

// LƯU Ý: KHÔNG đăng ký ở module-eval — App.tsx được import tĩnh trong
// main.tsx TRƯỚC initI18n() → getI18n() null → đăng ký bị skip lặng lẽ
// (browser render raw key, unit test không bắt vì tự init i18n riêng).
// Đăng ký idempotent ngay trong component.

const FILTER_FIELD_TESTIDS: Record<string, string> = {
  dStatus: 'tech-filter-d-status',
  dDriver: 'tech-filter-d-driver',
  dRegion: 'tech-filter-d-region',
  dProvince: 'tech-filter-d-province',
  dDate: 'tech-filter-d-date',
  iStatus: 'tech-filter-i-status',
  iTech: 'tech-filter-i-tech',
  iRegion: 'tech-filter-i-region',
  iProvince: 'tech-filter-i-province',
  iDate: 'tech-filter-i-date',
  sDate: 'tech-filter-s-date',
};

export default function TechServicePage() {
  registerTechResources();
  const { t, i18n } = useTranslation('tech');
  const [filters, setFilters, resetFilters] = useTechFilters();
  const tab = parseTab(filters.tab);
  const [total, setTotal] = useState(0);

  const setTab = (next: TechTab) => setFilters({ tab: next });
  const setPage = (key: 'dPage' | 'iPage') => (page: number) => setFilters({ [key]: String(page) });

  const locale = (i18n.language ?? 'vi').startsWith('vi') ? 'vi' : 'en';
  const statusOpts = useMemo(() => statusOptions(locale), [locale]);

  const deliveryFilter = useMemo(
    () => ({
      statuses: filters.dStatus,
      driverName: filters.dDriver,
      regionCode: filters.dRegion,
      province: filters.dProvince,
      dateFrom: filters.dFrom,
      dateTo: filters.dTo,
    }),
    [filters.dStatus, filters.dDriver, filters.dRegion, filters.dProvince, filters.dFrom, filters.dTo],
  );
  const installationFilter = useMemo(
    () => ({
      statuses: filters.iStatus,
      technicianCode: filters.iTech,
      regionCode: filters.iRegion,
      province: filters.iProvince,
      dateFrom: filters.iFrom,
      dateTo: filters.iTo,
    }),
    [filters.iStatus, filters.iTech, filters.iRegion, filters.iProvince, filters.iFrom, filters.iTo],
  );
  // Staff tab: mặc định KHÔNG lọc ngày (bảng group theo ngày — hiện tất cả);
  // "filter mặc định hôm nay" của spec áp cho delivery. Lọc theo sDate chỉ
  // khi user chọn — default today làm bảng rỗng khi đơn lắp ở ngày khác.
  const staffFilter = useMemo(
    () => (filters.sDate ? { dateFrom: filters.sDate, dateTo: filters.sDate } : {}),
    [filters.sDate],
  );

  return (
    <div>
      {/* Page-head theo SF-6 §2.2: h1 21/700 + sub 13 textMuted; phải: ghost "Làm mới" */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h1 style={{ ...DESIGN_TOKENS.typography.h1, margin: 0, color: DESIGN_TOKENS.color.textStrong }} data-testid="tech-page-title">
            {t('page.title')}
          </h1>
          <div style={{ fontSize: 13, color: DESIGN_TOKENS.color.textMuted, marginTop: 4 }} data-testid="tech-page-subtitle">
            {t('page.subtitle', { total, time: new Date().toLocaleTimeString() })}
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={resetFilters} data-testid="tech-reset">
          {t('filter.reset')}
        </Button>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(parseTab(key))}
        items={[
          { key: 'delivery', label: t('tab.delivery'), children: null },
          { key: 'installation', label: t('tab.installation'), children: null },
          { key: 'staff', label: t('tab.staff'), children: null },
          { key: 'map', label: <span data-testid="tech-tab-map">{t('tab.map')}</span>, children: null },
        ]}
        data-testid="tech-tabs"
      />

      {tab === 'delivery' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div data-testid={FILTER_FIELD_TESTIDS.dStatus} style={{ minWidth: 200 }}>
              <MultiSelect
                value={filters.dStatus}
                onChange={(values) => setFilters({ dStatus: values, dPage: '1' })}
                options={statusOpts}
                placeholder={t('filter.status')}
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.dDriver} style={{ minWidth: 180 }}>
              <Input
                value={filters.dDriver}
                onChange={(e) => setFilters({ dDriver: e.target.value, dPage: '1' })}
                placeholder={t('filter.driver')}
                allowClear
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.dRegion} style={{ minWidth: 130 }}>
              <Input
                value={filters.dRegion}
                onChange={(e) => setFilters({ dRegion: e.target.value, dPage: '1' })}
                placeholder={t('filter.region')}
                allowClear
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.dProvince} style={{ minWidth: 150 }}>
              <Input
                value={filters.dProvince}
                onChange={(e) => setFilters({ dProvince: e.target.value, dPage: '1' })}
                placeholder={t('filter.province')}
                allowClear
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.dDate} style={{ minWidth: 240 }}>
              <DateRange
                value={filters.dFrom || filters.dTo ? { from: filters.dFrom, to: filters.dTo } : null}
                onChange={(value) =>
                  setFilters({ dFrom: value?.from ?? '', dTo: value?.to ?? '', dPage: '1' })
                }
              />
            </div>
          </div>
          <DeliveryTab
            filter={deliveryFilter}
            page={Number(filters.dPage) || 1}
            onPageChange={setPage('dPage')}
            onTotal={setTotal}
          />
        </>
      )}

      {tab === 'installation' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div data-testid={FILTER_FIELD_TESTIDS.iStatus} style={{ minWidth: 200 }}>
              <MultiSelect
                value={filters.iStatus}
                onChange={(values) => setFilters({ iStatus: values, iPage: '1' })}
                options={statusOpts}
                placeholder={t('filter.status')}
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.iTech} style={{ minWidth: 160 }}>
              <Input
                value={filters.iTech}
                onChange={(e) => setFilters({ iTech: e.target.value, iPage: '1' })}
                placeholder={t('filter.technician')}
                allowClear
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.iRegion} style={{ minWidth: 130 }}>
              <Input
                value={filters.iRegion}
                onChange={(e) => setFilters({ iRegion: e.target.value, iPage: '1' })}
                placeholder={t('filter.region')}
                allowClear
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.iProvince} style={{ minWidth: 150 }}>
              <Input
                value={filters.iProvince}
                onChange={(e) => setFilters({ iProvince: e.target.value, iPage: '1' })}
                placeholder={t('filter.province')}
                allowClear
              />
            </div>
            <div data-testid={FILTER_FIELD_TESTIDS.iDate} style={{ minWidth: 240 }}>
              <DateRange
                value={filters.iFrom || filters.iTo ? { from: filters.iFrom, to: filters.iTo } : null}
                onChange={(value) =>
                  setFilters({ iFrom: value?.from ?? '', iTo: value?.to ?? '', iPage: '1' })
                }
              />
            </div>
          </div>
          <InstallationTab
            filter={installationFilter}
            page={Number(filters.iPage) || 1}
            onPageChange={setPage('iPage')}
            onTotal={setTotal}
          />
        </>
      )}

      {tab === 'staff' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <div data-testid={FILTER_FIELD_TESTIDS.sDate} style={{ minWidth: 200 }}>
              <DatePicker
                style={{ width: '100%' }}
                value={filters.sDate ? moment(filters.sDate, 'YYYY-MM-DD') : null}
                format="YYYY-MM-DD"
                onChange={(value) => setFilters({ sDate: value ? value.format('YYYY-MM-DD') : '' })}
                placeholder={t('filter.date')}
              />
            </div>
          </div>
          <StaffTab filter={staffFilter} onTotal={setTotal} />
        </>
      )}

      {tab === 'map' && <MapTab />}
    </div>
  );
}

/** Export cho test — defaults URL keys. */
export { TECH_FILTER_URL_DEFAULTS, type TechFilterState };
