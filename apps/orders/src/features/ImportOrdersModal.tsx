/**
 * ImportOrdersModal — D1 "Nhập đơn" (SF-13): import file csv/xlsx.
 *
 * Bước 1 — Upload.Dragger (beforeUpload return false — KHÔNG auto upload);
 * nút "Tải template" (GET /orders/import/template blob → anchor saveAs).
 * Bước 2 — chọn file → POST /orders/import/preview (FormData) → bảng preview:
 * tổng dòng hợp lệ (xanh) + các dòng lỗi đỏ kèm {row, column, message}.
 * Confirm disable khi còn lỗi → confirmImport → success message + codes
 * (invalidate Fulfillment LIST trong slice).
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Space, Table, Upload, message } from "antd";
import { useTranslation } from "react-i18next";
import {
  getAxiosInstance,
  useConfirmImportMutation,
  usePreviewImportMutation,
} from "@hub-store/api-client";
import type { ImportErrorDto, ImportPreviewResponse } from "@hub-store/shared";
import { trackEvent } from "@hub-store/shared"; // SF-23 T7

interface ErrorRow extends ImportErrorDto {
  key: string;
}

export interface ImportOrdersModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportOrdersModal({ open, onClose }: ImportOrdersModalProps) {
  const { t } = useTranslation("orders");
  const [preview, { isLoading: previewing }] = usePreviewImportMutation();
  const [confirmImport, { isLoading: confirming }] = useConfirmImportMutation();

  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset state khi đóng (modal luôn mounted ở D1Page — destroyOnClose chỉ
  // tháo DOM, state của component này phải tự clear).
  useEffect(() => {
    if (!open) {
      setFileName(null);
      setPreviewData(null);
      setPreviewError(null);
    }
  }, [open]);

  const runPreview = async (file: File) => {
    setPreviewError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = (await preview(fd).unwrap()) as ImportPreviewResponse;
      setPreviewData(res);
      setFileName(file.name);
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setPreviewError(data?.message ?? t("intake.import.previewError"));
    }
  };

  const handleDownloadTemplate = async () => {
    const res = await getAxiosInstance().get("/orders/import/template", {
      responseType: "blob",
    });
    const blob = res.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "order-import-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (!previewData || previewData.errors.length > 0) return;
    try {
      const res = (await confirmImport({ orders: previewData.valid }).unwrap()) as {
        fulfillCodes: string[];
      };
      const codes = res.fulfillCodes ?? [];
      trackEvent("orders_imported", { count: codes.length }); // SF-23 T7
      message.success(
        t("intake.import.confirmSuccess", { count: codes.length, codes: codes.join(", ") }),
      );
      onClose();
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      message.error(data?.message ?? t("intake.import.confirmError"));
    }
  };

  const errorRows: ErrorRow[] = useMemo(
    () => (previewData?.errors ?? []).map((e) => ({ ...e, key: `${e.row}-${e.column}` })),
    [previewData],
  );

  const hasErrors = errorRows.length > 0;

  const columns = [
    { title: t("intake.import.col.row"), dataIndex: "row", key: "row", width: 80 },
    { title: t("intake.import.col.column"), dataIndex: "column", key: "column", width: 160 },
    { title: t("intake.import.col.message"), dataIndex: "message", key: "message" },
  ];

  return (
    <Modal
      title={t("intake.import.title")}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnClose
      data-testid="import-orders-modal"
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Upload.Dragger
          accept=".csv,.xlsx,.xls"
          multiple={false}
          showUploadList={false}
          beforeUpload={(file) => {
            void runPreview(file);
            return false;
          }}
          disabled={previewing || confirming}
        >
          <p className="ant-upload-text" data-testid="import-dragger-text">
            {t("intake.import.dragger")}
          </p>
          {fileName && <p className="ant-upload-hint">{fileName}</p>}
        </Upload.Dragger>

        <Button onClick={() => void handleDownloadTemplate()} data-testid="download-template">
          {t("intake.import.downloadTemplate")}
        </Button>

        {previewError && (
          <p style={{ color: "#cf1322" }} data-testid="import-preview-error">
            {previewError}
          </p>
        )}

        {previewData && (
          <div data-testid="import-preview">
            <p style={{ color: "#389e0d" }} data-testid="import-valid-count">
              ✓ {t("intake.import.validCount", { count: previewData.valid.length })}
            </p>
            {hasErrors && (
              <Table<ErrorRow>
                size="small"
                columns={columns}
                dataSource={errorRows}
                pagination={false}
                rowClassName={() => "import-error-row"}
                onRow={(record) =>
                  ({ "data-testid": `import-error-row-${record.row}` }) as Record<string, unknown>
                }
              />
            )}
          </div>
        )}

        <Space>
          <Button onClick={onClose} data-testid="import-cancel">
            {t("intake.import.cancel")}
          </Button>
          <Button
            type="primary"
            disabled={!previewData || hasErrors}
            loading={confirming}
            onClick={() => void handleConfirm()}
            data-testid="import-confirm"
          >
            {t("intake.import.confirm")}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}
