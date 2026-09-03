/**
 * DeliveryTimeEdit — cell "Thời gian dự kiến giao" (width 230).
 *
 * Rule §9 (rule 3 spec §3.6): CHỈ đơn batchStatus=0 (Chưa soạn) được sửa —
 * Java cũng server-side reject. batchStatus≠0 → render read-only.
 *
 * SF-28 (spec Q4): slot picker thay RangePicker thô —
 *   DatePicker (disabledDate = ngày < hôm nay, TZ Asia/Ho_Chi_Minh)
 *   → GET /fulfillment/time-slots?date= (query chỉ chạy khi chọn ngày)
 *   → Radio chips (testid `delivery-slot-${index}`, disabled nếu slot đã qua
 *     khi date = hôm nay — belt-and-braces, BFF đã lọc)
 *   → PUT /fulfillment/{code}/delivery-time với from/to ISO offset +07:00
 *     TƯỜNG MINH (`YYYY-MM-DDTHH:mm:00+07:00` — BFF guard Date.parse +
 *     Java parse OffsetDateTime).
 *
 * SF-28 role gate: nút sửa chỉ render cho Coordinator/Manager/Admin
 * (khớp requireRole BFF trên PUT delivery-time — usePermissions role store).
 */
import { useState } from "react";
import { Button, DatePicker, Modal, Radio, Space, message } from "antd";
import moment from "moment";
import { useTranslation } from "react-i18next";
import {
  formatPeriodOfTime,
  usePermissions,
  type HubStoreOrderFilterItem,
  type Role,
} from "@hub-store/shared";
import { useGetDeliveryTimeSlotsQuery, useUpdateDeliveryTimeMutation } from "../api/ordersApi";

const BATCH_STATUS_NOT_PREPARED = 0;
/** Khớp requireRole('Coordinator','Manager','Admin') BFF-side (routes/fulfillment.ts). */
const DELIVERY_EDIT_ROLES: readonly Role[] = ["Coordinator", "Manager", "Admin"];
const VN_OFFSET_MINUTES = 420;

function vnNow(): moment.Moment {
  return moment().utcOffset(VN_OFFSET_MINUTES);
}

/** '10:00' → 600 — mirror BFF slotEndMinutes. */
function slotEndMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Slot đã qua: date = hôm nay (VN) và giờ kết thúc ≤ bây giờ (VN). */
export function isSlotPast(date: string, slotTo: string, now: moment.Moment = vnNow()): boolean {
  return date === now.format("YYYY-MM-DD") && slotEndMinutes(slotTo) <= now.hour() * 60 + now.minute();
}

export function DeliveryTimeCell({ order }: { order: HubStoreOrderFilterItem }) {
  const { t } = useTranslation("orders");
  const { role } = usePermissions();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slotIdx, setSlotIdx] = useState<number | null>(null);
  const [update, { isLoading }] = useUpdateDeliveryTimeMutation();
  const {
    data: slotsData,
    isError: slotsError,
    isLoading: slotsLoading,
  } = useGetDeliveryTimeSlotsQuery(date ?? "", { skip: !date });

  const editable =
    order.batchStatus === BATCH_STATUS_NOT_PREPARED && role !== null && DELIVERY_EDIT_ROLES.includes(role);

  const slots = slotsData?.slots ?? [];

  const handleSave = async () => {
    if (!date || slotIdx === null) return;
    const slot = slots[slotIdx];
    if (!slot) return;
    const from = `${date}T${slot.from}:00+07:00`;
    const to = `${date}T${slot.to}:00+07:00`;
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
            setDate(null);
            setSlotIdx(null);
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
        okButtonProps={{ disabled: !date || slotIdx === null }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <div>
            <div style={{ marginBottom: 4 }}>{t("edit.deliveryTime.selectDate")}</div>
            <DatePicker
              style={{ width: "100%" }}
              format="YYYY-MM-DD"
              disabledDate={(current) => current.isBefore(vnNow().startOf("day"), "day")}
              value={date ? moment(date, "YYYY-MM-DD") : null}
              onChange={(_, dateString) => {
                setDate((dateString as string) || null);
                setSlotIdx(null);
              }}
            />
          </div>
          {date && (
            <div>
              <div style={{ marginBottom: 4 }}>{t("edit.deliveryTime.selectSlot")}</div>
              {slotsError ? (
                <span>{t("edit.deliveryTime.slotsError")}</span>
              ) : slotsLoading ? null : slots.length === 0 ? (
                <span>{t("edit.deliveryTime.noSlots")}</span>
              ) : (
                <Radio.Group
                  value={slotIdx ?? undefined}
                  onChange={(e) => setSlotIdx(e.target.value as number)}
                >
                  {slots.map((s, i) => (
                    <Radio.Button
                      key={s.id}
                      value={i}
                      disabled={isSlotPast(date, s.to)}
                      data-testid={`delivery-slot-${i}`}
                    >
                      {s.from} - {s.to}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              )}
            </div>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
