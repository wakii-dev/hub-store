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
  const internalBase = stripSlash(env.OIDC_JWKS_URL ?? issuerBase);
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
      adminBaseUrl: `${stripSlash(internalBase)}/admin${KC_REALM_PATH}`,
      adminTokenUrl: `${stripSlash(internalBase)}/realms/master/protocol/openid-connect/token`,
      adminUsername: env.KEYCLOAK_ADMIN ?? 'admin',
      adminPassword: env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    },
    corsOrigins: env.BFF_CORS_ORIGINS
      ? env.BFF_CORS_ORIGINS.split(',').map((o) => o.trim())
      : DEFAULT_CORS_ORIGINS,
    grpc: {
      fulfillment: grpcAddr(env.GRPC_FULFILLMENT, '50051'),
      batching: grpcAddr(env.GRPC_BATCHING, '50052'),
      deliverybatch: grpcAddr(env.GRPC_BATCHING, '50052'),
      print: grpcAddr(env.GRPC_PRINT, '50053'),
      deadlineMs: Number(env.BFF_GRPC_DEADLINE_MS ?? 5000),
    },
    devResetPassword: env.ENABLE_DEV_RESET_PASSWORD === '1',
    kafka: {
      enabled: env.KAFKA_ENABLED === 'true', // 'true' duy nhất — thống nhất Go/Java/e2e (review SF-27)
      bootstrapServers: env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:9092',
    },
  };
}
