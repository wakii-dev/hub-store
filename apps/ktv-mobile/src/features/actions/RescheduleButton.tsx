/**
 * RescheduleButton — "Đổi lịch" (SF-25 T6): render CHỈ khi
 * order.buttons.allowReschedule === true (BE-authoritative — flag false →
 * null, không tự suy, spec §4.2). Click → mở RescheduleModal (dời lịch +
 * ghi chú); submit → onUpdated với order SAU mutate (status RESCHEDULED +
 * expectedTime mới; allowAccept bật lại — dead-end fix).
 * stopPropagation: button nằm trong OrderCard clickable (tap card → detail).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "antd";
import type { InstallationOrderDto } from "../../api/ktvApi";
import RescheduleModal from "./RescheduleModal";

export default function RescheduleButton(props: {
  order: InstallationOrderDto;
  technicianCode: string;
  onUpdated: (order: InstallationOrderDto) => void;
}) {
  const { t } = useTranslation("ktvMobile");
  const [open, setOpen] = useState(false);

  if (!props.order.buttons.allowReschedule) return null;

  return (
    <>
      <Button
        size="small"
        data-testid={`ktv-reschedule-${props.order.serviceOrderCode}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {t("actions.reschedule")}
      </Button>
      <RescheduleModal
        open={open}
        order={props.order}
        technicianCode={props.technicianCode}
        onClose={() => setOpen(false)}
        onUpdated={props.onUpdated}
      />
    </>
  );
}
