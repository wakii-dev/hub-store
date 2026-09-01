/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only JWT signing secret — same value as JWT_DEV_SECRET in root .env. */
  readonly VITE_JWT_DEV_SECRET?: string;
  /** OIDC production config — shell auth stub reads these; production chỉ đổi env. */
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
