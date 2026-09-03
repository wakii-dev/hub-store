/**
 * SettlementPage — SF-14 (FI-259) màn đối soát COD, direction B
 * "Summary-cards first" (design hand-off docs/superpowers/designs/sf-14-direction.md).
 * Layout contract: FilterBar (RangePicker kỳ + Export CSV) → 4 KPI cards →
 * segmented filter (Tất cả/Đủ/Thiếu thu/Lệch tiền) → bảng per shop expandable.
 * Shell-local page — axios wrapper (settlementApi), KHÔNG RTKQ ở shell.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, type SettlementShopRow } from '@hub-store/shared';
import { settlementApi } from '../../api/settlementApi';
import { KpiCards, KpiCardsSkeleton, type KpiTotals } from './KpiCards';
import { ShopTable, shopHealth, type ShopHealth } from './ShopTable';

const T = DESIGN_TOKENS;
const DATE_FORMAT = 'YYYY-MM-DD';

type SegmentFilter = 'all' | ShopHealth;

const SEGMENTS: Array<{ key: SegmentFilter; health?: ShopHealth; labelKey: string }> = [
  { key: 'all', labelKey: 'settlement.filter.all' },
  { key: 'short', health: 'short', labelKey: 'settlement.filter.short' },
  { key: 'mismatch', health: 'mismatch', labelKey: 'settlement.filter.mismatch' },
  { key: 'ok', health: 'ok', labelKey: 'settlement.filter.ok' },
];

/** Kỳ mặc định: đầu tháng hiện tại → hôm nay (date-only YYYY-MM-DD). */
function defaultPeriod(): [moment.Moment, moment.Moment] {
  return [moment().startOf('month'), moment()];
}

export default function SettlementPage() {
  const { t } = useTranslation('shell');
  const [period, setPeriod] = useState<[moment.Moment, moment.Moment]>(defaultPeriod);
  const [rows, setRows] = useState<SettlementShopRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [exporting, setExporting] = useState(false);

  const from = period[0].format(DATE_FORMAT);
  const to = period[1].format(DATE_FORMAT);

  const load = (f: string, tt: string) => {
    setLoading(true);
    settlementApi
      .list({ from: f, to: tt })
      .then((r) => setRows(r.items))
      .catch(() => {
        setRows([]);
        message.error(t('settlement.error.load'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals: KpiTotals = useMemo(() => {
    const list = rows ?? [];
    const sums = list.reduce(
      (acc, r) => ({
        totalOrders: acc.totalOrders + r.totalOrders,
        totalExpected: acc.totalExpected + r.totalExpected,
        totalCollected: acc.totalCollected + r.totalCollected,
        diffAmount: acc.diffAmount + r.diffAmount,
        pendingOrders: acc.pendingOrders + r.pendingCount,
        mismatchOrders: acc.mismatchOrders + r.mismatchCount,
        shopsNeedingAction: acc.shopsNeedingAction + (r.pendingCount > 0 || r.mismatchCount > 0 ? 1 : 0),
      }),
      {
        totalOrders: 0,
        totalExpected: 0,
        totalCollected: 0,
        diffAmount: 0,
        pendingOrders: 0,
        mismatchOrders: 0,
        shopsNeedingAction: 0,
      },
    );
    return { ...sums, shopCount: list.length };
  }, [rows]);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      all: list.length,
      short: list.filter((r) => shopHealth(r) === 'short').length,
      mismatch: list.filter((r) => shopHealth(r) === 'mismatch').length,
      ok: list.filter((r) => shopHealth(r) === 'ok').length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (segment === 'all') return list;
    return list.filter((r) => shopHealth(r) === segment);
  }, [rows, segment]);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Axios singleton mang Authorization Bearer (window.open trần sẽ 403) →
      // blob → object URL → anchor click download (pattern D2CPage export).
      const blob = await settlementApi.exportCsv(from, to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settlement_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      message.error(t('settlement.error.export'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ paddingBottom: 40 }} data-testid="settlement-page">
      {/* Page head + FilterBar (kỳ + Export) — layout contract §1 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: T.typography.h1.fontSize,
              fontWeight: T.typography.h1.fontWeight,
              letterSpacing: T.typography.h1.letterSpacing,
              color: T.color.textStrong,
              margin: 0,
            }}
          >
            {t('settlement.title')}
          </h1>
          <div style={{ fontSize: 13, color: T.color.textMuted, marginTop: 3 }}>
            {t('settlement.subtitle')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <DatePicker.RangePicker
            value={[period[0], period[1]]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) setPeriod([dates[0], dates[1]]);
            }}
            allowClear={false}
            data-testid="settlement-range"
          />
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            data-testid="settlement-export"
            onClick={handleExport}
          >
            {t('settlement.export')}
          </Button>
        </div>
      </div>

      {/* 4 KPI cards — skeleton khi lần đầu tải (SF-6) */}
      {rows === null && loading ? (
        <KpiCardsSkeleton />
      ) : (
        <KpiCards totals={totals} />
      )}

      {/* Segmented filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div
          style={{
            display: 'inline-flex',
            background: T.color.dividerSoft,
            borderRadius: T.radius.control,
            padding: 3,
            gap: 2,
          }}
          data-testid="settlement-segments"
        >
          {SEGMENTS.map((s) => {
            const on = segment === s.key;
            const cnt = counts[s.key as keyof typeof counts];
            return (
              <button
                key={s.key}
                type="button"
                data-testid={`settlement-segment-${s.key}`}
                onClick={() => setSegment(s.key)}
                style={{
                  border: 'none',
                  background: on ? T.color.bgWhite : 'transparent',
                  color: on ? T.color.textStrong : T.color.textMuted,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '5px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: on ? T.shadow.sm : 'none',
                }}
              >
                {t(s.labelKey)}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: on ? T.color.primary : T.color.textFaint,
                    marginLeft: 5,
                  }}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bảng per shop + drill-down */}
      <ShopTable rows={filtered} loading={loading && rows === null} from={from} to={to} onChanged={() => load(from, to)} />
    </div>
  );
}
