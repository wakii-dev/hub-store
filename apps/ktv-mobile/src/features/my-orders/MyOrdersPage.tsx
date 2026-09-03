import { useTranslation } from "react-i18next";
import { DESIGN_TOKENS } from "@hub-store/shared";
import type { MobileSession } from "../../auth/oidc";

/**
 * Placeholder "Đơn của tôi" (T3) — Task 4 nạp danh sách đơn hôm nay vào đây
 * (2 tabs Lắp đặt/Giao hàng + OrderCard theo flags BE).
 */
export default function MyOrdersPage(props: { session: MobileSession }) {
  const { t } = useTranslation("ktvMobile");
  return (
    <div style={{ padding: 16 }} data-testid="ktv-my-orders">
      <h1 style={{ margin: "0 0 4px", color: DESIGN_TOKENS.color.textStrong }}>
        {t("myorders.title")}
      </h1>
      <p style={{ margin: 0, color: DESIGN_TOKENS.color.textSecondary }}>
        {t("myorders.greeting", { name: props.session.name ?? props.session.sub })}
      </p>
      <p style={{ marginTop: 24, color: DESIGN_TOKENS.color.textMuted }}>
        {t("myorders.placeholder")}
      </p>
    </div>
  );
}
