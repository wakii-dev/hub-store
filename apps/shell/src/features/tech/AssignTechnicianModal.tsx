/**
 * AssignTechnicianModal — gán/re-gán KTV cho đơn lắp đặt (SF-20 task 3).
 * Gợi ý NV từ SF-19 suggest endpoint (theo regionCode của đơn, workload asc);
 * confirm → POST assign; 409 (precondition BE) → message riêng.
 * Re-assign DÙNG CÙNG modal (context pack item 3).
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Button, Modal, Radio, Spin, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';
import { assignTechnician, suggestTechnicians, type InstallationOrderDto } from './techApi';

export interface AssignSubmitResult {
  order: InstallationOrderDto | null;
}

export function AssignTechnicianModal(props: {
  open: boolean;
  order: InstallationOrderDto | null;
  onClose: () => void;
  onAssigned: (result: AssignSubmitResult) => void;
}) {
  const { t } = useTranslation('tech');
  const [options, setOptions] = useState<{ code: string; name: string; type: string; activeCount: number }[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const regionCode = props.order?.regionCode ?? '';

  // Mở modal → fetch suggest; đổi đơn → refetch. regionCode rỗng → bỏ (BE 422).
  useEffect(() => {
    if (!props.open || !regionCode.trim()) {
      setOptions([]);
      setSuggestError(null);
      return;
    }
    let stale = false;
    setLoadingSuggest(true);
    setSuggestError(null);
    setSelected(null);
    suggestTechnicians(regionCode)
      .then((items) => {
        if (!stale) setOptions(items);
      })
      .catch((err: unknown) => {
        if (!stale) setSuggestError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!stale) setLoadingSuggest(false);
      });
    return () => {
      stale = true;
    };
  }, [props.open, regionCode]);

  const currentTechnician = props.order?.technicianCode ?? '';
  const isReassign = currentTechnician.trim() !== '';
  const optionsWithCurrent = useMemo(
    () =>
      isReassign && currentTechnician && !options.some((o) => o.code === currentTechnician)
        ? [{ code: currentTechnician, name: currentTechnician, type: 'KTV', activeCount: 0 }, ...options]
        : options,
    [options, isReassign, currentTechnician],
  );

  const submit = async () => {
    if (!props.order || !selected) return;
    setSubmitting(true);
    try {
      const result = await assignTechnician(props.order.serviceOrderCode, selected);
      message.success(t('assign.success', { code: props.order.serviceOrderCode }));
      props.onAssigned(result);
      props.onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        message.error(t('assign.conflict'));
      } else {
        message.error(t('assign.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={props.open}
      title={t('assign.title', { code: props.order?.serviceOrderCode ?? '' })}
      onCancel={props.onClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={props.onClose}>
          {t('common.close')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          disabled={!selected}
          loading={submitting}
          onClick={() => void submit()}
          data-testid="tech-assign-confirm"
        >
          {t('assign.confirm')}
        </Button>,
      ]}
      data-testid="tech-assign-modal"
    >
      {loadingSuggest ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : suggestError ? (
        <Alert type="error" showIcon message={t('assign.error')} description={suggestError} />
      ) : optionsWithCurrent.length === 0 ? (
        <Alert type="info" showIcon message={t('assign.empty')} />
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: DESIGN_TOKENS.color.textFaint,
              margin: '4px 0 10px',
            }}
          >
            {t('assign.suggestTitle', { region: regionCode || '—' })}
          </div>
          <Radio.Group
            value={selected}
            onChange={(e) => setSelected(e.target.value as string)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}
            data-testid="tech-assign-options"
          >
            {optionsWithCurrent.map((option) => (
              <Radio key={option.code} value={option.code} style={{ width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={24} style={{ background: DESIGN_TOKENS.color.primaryGradient, fontSize: 10 }}>
                    {option.type}
                  </Avatar>
                  <span style={{ fontWeight: 600, color: DESIGN_TOKENS.color.textStrong }}>{option.name}</span>
                  <span style={{ color: DESIGN_TOKENS.color.textMuted, fontSize: 12 }}>({option.code})</span>
                  <span style={{ color: DESIGN_TOKENS.color.textFaint, fontSize: 12 }}>
                    · {t('assign.workload', { count: option.activeCount })}
                  </span>
                </span>
              </Radio>
            ))}
          </Radio.Group>
        </>
      )}
    </Modal>
  );
}
