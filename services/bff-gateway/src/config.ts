/**
 * BFF config — env-driven (SF-4: OIDC JWKS từ root .env / compose env, MỘT chỗ
 * mọi process cùng đọc). Values mặc định khớp root .env (dev-only).
 *
 * OIDC realm derive: env SF-1 wire giá trị BASE (OIDC_ISSUER=http://localhost:8081,
 * OIDC_JWKS_URL=http://keycloak:8081 trong compose) — realm `hubstore` do SF-4
 * sở hữu nên path `/realms/hubstore` được derive tại đây, KHÔNG sửa compose.
 * JWT_DEV_SECRET không còn dùng cho verify (JWKS RS256 thay HS256).
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Root .env: config.ts nằm ở services/bff-gateway/src/ — resolve từ FILE path
// (config.ts) nên cần 4 cấp: src → bff-gateway → services → root.
// KHÔNG override biến đã có trong process.env (test/CI set trước khi import).
loadDotenv({ path: resolve(fileURLToPath(import.meta.url), '../../../../.env') });

export const SERVICE_NAMES = {
  fulfillment: 'fulfillment-service',
  batching: 'batching-service',
  print: 'print-service',
  // SF-13: IntakeService chạy TRONG fulfillment-service (Java) — tên riêng cho
  // error envelope 503 để phân biệt nhóm RPC intake khi degrade.
  intake: 'intake-service',
} as const;

export interface BffGrpcConfig {
  /** Host:port của fulfillment-service (Java, mặc định localhost:50051). */
  fulfillment: string;
  /** Host:port của batching-service (Go, mặc định localhost:50052). */
  batching: string;
  /**
   * Host:port của DeliveryBatchService (SF-15) — cùng process batching-service
   * nên mặc định đọc cùng GRPC_BATCHING; tách field để test inject mock độc lập.
   */
  deliverybatch: string;
  /** Host:port của print-service (Python, mặc định localhost:50053). */
  print: string;
  /**
   * Host:port của IntakeService (SF-13) — cùng process fulfillment-service
   * Java nên mặc định CÙNG :50051 (GRPC_INTAKE override được).
   */
  intake: string;
  /** Deadline mỗi gRPC upstream call — spec §3.1 resilience (mặc định 5000ms). */
  deadlineMs: number;
}

export const KC_REALM = 'hubstore';
const KC_REALM_PATH = `/realms/${KC_REALM}`;

export interface BffOidcConfig {
  /** Issuer ĐẦY ĐỦ (base + /realms/hubstore) — khớp claim iss của token. */
  issuer: string;
  /** Audience khớp mapper trong hubstore-realm.json. */
  audience: string;
  /** URL JWKS đầy đủ (trong network compose = http://keycloak:8081/...). */
  jwksUrl: string;
  /** Realm base cho Keycloak Admin API (${adminBaseUrl}/users...). */
  adminBaseUrl: string;
  /** Base URL realm master — lấy admin token (password grant, admin-cli). */
  adminTokenUrl: string;
  /** Admin credential — env KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD (dev default 'admin'). */
  adminUsername: string;
  adminPassword: string;
  /** SF-8 — token endpoint realm hubstore cho client-credential grant. */
  kcAdminTokenUrl: string;
  /** SF-8 — service-account client gọi KC Admin API (env KC_ADMIN_CLIENT_ID). */
  kcAdminClientId: string;
  /** SF-8 — secret; rỗng → users routes trả 503 KC_ADMIN_NOT_CONFIGURED (không crash boot). */
  kcAdminClientSecret: string;
}

export interface BffConfig {
  port: number;
  oidc: BffOidcConfig;
  corsOrigins: string[];
  grpc: BffGrpcConfig;
  /**
   * DEV-ONLY — enable route /auth/reset-password (không xác minh danh tính).
   * Fail-safe: CHỈ bật khi ENABLE_DEV_RESET_PASSWORD=1 tường minh — build/prod
   * không set flag thì endpoint KHÔNG tồn tại (404), không phụ thuộc README.
   */
  devResetPassword: boolean;
  /** SF-27 — Kafka side-channel consumer. */
  kafka: BffKafkaConfig;
  /** SF-23 — OneSignal REST push (dual-mode). */
  onesignal: BffOnesignalConfig;
  /** SF-26 — HMAC secret cho webhook sàn (rỗng → 503 fail-closed). */
  webhookHmacSecret: string;
  /**
   * SF-26 — raw WEBHOOK_MAPPING env (JSON flat rename map canonical→payload
   * field). Parse ở lib/webhook-mapping (Task 4) — invalid JSON → warn + default.
   */
  webhookMapping: string;
  /**
   * SF-12 (FI-257) — machine-call credential cho gRPC call không user JWT
   * (webhook sàn → CreateWebhookOrder). Rỗng → interceptor sẽ DENY (fail-closed).
   * Compose wiring env INTERNAL_SERVICE_TOKEN — Task 2 sở hữu.
   */
  internalServiceToken: string;
}

export interface BffOnesignalConfig {
  /**
   * REST API key — rỗng → mock mode (sendOneSignalPush trả false ngay,
   * chỉ notification_log; KHÔNG gọi OneSignal).
   */
  restApiKey: string;
  /**
   * OneSignal App ID (BFF-side env ONESIGNAL_APP_ID — KHÔNG nhầm
   * VITE_ONESIGNAL_APP_ID build-time của FE). Thiếu → mock mode.
   */
  appId: string;
}

export interface BffKafkaConfig {
  /** false → consumer KHÔNG start (mặc định — side-channel opt-in). */
  enabled: boolean;
  bootstrapServers: string;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Nếu base chưa chứa /realms/<realm> thì append (idempotent cho giá trị đã đầy đủ). */
function withRealm(base: string): string {
  const trimmed = stripSlash(base);
  return trimmed.endsWith(KC_REALM_PATH) ? trimmed : trimmed + KC_REALM_PATH;
}

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

/**
 * Load config từ env. `env` inject được cho test.
 * GRPC_FULFILLMENT/GRPC_BATCHING/GRPC_PRINT trong root .env là PORT số —
 * client addr được ghép với localhost. Full "host:port" cũng được nhận.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BffConfig {
  const issuerBase = env.OIDC_ISSUER;
  if (!issuerBase) {
    throw new Error(
      '[bff-gateway] Missing OIDC_ISSUER — set it in root .env / compose env (SF-4).',
    );
  }
  // OIDC_JWKS_URL = base riêng cho fetch JWKS/admin TRONG network của BFF
  // (compose: http://keycloak:8081 — localhost sai trong container). Unset →
  // dùng issuer base (dev host-run).
  //
  // SF-12 live-verify (E2E sau T7): contract "FULL cho cả 3" (ci.yml) cho phép
  // OIDC_JWKS_URL là URL certs đầy đủ (…/protocol/openid-connect/certs — cùng
  // 1 env mà Go/Java interceptor đọc). withRealm() chỉ idempotent với realm
  // URL — certs URL KHÔNG: /realms/hubstore bị append vào CUỐI → jwksUrl +
  // admin* URL rác → mọi Bearer DENY (UI trắng sau login, D1 trống). Strip
  // suffix certs trước khi derive.
  const JWKS_CERTS_SUFFIX = /\/protocol\/openid-connect\/certs\/?$/;
  const internalBase = stripSlash(env.OIDC_JWKS_URL ?? issuerBase).replace(JWKS_CERTS_SUFFIX, '');
  // internalBase giờ là realm URL HOẶC host base — admin* URL cần host-only
  // origin (realm URL + /admin là path rác — gotcha ci.yml "adminBaseUrl
  // derive sai khi FULL").
  const internalOrigin = new URL(internalBase).origin;
  const grpcAddr = (portEnv: string | undefined, defaultPort: string): string => {
    const raw = portEnv ?? defaultPort;
    return raw.includes(':') ? raw : `localhost:${raw}`;
  };
  return {
    port: Number(env.PORT_BFF ?? 8080),
    oidc: {
      issuer: withRealm(issuerBase),
      audience: env.OIDC_AUDIENCE ?? 'hubstore-api',
      jwksUrl: `${withRealm(internalBase)}/protocol/openid-connect/certs`,
      // Keycloak 26 admin API nằm dưới /admin — /realms/hubstore/users (không
      // /admin) trả 404 (mock test không bắt được — đã verify Keycloak thật).
      adminBaseUrl: `${internalOrigin}/admin${KC_REALM_PATH}`,
      adminTokenUrl: `${internalOrigin}/realms/master/protocol/openid-connect/token`,
      adminUsername: env.KEYCLOAK_ADMIN ?? 'admin',
      adminPassword: env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
      kcAdminTokenUrl: `${internalOrigin}${KC_REALM_PATH}/protocol/openid-connect/token`,
      kcAdminClientId: env.KC_ADMIN_CLIENT_ID ?? 'hubstore-admin',
      kcAdminClientSecret: env.KC_ADMIN_CLIENT_SECRET ?? '',
    },
    corsOrigins: env.BFF_CORS_ORIGINS
      ? env.BFF_CORS_ORIGINS.split(',').map((o) => o.trim())
      : DEFAULT_CORS_ORIGINS,
    grpc: {
      fulfillment: grpcAddr(env.GRPC_FULFILLMENT, '50051'),
      batching: grpcAddr(env.GRPC_BATCHING, '50052'),
      deliverybatch: grpcAddr(env.GRPC_BATCHING, '50052'),
      print: grpcAddr(env.GRPC_PRINT, '50053'),
      intake: grpcAddr(env.GRPC_INTAKE, '50051'),
      deadlineMs: Number(env.BFF_GRPC_DEADLINE_MS ?? 5000),
    },
    devResetPassword: env.ENABLE_DEV_RESET_PASSWORD === '1',
    kafka: {
      enabled: env.KAFKA_ENABLED === 'true', // 'true' duy nhất — thống nhất Go/Java/e2e (review SF-27)
      bootstrapServers: env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:9092',
    },
    onesignal: {
      restApiKey: env.ONESIGNAL_REST_API_KEY ?? '',
      appId: env.ONESIGNAL_APP_ID ?? '',
    },
    // SF-26 — webhook sàn (FI-271): secret rỗng → verifyHmac 503 fail-closed.
    webhookHmacSecret: env.WEBHOOK_HMAC_SECRET ?? '',
    webhookMapping: env.WEBHOOK_MAPPING ?? '',
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN ?? '',
  };
}
