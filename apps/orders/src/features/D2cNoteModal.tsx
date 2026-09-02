/**
 * D2cNoteModal — ghi chú đơn D2C (SF-18, spec §3.4; pattern HubStoreTransferModal):
 * TextArea → PUT /d2c-orders/:orderCode/note (khóa nghiệp vụ order_code) →
 * invalidates D2c LIST → list refetch; lỗi → message.error từ envelope.
 */
import { useEffect, useState } from "react";
import { Button, Input, Modal, Space, Typography, message } from "antd";
import { useTranslation } from "react-i18next";
import { useUpdateD2cNoteMutation } from "@hub-store/api-client";
import type { D2cOrderItem } from "../utils/d2cItem";

export interface D2cNoteModalProps {
  open: boolean;
  order: D2cOrderItem | null;
  onClose: () => void;
}

export function D2cNoteModal({ open, order, onClose }: D2cNoteModalProps) {
  const { t } = useTranslation("d2c");
  const [note, setNote] = useState("");
  const [save, { isLoading }] = useUpdateD2cNoteMutation();

  // Reload text mỗi lần mở (đồng bộ note mới nhất của đơn được chọn).
  useEffect(() => {
    if (open) setNote(order?.note ?? "");
  }, [open, order]);

  const handleSave = async () => {
    if (!order) return;
    try {
      await save({ orderCode: order.orderCode, note }).unwrap();
      message.success(t("noteModal.success"));
      onClose();
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      message.error(data?.message ?? t("noteModal.error"));
    }
  };

  return (
    <Modal
      title={t("noteModal.title")}
      open={open}
      onCancel={onClose}
      width={520}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose} data-testid="d2c-note-cancel">
            {t("noteModal.cancel")}
          </Button>
          <Button
            type="primary"
            loading={isLoading}
            disabled={!order}
            onClick={() => void handleSave()}
            data-testid="d2c-note-save"
          >
            {t("noteModal.save")}
          </Button>
        </Space>
      }
    >
      {order && (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Typography.Text strong data-testid="d2c-note-order-code">
            {order.orderCode}
          </Typography.Text>
          <Input.TextArea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("noteModal.placeholder")}
            data-testid="d2c-note-input"
          />
        </Space>
      )}
    </Modal>
  );
}
