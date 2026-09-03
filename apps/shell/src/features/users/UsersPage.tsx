/**
 * SF-8 — Users management (Manager-only). antd4 sạch. Data qua RTKQ slice users.
 * testids: users-page, users-table, users-add-button, users-add-modal,
 * user-row-<username>, user-toggle-<username>, user-set-password-<username>.
 */
import { useState, type HTMLAttributes } from "react";
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
import { ROLES, useHotkeys } from "@hub-store/shared";

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

  // SF-21 D5 — F6 mở modal tạo; khi modal mở: F4 submit / F8 đóng
  // (helper modal T10 đọc registry theo contextId 'users-page').
  useHotkeys(
    "users-page",
    t("users.title"),
    addOpen
      ? [
          { key: "F4", handler: () => void submitAdd(), description: t("users.form.submit") },
          { key: "F8", handler: () => setAddOpen(false), description: t("users.form.cancel") },
        ]
      : [{ key: "F6", handler: () => setAddOpen(true), description: t("users.add") }],
  );

  const columns: ColumnsType<UserListItem> = [
    { title: t("users.column.username"), dataIndex: "username" },
    {
      title: t("users.column.enabled"),
      dataIndex: "enabled",
      render: (enabled: boolean) =>
        enabled ? (
          <Tag color="green">{t("users.enabled")}</Tag>
        ) : (
          <Tag color="red">{t("users.disabled")}</Tag>
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
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
          data-testid="users-add-button"
        >
          {t("users.add")}
        </Button>
        <div data-testid="users-table">
          <Table
            rowKey="id"
            size="middle"
            loading={isLoading}
            dataSource={users}
            columns={columns}
            onRow={(record): HTMLAttributes<HTMLTableRowElement> =>
              ({ "data-testid": `user-row-${record.username}` } as HTMLAttributes<HTMLTableRowElement>)
            }
          />
        </div>
      </Space>

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
