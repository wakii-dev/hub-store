/**
 * AcceptButton — "Nhận việc" (SF-25 T5): render CHỈ khi
 * order.buttons.allowAccept === true (BE-authoritative — flag false → null,
 * không tự suy, spec §4.2). Click → POST accept → onUpdated với order SAU
 * mutate (status PROCESSING + buttons mới) — card/page tự render lại pill.
 * stopPropagation: button nằm trong OrderCard clickable (tap card → detail).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, message } from "antd";
import { acceptOrder, type InstallationOrderDto } from "../../api/ktvApi";

export default function AcceptButton(props: {
  order: InstallationOrderDto;
  technicianCode: string;
  onUpdated: (order: InstallationOrderDto) => void;
}) {
  const { t } = useTranslation("ktvMobile");
  const [loading, setLoading] = useState(false);

  if (!props.order.buttons.allowAccept) return null;

  const handleAccept = async () => {
    setLoading(true);
    try {
      const updated = await acceptOrder(
        props.order.serviceOrderCode,
        props.technicianCode,
      );
      props.onUpdated(updated);
      message.success(t("actions.accept.success"));
    } catch (err) {
      console.error("[ktv-mobile] accept failed:", err);
      message.error(t("actions.accept.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="primary"
      size="small"
      loading={loading}
      data-testid={`ktv-accept-${props.order.serviceOrderCode}`}
      onClick={(e) => {
        e.stopPropagation();
        void handleAccept();
      }}
    >
      {t("actions.accept")}
    </Button>
  );
}
