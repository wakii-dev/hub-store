/**
 * DeliveryTimeEdit — cell "Thời gian dự kiến giao" (width 230).
 *
 * Rule §9 (rule 3 spec §3.6): CHỈ đơn batchStatus=0 (Chưa soạn) được sửa —
 * Java cũng server-side reject. batchStatus≠0 → render read-only.
 * Edit qua Modal nhỏ chứa RangePicker → PUT /fulfillment/{code}/delivery-time
 * (mutation invalidates Fulfillment LIST → bảng refetch).
 *
 * ⚠ Convert picker strings → ISO-8601 khi save (Java parse OffsetDateTime —
 * xem utils/datetime). Giá trị hiện tại của đơn là ISO từ wire.
 */
import { useState } from "react";
import { Button, DatePicker, Modal, Space, message } from "antd";
import moment from "moment";
import { useTranslation } from "react-i18next";
import { formatPeriodOfTime, type HubStoreOrderFilterItem } from "@hub-store/shared";
import { useUpdateDeliveryTimeMutation } from "../api/ordersApi";
import { DATETIME_FORMAT, toIsoDatetime } from "../utils/datetime";

const BATCH_STATUS_NOT_PREPARED = 0;

export function DeliveryTimeCell({ order }: { order: HubStoreOrderFilterItem }) {
  const { t } = useTranslation("orders");
  const [open, setOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<{ from: string; to: string } | null>(null);
  const [update, { isLoading }] = useUpdateDeliveryTimeMutation();

  const editable = order.batchStatus === BATCH_STATUS_NOT_PREPARED;

  const handleSave = async () => {
    if (!pickerValue) return;
    const from = toIsoDatetime(pickerValue.from);
    const to = toIsoDatetime(pickerValue.to);
    if (!from || !to) return;
    try {
      await update({ code: order.fulfillCode, deliveryTime: { from, to } }).unwrap();
      message.success(t("edit.success"));
      setOpen(false);
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      message.error(data?.message ?? t("common.empty"));
    }
  };

  return (
    <Space size={4}>
      <span data-testid="delivery-time-text">
        {formatPeriodOfTime(order.deliveryTime.from, order.deliveryTime.to)}
      </span>
      {editable && (
        <Button
          type="link"
          size="small"
          title={t("edit.deliveryTime.tooltip")}
          data-testid={`edit-delivery-${order.fulfillCode}`}
          onClick={() => {
            setPickerValue({
              from: moment(order.deliveryTime.from).format(DATETIME_FORMAT),
              to: moment(order.deliveryTime.to).format(DATETIME_FORMAT),
            });
            setOpen(true);
          }}
        >
          ✎
        </Button>
      )}
      <Modal
        title={t("edit.deliveryTime.title")}
        open={open}
        onOk={handleSave}
        onCancel={() => setOpen(false)}
        okText={t("edit.save")}
        cancelText={t("edit.cancel")}
        confirmLoading={isLoading}
        okButtonProps={{ disabled: !pickerValue }}
        destroyOnClose
      >
        <DatePicker.RangePicker
          style={{ width: "100%" }}
          showTime={{ format: "HH:mm" }}
          format={DATETIME_FORMAT}
          value={
            pickerValue
              ? [moment(pickerValue.from, DATETIME_FORMAT), moment(pickerValue.to, DATETIME_FORMAT)]
              : null
          }
          onChange={(_, dateStrings) => {
            const [from, to] = dateStrings;
            setPickerValue(from && to ? { from, to } : null);
          }}
        />
      </Modal>
    </Space>
  );
}
