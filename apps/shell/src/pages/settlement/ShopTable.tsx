/**
 * ShopTable — SF-14 direction B: bảng đối soát per shop (layout contract §4).
 * Row: shop (pill tag + dot) · progress thu% · tổng đơn · kỳ vọng · đã thu ·
 * chênh lệch. Expandable → drill-down order cards (PENDING / LỆCH / ĐÃ THU),
 * per-order PENDING/LỆCH có nút Xác nhận thu → ConfirmCollectModal.
 */
import { useEffect, useState } from 'react';
import { Button, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import {
  DESIGN_TOKENS,
  EmptyState,
  formatVnd,
  type SettlementDetailItem,
  type SettlementShopRow,
} from '@hub-store/shared';
import { settlementApi } from '../../api/settlementApi';
import { ConfirmCollectModal, itemState, type ConfirmCollectTarget } from './ConfirmCollectModal';

const T = DESIGN_TOKENS;

export type ShopHealth = 'ok' | 'short' | 'mismatch';

/** Trạng thái sức khỏe shop: pending>0 → Thiếu thu; lệch → Lệch tiền; còn lại Đủ. */
export function shopHealth(row: SettlementShopRow): ShopHealth {
  if (row.pendingCount > 0) return 'short';
  if (row.mismatchCount > 0) return 'mismatch';
  return 'ok';
}

const HEALTH_TAG_KEY: Record<ShopHealth, string> = {
  ok: 'settlement.tag.ok',
  short: 'settlement.tag.short',
  mismatch: 'settlement.tag.mismatch',
};

const HEALTH_COLOR: Record<ShopHealth, { fg: string; bg: string; line: string }> = {
  ok: { fg: T.color.status.success, bg: T.color.status.successBg, line: T.color.status.successLine },
  short: { fg: T.color.status.error, bg: T.color.status.errorBg, line: T.color.status.errorLine },
  mismatch: { fg: T.color.status.warning, bg: T.color.status.warningBg, line: T.color.status.warningLine },
};

/** Pill tag có dot — direction B (không dùng antd Tag để giữ đúng fidelity). */
function PillTag(props: { health: ShopHealth }) {
  const { t } = useTranslation('shell');
  const c = HEALTH_COLOR[props.health];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: T.radius.pill,
        padding: '3px 11px',
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${c.line}`,
        background: c.bg,
        color: c.fg,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'currentColor',
          marginRight: 6,
          display: 'inline-block',
        }}
      />
      {t(HEALTH_TAG_KEY[props.health])}
    </span>
  );
}

function RowMeter({ row }: { row: SettlementShopRow }) {
  const percent = row.totalExpected > 0 ? (row.totalCollected / row.totalExpected) * 100 : 0;
  const danger = row.totalCollected < row.totalExpected;
  const c = HEALTH_COLOR[shopHealth(row)];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170 }}>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: T.color.dividerSoft,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 3,
            width: `${Math.max(0, Math.min(100, percent))}%`,
            background: danger ? c.fg : T.color.primaryGradient,
          }}
        />
      </div>
      <b style={{ fontSize: 13.5, color: T.color.textStrong, whiteSpace: 'nowrap' }}>
        {formatVnd(row.totalCollected)}
      </b>
    </div>
  );
}

const numStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  textAlign: 'right' as const,
};

const CARD_STATE_TAG_KEY = {
  pending: 'settlement.tag.pending',
  mismatch: 'settlement.tag.wrongAmount',
  ok: 'settlement.tag.confirmed',
} as const;

const CARD_STATE_COLOR = {
  pending: HEALTH_COLOR.short,
  mismatch: HEALTH_COLOR.mismatch,
  ok: HEALTH_COLOR.ok,
} as const;

/** 1 order card trong drill-down — phân loại PENDING / LỆCH TIỀN / ĐÃ THU. */
function OrderCard(props: {
  item: SettlementDetailItem;
  onConfirm: (target: ConfirmCollectTarget) => void;
}) {
  const { t } = useTranslation('shell');
  const { item } = props;
  const state = itemState(item);
  const c = CARD_STATE_COLOR[state];
  const diff =
    item.collectedAmount !== undefined ? item.collectedAmount - item.expectedAmount : undefined;

  const metaBits: string[] = [];
  if (item.completedAt) {
    metaBits.push(t('settlement.expand.completedAt', { time: new Date(item.completedAt).toLocaleString('vi-VN') }));
  }
  if (item.collectedBy) {
    metaBits.push(t('settlement.expand.collectedBy', { by: item.collectedBy }));
  }

  const amountBlocks: Array<{ label: string; value: string; tone?: 'short' | 'miss' }> = [
    { label: t('settlement.expand.expected'), value: formatVnd(item.expectedAmount) },
  ];
  if (state === 'pending') {
    amountBlocks.push({ label: t('settlement.expand.collected'), value: '—', tone: 'miss' });
    amountBlocks.push({ label: t('settlement.expand.collector'), value: '—', tone: 'miss' });
  } else {
    amountBlocks.push({
      label: t('settlement.expand.collected'),
      value: formatVnd(item.collectedAmount ?? 0),
      tone: state === 'mismatch' ? 'short' : undefined,
    });
    amountBlocks.push({
      label: t('settlement.expand.diff'),
      value: formatVnd(diff ?? 0),
      tone: state === 'mismatch' ? 'short' : undefined,
    });
  }

  return (
    <div
      data-testid={`cod-order-card-${item.fulfillCode}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: T.color.bgWhite,
        border: `1px solid ${T.color.divider}`,
        borderRadius: T.radius.md,
        padding: '10px 16px',
      }}
    >
      <div style={{ width: 180 }}>
        <div style={{ fontWeight: 600, color: T.color.textStrong, fontSize: 13 }}>{item.fulfillCode}</div>
        <div style={{ fontSize: 12, color: T.color.textFaint, marginTop: 2 }}>{metaBits.join(' · ')}</div>
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: T.radius.pill,
          padding: '3px 11px',
          fontSize: 12,
          fontWeight: 500,
          border: `1px solid ${c.line}`,
          background: c.bg,
          color: c.fg,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'currentColor',
            marginRight: 6,
            display: 'inline-block',
          }}
        />
        {t(CARD_STATE_TAG_KEY[state])}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 24, textAlign: 'right' }}>
        {amountBlocks.map((b) => (
          <div key={b.label}>
            <div style={{ fontSize: 11, color: T.color.textFaint }}>{b.label}</div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: b.tone === 'miss' ? 400 : 600,
                fontVariantNumeric: 'tabular-nums',
                color:
                  b.tone === 'short'
                    ? T.color.status.warning
                    : b.tone === 'miss'
                      ? T.color.textFaint
                      : T.color.textSecondary,
              }}
            >
              {b.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ width: 120, textAlign: 'right' }}>
        {state === 'pending' && (
          <Button
            type="primary"
            size="small"
            data-testid={`cod-confirm-${item.fulfillCode}`}
            onClick={() => props.onConfirm({ fulfillCode: item.fulfillCode, expectedAmount: item.expectedAmount })}
          >
            {t('settlement.confirm.ok')}
          </Button>
        )}
        {state === 'mismatch' && (
          <Button
            type="link"
            size="small"
            data-testid={`cod-reconfirm-${item.fulfillCode}`}
            onClick={() =>
              props.onConfirm({
                fulfillCode: item.fulfillCode,
                expectedAmount: item.expectedAmount,
                collectedAmount: item.collectedAmount,
              })
            }
          >
            {t('settlement.confirm.reconfirm')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Drill-down của 1 shop — fetch /cod/settlement/detail theo shop + kỳ. */
function ShopDetail(props: {
  shopCode: string;
  from: string;
  to: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation('shell');
  const [items, setItems] = useState<SettlementDetailItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<ConfirmCollectTarget | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setFailed(false);
    settlementApi
      .detail({ shopCode: props.shopCode, from: props.from, to: props.to })
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.shopCode, props.from, props.to]);

  const sorted: SettlementDetailItem[] = [...(items ?? [])].sort((a, b) => {
    const rank = (i: SettlementDetailItem) => (itemState(i) === 'ok' ? 1 : 0);
    return rank(a) - rank(b);
  });
  const actionCount = sorted.filter((i) => itemState(i) !== 'ok').length;
  const shortAmount = sorted.reduce(
    (acc, i) =>
      acc +
      (itemState(i) === 'pending' ? i.expectedAmount : itemState(i) === 'mismatch' ? i.expectedAmount - (i.collectedAmount ?? 0) : 0),
    0,
  );

  return (
    <div style={{ padding: '8px 16px 16px 56px', background: T.color.bgSoftWhite }}>
      {failed && <Typography.Text type="danger">{t('settlement.error.detail')}</Typography.Text>}
      {!failed && items === null && (
        <div className="sf6-shimmer" style={{ width: '100%', height: 40, borderRadius: T.radius.md }} />
      )}
      {!failed && items !== null && (
        <>
          {actionCount === 0 ? (
            <div
              style={{
                padding: 14,
                fontSize: 13,
                color: T.color.textFaint,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {t('settlement.expand.allOk')}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.color.textMuted, margin: '8px 0' }}>
              {t('settlement.expand.title', { count: actionCount, amount: shortAmount.toLocaleString('vi-VN') })}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((item) => (
              <OrderCard key={item.fulfillCode} item={item} onConfirm={setTarget} />
            ))}
          </div>
        </>
      )}
      <ConfirmCollectModal
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          // Refetch drill-down + bồng lên parent refetch aggregate.
          settlementApi
            .detail({ shopCode: props.shopCode, from: props.from, to: props.to })
            .then((r) => setItems(r.items))
            .catch(() => undefined);
          props.onChanged();
        }}
      />
    </div>
  );
}

/** Bảng chính — rows ĐÃ lọc theo segmented filter ở page (page pass rows). */
export function ShopTable(props: {
  rows: SettlementShopRow[];
  loading: boolean;
  from: string;
  to: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation('shell');
  const [expanded, setExpanded] = useState<readonly React.Key[]>([]);

  const columns: ColumnsType<SettlementShopRow> = [
    {
      title: t('settlement.col.shop'),
      dataIndex: 'shopName',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: T.color.textStrong }}>{r.shopName}</div>
          <div style={{ fontSize: 12, color: T.color.textFaint, marginTop: 2 }}>{r.shopCode}</div>
        </div>
      ),
    },
    {
      title: t('settlement.col.orders'),
      dataIndex: 'totalOrders',
      align: 'right',
      width: 130,
      render: (v: number) => <span style={numStyle}>{v}</span>,
    },
    {
      title: t('settlement.col.expected'),
      dataIndex: 'totalExpected',
      align: 'right',
      width: 150,
      render: (v: number) => <span style={numStyle}>{v.toLocaleString('vi-VN')}</span>,
    },
    {
      title: t('settlement.col.collected'),
      key: 'collected',
      width: 200,
      render: (_, r) => <RowMeter row={r} />,
    },
    {
      title: t('settlement.col.diff'),
      dataIndex: 'diffAmount',
      align: 'right',
      width: 140,
      render: (v: number) => (
        <span
          style={{
            ...numStyle,
            fontWeight: v < 0 ? 600 : 400,
            color: v < 0 ? T.color.status.error : v === 0 ? T.color.textMuted : T.color.textSecondary,
          }}
        >
          {v.toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      title: t('settlement.col.status'),
      key: 'status',
      width: 130,
      render: (_, r) => <PillTag health={shopHealth(r)} />,
    },
  ];

  return (
    <div
      style={{
        background: T.color.bgWhite,
        border: `1px solid ${T.color.divider}`,
        borderRadius: T.radius.card,
        boxShadow: T.shadow.xs,
        overflow: 'hidden',
        marginBottom: 18,
      }}
    >
      <Table<SettlementShopRow>
        style={{ padding: 0 }}
        rowKey="shopCode"
        size="middle"
        loading={props.loading}
        dataSource={props.rows}
        columns={columns}
        data-testid="settlement-shop-table"
        locale={{
          emptyText: <EmptyState title={t('settlement.empty.title')} sub={t('settlement.empty.sub')} />,
        }}
        pagination={false}
        expandedRowKeys={[...expanded]}
        onExpandedRowsChange={(keys) => setExpanded(keys)}
        expandable={{
          expandedRowRender: (row) => (
            <ShopDetail shopCode={row.shopCode} from={props.from} to={props.to} onChanged={props.onChanged} />
          ),
          rowExpandable: (row) => row.totalOrders > 0,
        }}
      />
    </div>
  );
}
