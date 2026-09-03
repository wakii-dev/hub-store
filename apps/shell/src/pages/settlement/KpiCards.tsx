/**
 * KpiCards — SF-14 direction B: 4 KPI cards hàng ngang (layout contract §2):
 * Đơn hoàn tất · COD kỳ vọng · Đã thu (progress thu/kỳ vọng) · Chênh lệch
 * (âm = đỏ). Tokens từ DESIGN_TOKENS — không chart lib (CSS thuần).
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleOutlined,
  PayCircleOutlined,
  ShoppingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { DESIGN_TOKENS } from '@hub-store/shared';
import { formatVnd } from '@hub-store/shared';

const T = DESIGN_TOKENS;

function Meter({ percent, danger }: { percent: number; danger?: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: T.color.dividerSoft,
        overflow: 'hidden',
        flex: 1,
      }}
      data-testid="kpi-collect-meter"
    >
      <div
        style={{
          height: '100%',
          borderRadius: 3,
          width: `${clamped}%`,
          background: danger ? T.color.status.error : T.color.primaryGradient,
        }}
      />
    </div>
  );
}

function Card(props: { label: string; value: ReactNode; icon: ReactNode; iconStyle: React.CSSProperties; foot: ReactNode }) {
  return (
    <div
      style={{
        background: T.color.bgWhite,
        border: `1px solid ${T.color.divider}`,
        borderRadius: T.radius.card,
        boxShadow: T.shadow.xs,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontSize: T.typography.overline.fontSize,
              fontWeight: T.typography.overline.fontWeight,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: T.color.textMuted,
            }}
          >
            {props.label}
          </div>
          <div
            style={{
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: T.color.textStrong,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {props.value}
          </div>
        </div>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...props.iconStyle,
          }}
        >
          {props.icon}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        {props.foot}
      </div>
    </div>
  );
}

const noteStyle: React.CSSProperties = { fontSize: 12, color: T.color.textFaint, lineHeight: 1.35 };

/** Skeleton KPI — 4 khối shimmer (SF-6 pattern, không spinner). */
export function KpiCardsSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 110,
            background: T.color.bgWhite,
            border: `1px solid ${T.color.divider}`,
            borderRadius: T.radius.card,
            boxShadow: T.shadow.xs,
            padding: '18px 20px',
          }}
        >
          <div className="sf6-shimmer" style={{ width: '45%', height: 11, borderRadius: 6, marginBottom: 12 }} />
          <div className="sf6-shimmer" style={{ width: '60%', height: 18, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export interface KpiTotals {
  totalOrders: number;
  totalExpected: number;
  totalCollected: number;
  diffAmount: number;
  pendingOrders: number;
  mismatchOrders: number;
  shopsNeedingAction: number;
  shopCount: number;
}

export function KpiCards(props: { totals: KpiTotals }) {
  const { t } = useTranslation('shell');
  const { totals } = props;
  const percent = totals.totalExpected > 0 ? (totals.totalCollected / totals.totalExpected) * 100 : 0;
  const percentText = percent.toFixed(1);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
      <Card
        label={t('settlement.kpi.orders')}
        value={totals.totalOrders.toLocaleString('vi-VN')}
        icon={<ShoppingOutlined />}
        iconStyle={{ background: T.color.status.infoBg, color: T.color.status.info }}
        foot={<div style={noteStyle}>{`${totals.shopCount} ${t('settlement.col.shop')}`}</div>}
      />
      <Card
        label={t('settlement.kpi.expected')}
        value={formatVnd(totals.totalExpected)}
        icon={<PayCircleOutlined />}
        iconStyle={{ background: T.color.primaryBg, color: T.color.primary }}
        foot={<div style={noteStyle}>{t('settlement.kpi.ofExpected', { percent: '100' })}</div>}
      />
      <Card
        label={t('settlement.kpi.collected')}
        value={formatVnd(totals.totalCollected)}
        icon={<CheckCircleOutlined />}
        iconStyle={{ background: T.color.status.successBg, color: T.color.status.success }}
        foot={
          <>
            <Meter percent={percent} />
            <div style={{ ...noteStyle, whiteSpace: 'nowrap' }}>
              <b>{percentText}%</b>
            </div>
          </>
        }
      />
      <Card
        label={t('settlement.kpi.diff')}
        value={
          <span style={{ color: totals.diffAmount < 0 ? T.color.status.error : undefined }}>
            {formatVnd(totals.diffAmount)}
          </span>
        }
        icon={<WarningOutlined />}
        iconStyle={{
          background: totals.diffAmount < 0 ? T.color.status.errorBg : T.color.status.neutralBg,
          color: totals.diffAmount < 0 ? T.color.status.error : T.color.status.neutral,
        }}
        foot={
          <div style={noteStyle}>
            {t('settlement.kpi.needsAction', {
              shops: totals.shopsNeedingAction,
              pending: totals.pendingOrders,
              mismatch: totals.mismatchOrders,
            })}
          </div>
        }
      />
    </div>
  );
}
