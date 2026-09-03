/**
 * RescheduleModal — dời lịch lắp đặt (SF-25 T6): DatePicker + TimePicker
 * (antd vi_VN locale đã wire ở App.tsx ConfigProvider; moment — convention
 * antd4 của repo, pattern D2CPage/CreateBatchingModal) + TextArea ghi chú
 * (optional). Validation FE: thời gian mới PHẢI > hiện tại (chặn quá khứ
 * trước submit — BE vẫn validate lại; defense-in-depth, spec §4.2).
 *
 * expectedTime gửi ISO +07:00 ("YYYY-MM-DDTHH:mm:ssZ" trên máy +07) — khớp
 * format seed/BFF. Submit → POST reschedule → onUpdated(order SAU mutate:
 * status RESCHEDULED + expectedTime mới + buttons mới).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatePicker, Input, Modal, TimePicker, message } from "antd";
import moment, { type Moment } from "moment";
import { rescheduleOrder, type InstallationOrderDto } from "../../api/ktvApi";

type ErrorKey = "missing" | "past" | null;

/** Gộp date + time thành một moment (giây = 0) — null nếu thiếu một trong hai. */
export function combineDateTime(date: Moment | null, time: Moment | null): Moment | null {
  if (!date || !time) return null;
  return moment(date)
    .hour(time.hour())
    .minute(time.minute())
    .second(0)
    .millisecond(0);
}

/** FE chặn quá khứ: thời gian mới phải SAU hiện tại (so epoch — không lệch TZ). */
export function isPast(dt: Moment, now: Moment = moment()): boolean {
  return dt.valueOf() <= now.valueOf();
}

export default function RescheduleModal(props: {
  open: boolean;
  order: InstallationOrderDto;
  technicianCode: string;
  onClose: () => void;
  onUpdated: (order: InstallationOrderDto) => void;
}) {
  const { t } = useTranslation("ktvMobile");
  const [date, setDate] = useState<Moment | null>(null);
  const [time, setTime] = useState<Moment | null>(moment("09:00", "HH:mm"));
  const [note, setNote] = useState("");
  const [error, setError] = useState<ErrorKey>(null);
  const [submitting, setSubmitting] = useState(false);

  // Mở lại modal = form sạch (không giữ giá trị lần trước).
  useEffect(() => {
    if (props.open) {
      setDate(null);
      setTime(moment("09:00", "HH:mm"));
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [props.open]);

  const handleOk = async () => {
    const dt = combineDateTime(date, time);
    if (!dt) {
      setError("missing");
      return;
    }
    if (isPast(dt)) {
      setError("past");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await rescheduleOrder(
        props.order.serviceOrderCode,
        props.technicianCode,
        dt.format("YYYY-MM-DDTHH:mm:ssZ"),
        note.trim() || undefined,
      );
      props.onUpdated(updated);
      message.success(t("actions.reschedule.success"));
      props.onClose();
    } catch (err) {
      console.error("[ktv-mobile] reschedule failed:", err);
      message.error(t("actions.reschedule.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={props.open}
      title={t("actions.reschedule.modalTitle")}
      okText={t("actions.reschedule.ok")}
      cancelText={t("actions.reschedule.cancel")}
      confirmLoading={submitting}
      onOk={() => void handleOk()}
      onCancel={props.onClose}
      data-testid="ktv-reschedule-modal"
      destroyOnClose
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          <div style={{ marginBottom: 4 }}>{t("actions.reschedule.dateLabel")}</div>
          <DatePicker
            style={{ width: "100%" }}
            value={date}
            // Chặn chọn ngày trước hôm nay ngay trên calendar.
            disabledDate={(d) => d.isBefore(moment(), "day")}
            onChange={(d) => {
              setDate(d);
              setError(null);
            }}
            data-testid="ktv-reschedule-date"
          />
        </label>
        <label>
          <div style={{ marginBottom: 4 }}>{t("actions.reschedule.timeLabel")}</div>
          <TimePicker
            style={{ width: "100%" }}
            value={time}
            format="HH:mm"
            minuteStep={5}
            onChange={(tm) => {
              setTime(tm);
              setError(null);
            }}
            data-testid="ktv-reschedule-time"
          />
        </label>
        <label>
          <div style={{ marginBottom: 4 }}>{t("actions.reschedule.noteLabel")}</div>
          <Input.TextArea
            rows={3}
            value={note}
            maxLength={500}
            placeholder={t("actions.reschedule.notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            data-testid="ktv-reschedule-note"
          />
        </label>
        {error ? (
          <div
            data-testid="ktv-reschedule-error"
            style={{ color: "#cf1322", fontSize: 13 }}
          >
            {error === "missing"
              ? t("actions.reschedule.errorMissing")
              : t("actions.reschedule.errorPast")}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
