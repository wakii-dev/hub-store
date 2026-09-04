/**
 * CreateOrderModal — D1 "Tạo đơn" (SF-13): tạo đơn tay qua POST /orders.
 *
 * - Form: khách (tên/SĐT/địa chỉ) + Form.List sản phẩm {productCode, productName,
 *   quantity} + codAmount + shopHint (Select từ GET /master-data/shops).
 * - Submit → createManualOrder (invalidate Fulfillment LIST trong slice) →
 *   message.success + onClose. Lỗi → message.error từ envelope, modal GIỮ state.
 */
import { useMemo } from "react";
import { Button, Form, Input, InputNumber, Modal, Select, Space, message } from "antd";
import { useTranslation } from "react-i18next";
import { useCreateManualOrderMutation, useGetShopsQuery } from "@hub-store/api-client";
import { trackEvent, useHotkeys, type IntakeOrderDto, type Product, type ShopsResponse } from "@hub-store/shared"; // SF-23 T7 + SF-21 D5

interface ItemRow {
  productCode: string;
  productName: string;
  quantity: number;
}

interface CreateOrderFormValues {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: ItemRow[];
  codAmount?: number;
  shopHint?: string;
}

export interface CreateOrderModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateOrderModal({ open, onClose }: CreateOrderModalProps) {
  const { t } = useTranslation("orders");
  const [form] = Form.useForm<CreateOrderFormValues>();
  const [createManualOrder, { isLoading: creating }] = useCreateManualOrderMutation();

  const { data: shopsData } = useGetShopsQuery();
  const shopOptions = useMemo(
    () =>
      ((shopsData as ShopsResponse | undefined)?.items ?? []).map((s) => ({
        label: `${s.shopName} (${s.shopCode})`,
        value: s.shopCode,
      })),
    [shopsData],
  );

  const handleFinish = async (values: CreateOrderFormValues) => {
    const items = (values.items ?? []).filter((i) => i.productCode);
    const payload: IntakeOrderDto = {
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      customerAddress: values.customerAddress,
      items: items as Product[],
      quantity: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
      codAmount: Number(values.codAmount) || 0,
      shopHint: values.shopHint || undefined,
    };
    try {
      await createManualOrder(payload).unwrap();
      message.success(t("intake.createOrder.success"));
      trackEvent("order_created"); // SF-23 T7
      form.resetFields();
      onClose();
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      message.error(data?.message ?? t("intake.createOrder.error"));
    }
  };

  // SF-21 D5 — khi modal mở: F4 submit / F8 cancel
  // (helper modal T10 đọc registry theo contextId 'order-create-modal').
  useHotkeys(
    "order-create-modal",
    t("intake.createOrder.title"),
    open
      ? [
          { key: "F4", handler: () => form.submit(), description: t("intake.createOrder.submit") },
          { key: "F8", handler: onClose, description: t("intake.createOrder.cancel") },
        ]
      : [],
  );

  return (
    <Modal
      title={t("intake.createOrder.title")}
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      {/* testid trên div content (pattern TransferHubModal) — đặt trên <Modal>
          thì antd4 spread lên .ant-modal-root (height 0 → Playwright xem là
          hidden, baseline FI-281 test 30 đỏ). */}
      <div data-testid="create-order-modal">
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleFinish(values)}
        initialValues={{ items: [{}] }}
      >
        <Form.Item
          name="customerName"
          label={t("intake.createOrder.customerName")}
          rules={[{ required: true }]}
        >
          <Input data-testid="create-order-customer-name" />
        </Form.Item>
        <Form.Item
          name="customerPhone"
          label={t("intake.createOrder.customerPhone")}
          rules={[
            { required: true },
            // SF-3 (FI-283): mirror rule backend IntakeValidator.PHONE — trước
            // đây FE chỉ check required, phone sai format vẫn submit rồi báo
            // lỗi server với message sai ngữ cảnh ("Import có 1 dòng lỗi").
            {
              pattern: /^(\+84|0)\d{9}$/,
              message: t("intake.createOrder.customerPhoneInvalid"),
            },
          ]}
        >
          <Input data-testid="create-order-customer-phone" />
        </Form.Item>
        <Form.Item
          name="customerAddress"
          label={t("intake.createOrder.customerAddress")}
          rules={[{ required: true }]}
        >
          <Input data-testid="create-order-customer-address" />
        </Form.Item>

        <Form.Item label={t("intake.createOrder.items")}>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 4 }}>
                    <Form.Item
                      name={[field.name, "productCode"]}
                      fieldKey={[(field.fieldKey ?? field.name), "productCode"]}
                      rules={[{ required: true }]}
                      noStyle
                    >
                      <Input
                        placeholder={t("intake.createOrder.productCode")}
                        style={{ width: 130 }}
                        data-testid={`create-order-item-code-${field.name}`}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "productName"]}
                      fieldKey={[(field.fieldKey ?? field.name), "productName"]}
                      rules={[{ required: true }]}
                      noStyle
                    >
                      <Input
                        placeholder={t("intake.createOrder.productName")}
                        style={{ width: 220 }}
                        data-testid={`create-order-item-name-${field.name}`}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "quantity"]}
                      fieldKey={[(field.fieldKey ?? field.name), "quantity"]}
                      rules={[{ required: true }]}
                      noStyle
                    >
                      <InputNumber
                        min={1}
                        placeholder={t("intake.createOrder.quantity")}
                        style={{ width: 90 }}
                        data-testid={`create-order-item-qty-${field.name}`}
                      />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => remove(field.name)}
                        data-testid={`create-order-item-remove-${field.name}`}
                      >
                        {t("intake.createOrder.removeItem")}
                      </Button>
                    )}
                  </Space>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  onClick={() => add()}
                  data-testid="create-order-add-item"
                >
                  {t("intake.createOrder.addItem")}
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item
          name="codAmount"
          label={t("intake.createOrder.codAmount")}
          rules={[{ required: true }]}
        >
          <InputNumber
            min={0}
            style={{ width: "100%" }}
            data-testid="create-order-cod-amount"
          />
        </Form.Item>
        <Form.Item name="shopHint" label={t("intake.createOrder.shopHint")}>
          <Select
            allowClear
            options={shopOptions}
            placeholder={t("intake.createOrder.shopHintPlaceholder")}
            showSearch
            optionFilterProp="label"
            data-testid="create-order-shop-hint"
          />
        </Form.Item>

        <Space>
          <Button onClick={onClose} data-testid="create-order-cancel">
            {t("intake.createOrder.cancel")}
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={creating}
            data-testid="create-order-submit"
          >
            {t("intake.createOrder.submit")}
          </Button>
        </Space>
      </Form>
      </div>
    </Modal>
  );
}
