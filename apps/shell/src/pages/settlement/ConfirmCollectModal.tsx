/**
 * ConfirmCollectModal — SF-14 direction B: xác nhận thu 1 đơn COD.
 * Prefill kỳ vọng; input thực thu OPTIONAL (trống = đủ → omit collectedAmount,
 * server lấy expected — D3). Nhập 0 = thu thật 0 đồng.
 */
import { useState } from 'react';
import { Input, message, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { COD_COLLECTION_STATUS, formatVnd } from '@hub-store/shared';
import type { ConfirmCodBody, SettlementDetailItem } from '@hub-store/shared';
import { settlementApi } from '../../api/settlementApi';

export interface ConfirmCollectTarget {
  fulfillCode: string;
  expectedAmount: number;
  /** undefined với đơn PENDING — modal prefill expected, để trống = đủ. */
  collectedAmount?: number;
}

/**
 * Parse input thực thu → `number | undefined` (review P1-3: tách pure function
 * để unit test semantics). Trống/whitespace → undefined = OMIT key (server lấy
 * expected — D3). "0" → 0 = thu thật 0 đồng (KHÔNG phải absence). Grouping
 * "450.000"/"450,000" được chấp nhận. Sai định dạng (âm, thập phân, chữ) → throw.
 */
export function parseCollectedAmount(amountText: string): number | undefined {
  const cleaned = amountText.trim();
  if (cleaned.length === 0) return undefined;
  // Chỉ nhận số nguyên hoặc grouping chuẩn (450000 | 450.000 | 450,000).
  // KHÔNG strip-then-Number mù quáng: '450000.5' → '4500005' là sai tiền im lặng.
  if (!/^\d+([.,]\d{3})*$/.test(cleaned)) {
    throw new Error(`Invalid collected amount: ${amountText}`);
  }
  return Number(cleaned.replace(/[.,]/g, ''));
}

/**
 * Body POST /cod/confirm — collectedAmount được OMIT (không phải gửi null/0)
 * khi undefined để server phân biệt absence (lấy expected) vs 0 (thu 0 đồng).
 */
export function buildConfirmBody(fulfillCode: string, collected?: number): ConfirmCodBody {
  return {
    fulfillCode,
    ...(collected !== undefined ? { collectedAmount: collected } : {}),
  };
}

export function ConfirmCollectModal(props: {
  target: ConfirmCollectTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('shell');
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const target = props.target;

  const handleOk = async () => {
    if (!target) return;
    let collected: number | undefined;
    try {
      collected = parseCollectedAmount(amountText);
    } catch {
      message.error(t('settlement.confirm.failed'));
      return;
    }
    setSubmitting(true);
    try {
      const resp = await settlementApi.confirm(buildConfirmBody(target.fulfillCode, collected));
      const failed = resp.results.find((r) => !r.success);
      if (failed) {
        message.error(`${t('settlement.confirm.failed')}: ${failed.message}`);
        return;
      }
      message.success(t('settlement.confirm.success', { code: target.fulfillCode }));
      setAmountText('');
      props.onClose();
      props.onDone();
    } catch {
      message.error(t('settlement.confirm.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title={t('settlement.confirm.title')}
      okText={t('settlement.confirm.ok')}
      cancelText={t('common.cancel')}
      confirmLoading={submitting}
      onOk={() => void handleOk()}
      onCancel={() => {
        setAmountText('');
        props.onClose();
      }}
      destroyOnClose
      width={460}
    >
      {target && (
        <>
          <Typography.Paragraph style={{ marginBottom: 4 }}>
            {t('settlement.confirm.fulfillCode')}
          </Typography.Paragraph>
          <Typography.Paragraph strong data-testid="confirm-cod-fulfill-code">
            {target.fulfillCode}
          </Typography.Paragraph>
          <Typography.Paragraph style={{ marginBottom: 4 }}>
            {t('settlement.confirm.expected')}
          </Typography.Paragraph>
          <Typography.Paragraph strong data-testid="confirm-cod-expected">
            {formatVnd(target.expectedAmount)}
          </Typography.Paragraph>
          <div style={{ marginBottom: 6 }}>
            {t('settlement.confirm.collectedLabel')}
          </div>
          <Input
            data-testid="confirm-cod-collected-input"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="numeric"
            placeholder={String(target.collectedAmount ?? target.expectedAmount)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('settlement.confirm.collectedHint')}
          </Typography.Text>
        </>
      )}
    </Modal>
  );
}

/** Thuộc tính phục vụ phân loại card trong drill-down. */
export function itemState(item: SettlementDetailItem): 'pending' | 'mismatch' | 'ok' {
  // Wire code qua enum (review P2) — mirror hubstore.fulfillment.v1 enum.
  if (item.status === COD_COLLECTION_STATUS.PENDING) return 'pending';
  if (item.collectedAmount !== undefined && item.collectedAmount !== item.expectedAmount) {
    return 'mismatch';
  }
  return 'ok';
}
