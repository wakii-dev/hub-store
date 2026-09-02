/**
 * PhoneLink — `tel:` link "Gọi điện" (acceptance: mobile mở dialer,
 * desktop hiển thị link). Render theo flag IS_SHOW_PHONE_CALL; phone rỗng
 * → text thường (không link).
 */
import { Typography } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { DESIGN_TOKENS } from '@hub-store/shared';
import { useTranslation } from 'react-i18next';
import { IS_SHOW_PHONE_CALL } from './techApi';

export function PhoneLink(props: { phone: string; name?: string }) {
  const { t } = useTranslation('tech');
  if (!props.phone) return <span>{props.name ?? '—'}</span>;
  if (!IS_SHOW_PHONE_CALL) return <span>{props.phone}</span>;
  return (
    <span>
      {props.name ? `${props.name} · ` : ''}
      <Typography.Link
        href={`tel:${props.phone}`}
        style={{ color: DESIGN_TOKENS.color.primary, fontWeight: 600 }}
        data-testid="tech-phone-link"
      >
        <PhoneOutlined /> {props.phone}
      </Typography.Link>
      <span style={{ color: DESIGN_TOKENS.color.textFaint, fontSize: 11.5, marginLeft: 4 }}>
        ({t('phone.call')})
      </span>
    </span>
  );
}
