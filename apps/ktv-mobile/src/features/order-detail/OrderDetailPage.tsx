/**
 * OrderDetailPage — STUB T4 (route /order/:code cho OrderCard tap-through).
 * Task 7 (order-detail-map-tel) thay bằng trang thật: timeline + MapView
 * deep-link + tel:. Ở đây chỉ render code + nút quay lại để navigation
 * không rơi vào catch-all `*` (Navigate to /) khi T4 verify flow.
 */
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "antd";
import { DESIGN_TOKENS } from "@hub-store/shared";

export default function OrderDetailPage() {
  const { t } = useTranslation("ktvMobile");
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  return (
    <div style={{ padding: 16 }} data-testid="ktv-order-detail">
      <Button
        type="link"
        onClick={() => void navigate(-1)}
        style={{ paddingLeft: 0, color: DESIGN_TOKENS.color.primary }}
        data-testid="ktv-detail-back"
      >
        {t("myorders.detail.back")}
      </Button>
      <h2 style={{ margin: "8px 0", color: DESIGN_TOKENS.color.textStrong }}>{code}</h2>
      <p style={{ color: DESIGN_TOKENS.color.textMuted }}>{t("myorders.detail.pending")}</p>
    </div>
  );
}
