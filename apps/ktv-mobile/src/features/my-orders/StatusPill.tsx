/**
 * StatusPill — pill trạng thái mobile theo pattern shell TechStatusTag
 * (SF-6 §2.2 pastel + chấm tròn). Màu từ DESIGN_TOKENS.color.status qua
 * tone map 10 mã — KHÔNG hex cứng, KHÔNG đụng shell (copy, không import).
 * Label từ i18n `status.<CODE>` (ktvMobile ns, vi/en) — fallback raw code.
 */
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';

type StatusTone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/** 10 mã trạng thái → tone pastel semantic (mirror shell techHelpers SF-20). */
const STATUS_TONE_MAP: Readonly<Record<string, StatusTone>> = {
  NEW: 'info',
  CONFIRMED: 'info',
  PROCESSING: 'warning',
  SHIPPING: 'warning',
  DELIVERED: 'success',
  FAILED: 'error',
  REDELIVERY: 'warning',
  RESCHEDULED: 'warning',
  CANCELLED: 'error',
  RETURNED: 'neutral',
};

function statusTone(status: string): StatusTone {
  return STATUS_TONE_MAP[status] ?? 'info';
}

/** Tone → { text, bg, line } từ DESIGN_TOKENS. */
function toneColors(tone: StatusTone): { text: string; bg: string; line: string } {
  const s = DESIGN_TOKENS.color.status;
  switch (tone) {
    case 'success':
      return { text: s.success, bg: s.successBg, line: s.successLine };
    case 'error':
      return { text: s.error, bg: s.errorBg, line: s.errorLine };
    case 'warning':
      return { text: s.warning, bg: s.warningBg, line: s.warningLine };
    case 'info':
      return { text: s.info, bg: s.infoBg, line: s.infoLine };
    case 'neutral':
      return { text: s.neutral, bg: s.neutralBg, line: s.neutralLine };
  }
}

export default function StatusPill(props: { status: string }) {
  const { t } = useTranslation('ktvMobile');
  const colors = toneColors(statusTone(props.status));
  return (
    <span
      data-testid={`ktv-status-${props.status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 11px',
        borderRadius: DESIGN_TOKENS.radius.pill,
        fontSize: 12,
        fontWeight: 500,
        background: colors.bg,
        border: `1px solid ${colors.line}`,
        color: colors.text,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'currentColor',
        }}
      />
      {t(`status.${props.status}`, props.status)}
    </span>
  );
}
