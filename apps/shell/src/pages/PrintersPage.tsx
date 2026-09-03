/**
 * SF-21 — Printer management (Admin-only). Pattern UsersPage (shell-local,
 * antd4 Table + add/edit modal). Data qua axios instance trực tiếp (pattern
 * printDocument — token interceptor singleton vẫn chạy; KHÔNG tạo RTKQ slice
 * cho 2 mutation + 1 query nhỏ).
 *
 * Identity (shopCode, printerId) KHÔNG sửa sau tạo (spec D9) — edit mode
 * disable 2 field đó. Duplicate (shopCode, printerId) → BFF 409 → error
 * message. testids: printers-page, printers-table, printers-add-button,
 * printers-add-modal, printer-row-<shopCode>-<printerId>,
 * printer-edit-<shopCode>-<printerId>.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Button, Form, Input, Modal, Select, Space, Table, Tag, message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ColumnsType } from "antd/es/table";
import { getAxiosInstance } from "@hub-store/api-client";
import type { PrinterDto } from "@hub-store/shared";
import { EmptyState, useHotkeys } from "@hub-store/shared";

const TYPE_OPTIONS = [
  { value: "bill", label: "Bill" },
  { value: "a4", label: "A4" },
];

interface PrinterFormValues {
  shopCode: string;
  printerId: string;
  name: string;
  location: string;
  printerIp: string;
  mac: string;
  type: "bill" | "a4";
}

export default function PrintersPage() {
  const { t } = useTranslation("shell");
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<PrinterDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [shopFilter, setShopFilter] = useState<string>("");
  const [editing, setEditing] = useState<PrinterDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PrinterFormValues>();

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const resp = await getAxiosInstance().request<{ items: PrinterDto[] }>({
        url: "/fulfillment/printers",
        method: "GET",
      });
      setItems(resp.data.items ?? []);
    } catch {
      messageApi.error(t("printers.error"));
    } finally {
      setIsLoading(false);
    }
  }, [messageApi, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const shops = Array.from(new Set(items.map((p) => p.shopCode))).sort();
  const filtered = shopFilter ? items.filter((p) => p.shopCode === shopFilter) : items;

  const openAdd = (): void => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: PrinterDto): void => {
    setEditing(record);
    form.setFieldsValue({
      shopCode: record.shopCode,
      printerId: record.printerId,
      name: record.name,
      location: record.location ?? "",
      printerIp: record.printerIp ?? "",
      mac: record.mac ?? "",
      type: record.type ?? "a4",
    });
    setModalOpen(true);
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        // PUT path là nguồn sự thật identity — body identity bị BFF bỏ qua (D9).
        await getAxiosInstance().request({
          url: `/fulfillment/printers/${encodeURIComponent(values.shopCode)}/${encodeURIComponent(values.printerId)}`,
          method: "PUT",
          data: values,
        });
        messageApi.success(t("printers.saved"));
      } else {
        await getAxiosInstance().request({
          url: "/fulfillment/printers",
          method: "POST",
          data: values,
        });
        messageApi.success(t("printers.created"));
      }
      setModalOpen(false);
      form.resetFields();
      void load();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        form.setFields([
          { name: "printerId", errors: [t("printers.duplicate")] },
        ]);
      } else {
        messageApi.error(t("printers.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  // SF-21 D5 — F6 mở modal thêm; khi modal mở: F4 lưu / F8 đóng
  // (helper modal T10 đọc registry theo contextId 'printers-page').
  useHotkeys(
    "printers-page",
    t("nav.printers"),
    modalOpen
      ? [
          { key: "F4", handler: () => void submit(), description: t("printers.form.submit") },
          { key: "F8", handler: () => setModalOpen(false), description: t("printers.form.cancel") },
        ]
      : [{ key: "F6", handler: openAdd, description: t("printers.add") }],
  );

  const columns: ColumnsType<PrinterDto> = [
    { title: t("printers.col.shop"), dataIndex: "shopCode", width: 90 },
    { title: t("printers.col.printerId"), dataIndex: "printerId", width: 160 },
    { title: t("printers.col.name"), dataIndex: "name" },
    { title: t("printers.col.location"), dataIndex: "location" },
    { title: t("printers.col.ip"), dataIndex: "printerIp", width: 140 },
    { title: t("printers.col.mac"), dataIndex: "mac", width: 180 },
    {
      title: t("printers.col.type"),
      dataIndex: "type",
      width: 90,
      render: (type: string | undefined) =>
        type ? <Tag color={type === "bill" ? "blue" : "green"}>{type === "bill" ? "Bill" : "A4"}</Tag> : "—",
    },
    {
      title: "",
      width: 90,
      render: (_, record) => (
        <Button
          size="small"
          onClick={() => openEdit(record)}
          data-testid={`printer-edit-${record.shopCode}-${record.printerId}`}
        >
          {t("printers.edit")}
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="printers-page">
      {contextHolder}
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Space wrap style={{ justifyContent: "space-between", display: "flex" }}>
          <Select
            style={{ minWidth: 200 }}
            value={shopFilter}
            onChange={setShopFilter}
            options={[
              { value: "", label: t("printers.filter.all") },
              ...shops.map((s) => ({ value: s, label: s })),
            ]}
            data-testid="printers-shop-filter"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openAdd}
            data-testid="printers-add-button"
          >
            {t("printers.add")}
          </Button>
        </Space>
        <div data-testid="printers-table">
          <Table
            rowKey={(p) => `${p.shopCode}-${p.printerId}`}
            size="middle"
            loading={isLoading}
            dataSource={filtered}
            columns={columns}
            // SF-21 T7 — shared EmptyState (spec §2) khi shop chưa có máy in,
            // CTA mở luôn modal thêm (openAdd hiện có).
            locale={{
              emptyText: (
                <EmptyState
                  title={t("printers.empty")}
                  sub={t("printers.empty.sub")}
                  actionLabel={t("printers.add")}
                  onAction={openAdd}
                />
              ),
            }}
            onRow={(record) =>
              ({ "data-testid": `printer-row-${record.shopCode}-${record.printerId}` }) as never
            }
          />
        </div>
      </Space>

      <Modal
        title={editing ? t("printers.edit") : t("printers.add")}
        open={modalOpen}
        onOk={() => void submit()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={t("printers.form.submit")}
        cancelText={t("printers.form.cancel")}
        data-testid="printers-add-modal"
      >
        <Form form={form} layout="vertical">
          <Space size={16} style={{ display: "flex" }}>
            <Form.Item
              name="shopCode"
              label={t("printers.form.shop")}
              rules={[{ required: true }]}
            >
              <Input autoComplete="off" disabled={editing !== null} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="printerId"
              label={t("printers.form.printerId")}
              rules={[{ required: true }]}
            >
              <Input autoComplete="off" disabled={editing !== null} style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Form.Item name="name" label={t("printers.form.name")}>
            <Input autoComplete="off" />
          </Form.Item>
          <Space size={16} style={{ display: "flex" }}>
            <Form.Item name="location" label={t("printers.form.location")}>
              <Input autoComplete="off" style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="printerIp" label={t("printers.form.ip")}>
              <Input autoComplete="off" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="mac" label={t("printers.form.mac")}>
              <Input autoComplete="off" style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Form.Item name="type" label={t("printers.form.type")} rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
