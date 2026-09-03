/**
 * ConfirmCollectModal — SF-14 direction B: xác nhận thu 1 đơn COD.
 * Prefill kỳ vọng; input thực thu OPTIONAL (trống = đủ → omit collectedAmount,
 * server lấy expected — D3). Nhập 0 = thu thật 0 đồng.
 */
import { useState } from 'react';
import { Input, message, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatVnd } from '@hub-store/shared';
import type { SettlementDetailItem } from '@hub-store/shared';
import { settlementApi } from '../../api/settlementApi';

export interface ConfirmCollectTarget {
  fulfillCode: string;
  expectedAmount: number;
  /** undefined với đơn PENDING — modal prefill expected, để trống = đủ. */
  collectedAmount?: number;
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
    // Trống → omit (server lấy expected); nhập → số nguyên ≥ 0 (BFF chốt gate).
    const trimmed = amountText.trim().replace(/[.,\s]/g, '');
    const collected = trimmed.length > 0 ? Number(trimmed) : undefined;
    if (collected !== undefined && (!Number.isInteger(collected) || collected < 0)) {
      message.error(t('settlement.confirm.failed'));
      return;
    }
    setSubmitting(true);
    try {
      const resp = await settlementApi.confirm({
        fulfillCode: target.fulfillCode,
        ...(collected !== undefined ? { collectedAmount: collected } : {}),
      });
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
      cancelText="Hủy"
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
  if (item.status === 0) return 'pending'; // COD_COLLECTION_STATUS.COD_PENDING
  if (item.collectedAmount !== undefined && item.collectedAmount !== item.expectedAmount) {
    return 'mismatch';
  }
  return 'ok';
}
