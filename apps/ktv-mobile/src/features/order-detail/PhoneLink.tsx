/**
 * PhoneLink — `tel:` link "Gọi khách hàng" (SF-25 T7, acceptance A3: mobile
 * mở dialer). Copy pattern shell tech/PhoneLink (SF-20) nhưng antd Button
 * block + size large — tap target lớn cho 375px. testid GIỮ `tech-phone-link`
 * (consistency với shell + e2e pattern). Phone rỗng → không render.
 */
import { Button } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS } from '@hub-store/shared';

export default function PhoneLink(props: { phone: string }) {
  const { t } = useTranslation('ktvMobile');
  if (!props.phone) return null;
  return (
    <Button
      block
      size="large"
      icon={<PhoneOutlined />}
      href={`tel:${props.phone}`}
      data-testid="tech-phone-link"
      style={{
        color: DESIGN_TOKENS.color.primary,
        borderColor: DESIGN_TOKENS.color.primary,
        fontWeight: 600,
      }}
    >
      {t('detail.call')}
    </Button>
  );
}
