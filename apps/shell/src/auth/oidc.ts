/**
 * OIDC config — đọc từ env vars (spec §2 SF-6: "production chỉ đổi env").
 *
 * Dev: VITE_OIDC_* unset → auth stub (fake JWT, LoginPage giả lập) chạy.
 * Production: set VITE_OIDC_AUTHORITY / CLIENT_ID / REDIRECT_URI trong env
 * rồi thay auth stub bằng OIDC flow thật (authorize redirect + token
 * exchange) — các điểm nối đã pin ở đây:
 *   - token sau OIDC = Bearer cho api-client (setTokenGetter — giữ nguyên)
 *   - role từ SSO claim (Coordinator / WarehouseOps / Manager — giữ nguyên
 *     role store + PERMISSION_MATRIX §2)
 */
export interface OidcConfig {
  authority?: string;
  clientId?: string;
  redirectUri?: string;
}

export const oidcConfig: OidcConfig = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirectUri: import.meta.env.VITE_OIDC_REDIRECT_URI,
};

/** true khi env đã cấu hình OIDC thật (production); dev = false → stub mode. */
export function isOidcConfigured(): boolean {
  return Boolean(oidcConfig.authority && oidcConfig.clientId);
}
