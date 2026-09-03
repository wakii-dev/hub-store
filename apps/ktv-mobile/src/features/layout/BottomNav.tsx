import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DESIGN_TOKENS } from "@hub-store/shared";

/**
 * Bottom-nav 2 mục [Đơn của tôi][Tài khoản] (spec §4.1 — plan-critic P0).
 * antd 4 KHÔNG có TabBar → flex bar thuần với DESIGN_TOKENS colors +
 * safe-area-inset-bottom (iPhone home indicator).
 */
export default function BottomNav() {
  const { t } = useTranslation("ktvMobile");
  const location = useLocation();
  const navigate = useNavigate();

  const items = [
    { key: "/", label: t("nav.orders"), testid: "ktv-nav-orders" },
    { key: "/account", label: t("nav.account"), testid: "ktv-nav-account" },
  ];

  return (
    <nav
      data-testid="ktv-bottom-nav"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        display: "flex",
        background: DESIGN_TOKENS.color.bgWhite,
        borderTop: `1px solid ${DESIGN_TOKENS.color.divider}`,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        const active = location.pathname === item.key;
        return (
          <button
            key={item.key}
            type="button"
            data-testid={item.testid}
            data-active={active ? "true" : "false"}
            onClick={() => {
              if (!active) void navigate(item.key);
            }}
            style={{
              flex: 1,
              border: 0,
              background: "transparent",
              padding: "10px 0 10px",
              fontSize: 12,
              lineHeight: "20px",
              fontWeight: active ? 600 : 400,
              color: active ? DESIGN_TOKENS.color.primary : DESIGN_TOKENS.color.textSecondary,
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
