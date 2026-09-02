/**
 * MarkFailModal — D7 "Mark thất bại" (spec SF-13, plan T8).
 *
 * - Select lý do (DELIVERY_FAIL_REASON_LABELS VI/EN từ @hub-store/shared).
 * - TextArea ghi chú (không bắt buộc).
 * - Submit → POST /orders/:code/fail (mutation tự invalidate Fulfillment LIST
 *   → hydration getBatchOrders trong expanded row refetch).
 * - Server là chốt cuối: đơn đã FAILED → 422 → message lỗi.
 *
 * Parent mount theo điều kiện (`failTarget !== null`) → state lý do/ghi chú
 * reset tự nhiên mỗi lần mở (không cần useEffect).
 */
import { useState } from "react";
import { Button, Input, Modal, Select, Space, Typography, message } from "antd";
import { useTranslation } from "react-i18next";
import {
  DELIVERY_FAIL_REASON,
  DELIVERY_FAIL_REASON_LABELS,
  type Locale,
} from "@hub-store/shared";
import { useFailOrderMutation } from "../api/batchesApi";

/** Message từ BFF error envelope (AxiosBaseQueryError.data = ErrorEnvelope). */
function errMessage(err: unknown): string {
  const e = err as { data?: { message?: string }; error?: string };
  return e?.data?.message ?? e?.error ?? "";
}

export interface MarkFailModalProps {
  open: boolean;
  /** Mã đơn (RSA orderCode — server dual-lookup fulfillCode/orderCode). */
  orderCode: string | null;
  onClose: () => void;
}

export function MarkFailModal({ open, orderCode, onClose }: MarkFailModalProps) {
  const { t, i18n } = useTranslation("fulfillment");
  const locale: Locale = i18n.language.startsWith("vi") ? "vi" : "en";
  const [reason, setReason] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");
  const [failOrder, { isLoading }] = useFailOrderMutation();

  const reasonOptions = (
    Object.keys(DELIVERY_FAIL_REASON) as Array<keyof typeof DELIVERY_FAIL_REASON>
  ).map((name) => {
    const value = DELIVERY_FAIL_REASON[name];
    return { value, label: DELIVERY_FAIL_REASON_LABELS[value][locale] };
  });

  const handleOk = async () => {
    if (!orderCode || reason === undefined) return;
    try {
      await failOrder({ code: orderCode, reason, note: note.trim() || undefined }).unwrap();
      message.success(t("exception.failSuccess", { code: orderCode }));
      onClose();
    } catch (err) {
      message.error(`${t("exception.actionFailed")}: ${errMessage(err)}`);
    }
  };

  return (
    <Modal
      open={open}
      title={t("exception.modalTitle", { code: orderCode ?? "" })}
      data-testid="mark-fail-modal"
      okText={t("exception.submit")}
      cancelText={t("exception.cancel")}
      okButtonProps={{
        disabled: reason === undefined,
        loading: isLoading,
        "data-testid": "fail-submit",
      }}
      onOk={() => void handleOk()}
      onCancel={onClose}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <Typography.Text>{t("exception.reasonLabel")}</Typography.Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            placeholder={t("exception.reasonPlaceholder")}
            options={reasonOptions}
            value={reason}
            onChange={setReason}
            data-testid="fail-reason-select"
          />
        </div>
        <div>
          <Typography.Text>{t("exception.noteLabel")}</Typography.Text>
          <Input.TextArea
            style={{ marginTop: 4 }}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("exception.notePlaceholder")}
            data-testid="fail-note"
          />
        </div>
      </Space>
    </Modal>
  );
}
