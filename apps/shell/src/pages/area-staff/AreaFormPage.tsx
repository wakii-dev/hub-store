/**
 * AreaFormPage — tạo/sửa định nghĩa NV phụ trách khu vực (SF-17 spec §8).
 * Dùng chung cho /area-staff/new (create) và /area-staff/:code/edit (update —
 * employee_code immutable nên input disabled).
 *
 * Form: chức danh Select tĩnh · mã NV + họ tên · TK nhận tiền + verify inline
 * (badge nguồn [MOCK]/ZALOPAY) · MỘT TreeSelect tỉnh→phường (treeCheckStrictly
 * — chọn node tỉnh = toàn tỉnh, node phường = phường đó; cap 100 selections tự
 * chặn trong onChange vì antd4 TreeSelect KHÔNG có maxCount).
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Tag, TreeSelect, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { sharedCssVariables } from '@hub-store/shared';
import type { RegionDto } from '@hub-store/shared';
import {
  TITLE_CODES,
  areaStaffApi,
  type ServiceEmployeePayload,
  type VerifyPaymentAccountDto,
} from '../../api/areaStaffApi';

/** antd v4: treeCheckStrictly ép value thành {value,label}[] (LabeledValue). */
interface LabeledCode {
  value: string;
  label: React.ReactNode;
}

/** Cap region_codes (spec §3: employee_code cap 100 rows qua service_employee_regions). */
const REGION_CAP = 100;
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
const ACCOUNT_PATTERN = /^\d{9,16}$/;

function buildTreeData(regions: RegionDto[]) {
  const provinces = regions.filter((r) => r.type === 'province').sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return provinces.map((p) => ({
    title: p.name,
    value: p.code,
    selectable: false,
    children: regions
      .filter((r) => r.type === 'ward' && r.parentCode === p.code)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((w) => ({ title: w.name, value: w.code })),
  }));
}

export default function AreaFormPage() {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const isEdit = Boolean(code);

  const [form] = Form.useForm();
  const [regions, setRegions] = useState<RegionDto[]>([]);
  const [verify, setVerify] = useState<VerifyPaymentAccountDto | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(isEdit);

  useEffect(() => {
    areaStaffApi.regions().then(setRegions).catch(() => message.error(t('area.error.regions')));
  }, [t]);

  // Edit mode — prefill (region labels fallback = code; sync tên thật ở effect dưới).
  useEffect(() => {
    if (!code) return;
    setLoadingEmployee(true);
    areaStaffApi
      .get(code)
      .then((emp) => {
        form.setFieldsValue({
          titleCode: emp.titleCode,
          employeeCode: emp.employeeCode,
          fullName: emp.fullName,
          paymentAccount: emp.paymentAccount,
          regionCodes: emp.regionCodes.map((c) => ({ value: c, label: c as React.ReactNode })),
        });
      })
      .catch(() => message.error(t('area.form.error.load')))
      .finally(() => setLoadingEmployee(false));
  }, [code, form, t]);

  // Sau khi regions load xong ở edit mode — thay label fallback bằng tên thật.
  useEffect(() => {
    if (!code || regions.length === 0) return;
    const current: LabeledCode[] = form.getFieldValue('regionCodes') ?? [];
    form.setFieldValue(
      'regionCodes',
      current.map((v) => {
        const r = regions.find((x) => x.code === v.value);
        return r ? { value: v.value, label: r.name } : v;
      }),
    );
  }, [code, regions, form]);

  const treeData = useMemo(() => buildTreeData(regions), [regions]);

  /** Cap 100 — chặn trong onChange (antd4 TreeSelect không có maxCount):
   *  vượt cap → warning + trả selection cũ (form value không đổi). */
  const onRegionChange = (vals: LabeledCode[]): LabeledCode[] => {
    if (vals.length > REGION_CAP) {
      message.warning(t('area.form.regions.cap'));
      return form.getFieldValue('regionCodes') ?? [];
    }
    return vals;
  };

  const selectedCodes = (): string[] =>
    ((form.getFieldValue('regionCodes') ?? []) as LabeledCode[]).map((v) => v.value);

  const runVerify = async () => {
    const account: string = form.getFieldValue('paymentAccount');
    if (!account) {
      message.warning(t('area.form.verify.needAccount'));
      return;
    }
    setVerifying(true);
    try {
      setVerify(await areaStaffApi.verifyPaymentAccount(account));
    } catch {
      message.error(t('area.form.error.save'));
    } finally {
      setVerifying(false);
    }
  };

  const submit = async (values: {
    titleCode: string;
    employeeCode: string;
    fullName: string;
    paymentAccount: string;
  }) => {
    const payload: ServiceEmployeePayload = {
      employeeCode: values.employeeCode,
      fullName: values.fullName,
      titleCode: values.titleCode,
      paymentAccount: values.paymentAccount,
      isActive: true,
      regionCodes: selectedCodes(),
    };
    setSaving(true);
    try {
      if (isEdit && code) {
        await areaStaffApi.update(code, payload);
        message.success(t('area.form.updated'));
      } else {
        await areaStaffApi.create(payload);
        message.success(t('area.form.created'));
      }
      navigate('/area-staff');
    } catch (err) {
      const envelope = (err as { response?: { data?: { message?: string } } }).response?.data;
      message.error(envelope?.message ?? t('area.form.error.save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={sharedCssVariables as React.CSSProperties}>
      <Typography.Title level={4}>
        {isEdit ? t('area.form.title.edit') : t('area.form.title.new')}
      </Typography.Title>
      <Form
        form={form}
        layout="vertical"
        style={{ maxWidth: 640 }}
        onFinish={submit}
        data-testid="area-form"
      >
        <Form.Item
          name="titleCode"
          label={t('area.form.field.titleCode')}
          rules={[{ required: true, message: t('area.form.rule.required') }]}
        >
          <Select
            options={TITLE_CODES.map((c) => ({ label: t(`area.title.${c}`), value: c }))}
            data-testid="area-form-title-code"
          />
        </Form.Item>

        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item
            name="employeeCode"
            label={t('area.form.field.code')}
            rules={[
              { required: true, message: t('area.form.rule.required') },
              { pattern: CODE_PATTERN, message: t('area.form.rule.code') },
            ]}
            style={{ width: 220 }}
          >
            <Input disabled={isEdit} data-testid="area-form-employee-code" />
          </Form.Item>
          <Form.Item
            name="fullName"
            label={t('area.form.field.fullName')}
            rules={[{ required: true, message: t('area.form.rule.required') }]}
            style={{ flex: 1, minWidth: 260 }}
          >
            <Input data-testid="area-form-full-name" />
          </Form.Item>
        </Space>

        <Form.Item
          name="paymentAccount"
          label={t('area.form.field.paymentAccount')}
          rules={[
            { required: true, message: t('area.form.rule.required') },
            { pattern: ACCOUNT_PATTERN, message: t('area.form.rule.account') },
          ]}
          extra={
            verify && (
              <span data-testid="area-verify-result">
                <Tag color={verify.source === 'MOCK' ? 'default' : 'processing'}>
                  {verify.source === 'MOCK' ? '[MOCK]' : verify.source}
                </Tag>
                <Typography.Text type={verify.valid ? 'success' : 'danger'}>
                  {verify.valid ? t('area.form.verify.valid') : t('area.form.verify.invalid')}
                </Typography.Text>
                <Typography.Text type="secondary"> — {verify.message}</Typography.Text>
              </span>
            )
          }
          style={{ maxWidth: 380 }}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input data-testid="area-form-payment-account" />
            <Button loading={verifying} onClick={runVerify} data-testid="area-verify-btn">
              {t('area.form.verify')}
            </Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item
          label={t('area.form.field.regions')}
          required
          name="regionCodes"
          getValueFromEvent={(vals: LabeledCode[]) => onRegionChange(vals)}
        >
          <TreeSelect
            treeData={treeData}
            treeCheckable
            treeCheckStrictly
            showCheckedStrategy={TreeSelect.SHOW_ALL}
            treeDefaultExpandAll={false}
            placeholder={t('area.form.field.regions')}
            notFoundContent={loadingEmployee ? null : undefined}
            style={{ width: '100%' }}
            maxTagCount={8}
            data-testid="area-form-regions"
          />
        </Form.Item>

        <Space>
          <Button type="primary" htmlType="submit" loading={saving} data-testid="area-form-submit">
            {t('area.form.submit')}
          </Button>
          <Button onClick={() => navigate('/area-staff')}>{t('area.form.cancel')}</Button>
        </Space>
      </Form>
    </Card>
  );
}
