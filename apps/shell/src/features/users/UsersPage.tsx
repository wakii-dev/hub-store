/**
 * SF-8 — Users management (Manager-only). antd4 sạch. Data qua RTKQ slice users.
 * SF-11 (FI-256, Task 4): reskin 100% design system SF-6 — page-head + table card
 * + semantic status tags (pattern AuditPage/D1Page). Logic/API/testid giữ nguyên.
 * testids: users-page, users-table, users-add-button, users-add-modal,
 * user-row-<username>, user-toggle-<username>, user-set-password-<username>.
 */
import { useState, type CSSProperties, type HTMLAttributes } from "react";
import {
  Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { ColumnsType } from "antd/es/table";
import {
  useCreateUserMutation,
  useListUsersQuery,
  useSetUserEnabledMutation,
  useSetUserPasswordMutation,
  type UserListItem,
} from "@hub-store/api-client";
import { DESIGN_TOKENS, ROLES, TableSkeleton, EmptyState } from "@hub-store/shared";

/** Semantic tag SF-6 §1.1 — pastel bg + line + solid text, pill (class sf6-status-tag). */
function statusTagStyle(tone: "success" | "neutral"): CSSProperties {
  const s = DESIGN_TOKENS.color.status;
  if (tone === "success") {
    return {
      color: s.success,
      background: s.successBg,
      borderColor: s.successLine,
    };
  }
  return { color: s.neutral, background: s.neutralBg, borderColor: s.neutralLine };
}

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r }));

export default function UsersPage(props: { currentUsername: string }) {
  const { t } = useTranslation("shell");
  const [messageApi, contextHolder] = message.useMessage();
  const { data, isLoading } = useListUsersQuery();
  const [createUser, { isLoading: creating }] = useCreateUserMutation();
  const [setPassword] = useSetUserPasswordMutation();
  const [setEnabled] = useSetUserEnabledMutation();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm<{ username: string; password: string; role: string }>();
  const [pwTarget, setPwTarget] = useState<{ id: string; username: string } | null>(null);
  const [pwForm] = Form.useForm<{ password: string }>();

  const users = data?.items ?? [];

  const submitAdd = async (): Promise<void> => {
    const values = await addForm.validateFields();
    try {
      await createUser(values).unwrap();
      messageApi.success(t("users.created"));
      setAddOpen(false);
      addForm.resetFields();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 422) {
        addForm.setFields([{ name: "username", errors: [t("users.error")] }]);
      } else {
        messageApi.error(t("users.error"));
      }
    }
  };

  const submitPassword = async (): Promise<void> => {
    if (!pwTarget) return;
    const values = await pwForm.validateFields();
    try {
      await setPassword({ userId: pwTarget.id, password: values.password }).unwrap();
      messageApi.success(t("users.passwordchanged"));
      setPwTarget(null);
      pwForm.resetFields();
    } catch {
      messageApi.error(t("users.error"));
    }
  };

  const toggle = async (id: string, username: string, enabled: boolean): Promise<void> => {
    if (username === props.currentUsername && !enabled) return; // self-lock UI (BFF cũng chặn)
    try {
      await setEnabled({ userId: id, enabled }).unwrap();
      messageApi.success(t("users.statuschanged"));
    } catch {
      messageApi.error(t("users.error"));
    }
  };

  const columns: ColumnsType<UserListItem> = [
    { title: t("users.column.username"), dataIndex: "username" },
    {
      title: t("users.column.enabled"),
      dataIndex: "enabled",
      render: (enabled: boolean) =>
        enabled ? (
          <Tag className="sf6-status-tag" style={statusTagStyle("success")}>
            {t("users.enabled")}
          </Tag>
        ) : (
          <Tag className="sf6-status-tag" style={statusTagStyle("neutral")}>
            {t("users.disabled")}
          </Tag>
        ),
    },
    {
      title: t("users.column.roles"),
      dataIndex: "roles",
      render: (roles: string[]) =>
        roles.length > 0 ? roles.map((r) => <Tag key={r}>{r}</Tag>) : "—",
    },
    {
      title: t("users.column.actions"),
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setPwTarget({ id: record.id, username: record.username });
              pwForm.resetFields();
            }}
            data-testid={`user-set-password-${record.username}`}
          >
            {t("users.setpassword")}
          </Button>
          {record.enabled ? (
            <Popconfirm
              title={`${t("users.toggle.disable")}: ${record.username}`}
              onConfirm={() => void toggle(record.id, record.username, false)}
              disabled={record.username === props.currentUsername}
            >
              <Button
                size="small"
                danger
                disabled={record.username === props.currentUsername}
                data-testid={`user-toggle-${record.username}`}
              >
                {t("users.toggle.disable")}
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              onClick={() => void toggle(record.id, record.username, true)}
              data-testid={`user-toggle-${record.username}`}
            >
              {t("users.toggle.enable")}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="users-page">
      {contextHolder}
      {/* Page-head — SF-6 §2.2: h1 21/700 trái + nút chính phải (mirror D1). */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            fontSize: DESIGN_TOKENS.typography.h1.fontSize,
            fontWeight: DESIGN_TOKENS.typography.h1.fontWeight,
            letterSpacing: DESIGN_TOKENS.typography.h1.letterSpacing,
            color: DESIGN_TOKENS.color.textStrong,
            margin: 0,
          }}
        >
          {t("users.title")}
        </h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
          data-testid="users-add-button"
        >
          {t("users.add")}
        </Button>
      </div>

      {/* Table card — SF-6 §2.2: radius 16, border, shadow.sm (pattern AuditPage/D1).
          SF-11 (FI-256, Task 5): initial load → TableSkeleton (không spinner); list rỗng → EmptyState. */}
      <div
        data-testid="users-table"
        style={{
          background: DESIGN_TOKENS.color.bgWhite,
          border: `1px solid ${DESIGN_TOKENS.color.divider}`,
          borderRadius: DESIGN_TOKENS.radius.card,
          boxShadow: DESIGN_TOKENS.shadow.sm,
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <TableSkeleton />
        ) : users.length === 0 ? (
          <EmptyState
            title={t("users.empty")}
            sub={t("users.emptyHint")}
            actionLabel={t("users.add")}
            onAction={() => setAddOpen(true)}
          />
        ) : (
          <Table
            rowKey="id"
            size="middle"
            dataSource={users}
            columns={columns}
            onRow={(record): HTMLAttributes<HTMLTableRowElement> =>
              ({ "data-testid": `user-row-${record.username}` } as HTMLAttributes<HTMLTableRowElement>)
            }
          />
        )}
      </div>

      <Modal
        title={t("users.add")}
        open={addOpen}
        onOk={() => void submitAdd()}
        onCancel={() => setAddOpen(false)}
        confirmLoading={creating}
        okText={t("users.form.submit")}
        cancelText={t("users.form.cancel")}
        data-testid="users-add-modal"
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="username"
            label={t("users.form.username")}
            rules={[
              { required: true },
              { pattern: /^[a-zA-Z0-9._-]{3,64}$/, message: t("users.form.usernameHint") },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("users.form.password")}
            rules={[{ required: true }, { min: 8 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label={t("users.form.role")} rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("users.setpassword.title")}
        open={pwTarget !== null}
        onOk={() => void submitPassword()}
        onCancel={() => setPwTarget(null)}
        okText={t("users.setpassword.submit")}
        cancelText={t("users.form.cancel")}
      >
        <Form form={pwForm} layout="vertical">
          <Form.Item
            name="password"
            label={t("users.form.password")}
            rules={[{ required: true }, { min: 8 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
