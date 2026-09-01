/**
 * CreateBatchModal — PLACEHOLDER (SF-8 lắp D1b thật: modal 1310×918, DnD
 * sortable, packing suggest, gán shipper). SF-7 chỉ để entry modal theo
 * context pack boundary ("KHÔNG D1b CreateBatchingModal thật — bạn để
 * placeholder modal entry").
 */
import { Modal } from "antd";
import { Result } from "antd";
import { useTranslation } from "react-i18next";

export interface CreateBatchModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateBatchModal({ open, onClose }: CreateBatchModalProps) {
  const { t } = useTranslation("orders");
  return (
    <Modal title={t("createBatch.title")} open={open} onCancel={onClose} footer={null} width={720}>
      <Result status="info" title={t("createBatch.placeholder")} />
    </Modal>
  );
}
