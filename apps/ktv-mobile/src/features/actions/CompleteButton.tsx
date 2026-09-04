/**
 * CompleteButton — "Hoàn tất" (SF-25 T5): render CHỈ khi
 * order.buttons.allowComplete === true (flag mới SF-25 T2 — BE-authoritative).
 * Click → Modal.confirm "Xác nhận hoàn tất — ghi giờ hiện tại" → POST
 * complete → onUpdated với order SAU mutate (DELIVERED + buttons mới).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, message } from "antd";
import { completeOrder, type InstallationOrderDto } from "../../api/ktvApi";

export default function CompleteButton(props: {
  order: InstallationOrderDto;
  technicianCode: string;
  onUpdated: (order: InstallationOrderDto) => void;
}) {
  const { t } = useTranslation("ktvMobile");
  const [loading, setLoading] = useState(false);

  if (!props.order.buttons.allowComplete) return null;

  const handleComplete = async () => {
    setLoading(true);
    try {
      const updated = await completeOrder(
        props.order.serviceOrderCode,
        props.technicianCode,
      );
      props.onUpdated(updated);
      message.success(t("actions.complete.success"));
    } catch (err) {
      console.error("[ktv-mobile] complete failed:", err);
      message.error(t("actions.complete.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="small"
      loading={loading}
      data-testid={`ktv-complete-${props.order.serviceOrderCode}`}
      onClick={(e) => {
        e.stopPropagation();
        Modal.confirm({
          title: t("actions.complete.confirmTitle"),
          content: t("actions.complete.confirmContent"),
          okText: t("actions.complete.ok"),
          cancelText: t("actions.complete.cancel"),
          onOk: () => handleComplete(),
        });
      }}
    >
      {t("actions.complete")}
    </Button>
  );
}
