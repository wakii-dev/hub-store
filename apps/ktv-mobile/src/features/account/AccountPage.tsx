import { Button, Descriptions } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { DESIGN_TOKENS } from "@hub-store/shared";
import type { MobileSession } from "../../auth/oidc";

/**
 * Tài khoản (spec §4.1 — plan-critic P0): user info (username, tên, role)
 * + nút Đăng xuất → signoutRedirect (Keycloak end-session → về origin).
 */
export default function AccountPage(props: {
  session: MobileSession;
  onSignOut: () => void;
}) {
  const { t } = useTranslation("ktvMobile");
  return (
    <div style={{ padding: 16 }} data-testid="ktv-account">
      <h2 style={{ margin: "0 0 16px", color: DESIGN_TOKENS.color.textStrong }}>
        {t("account.title")}
      </h2>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label={t("account.username")}>
          {props.session.sub}
        </Descriptions.Item>
        <Descriptions.Item label={t("account.name")}>
          {props.session.name ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label={t("account.role")}>
          {t(`role.${props.session.role}`)}
        </Descriptions.Item>
      </Descriptions>
      <Button
        block
        type="primary"
        danger
        icon={<LogoutOutlined />}
        onClick={props.onSignOut}
        style={{ marginTop: 24 }}
      >
        {t("account.logout")}
      </Button>
    </div>
  );
}
