/**
 * BFF config — env-driven (spec §3.9: JWT_DEV_SECRET từ root .env, MỘT chỗ
 * mọi process cùng đọc). Values mặc định khớp root .env (dev-only).
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
  /** Host:port của print-service (Python, mặc định localhost:50053). */
  print: string;
  /** Deadline mỗi gRPC upstream call — spec §3.1 resilience (mặc định 5000ms). */
  deadlineMs: number;
}

export interface BffConfig {
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  grpc: BffGrpcConfig;
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
  const jwtSecret = env.JWT_DEV_SECRET;
  if (!jwtSecret) {
    throw new Error(
      '[bff-gateway] Missing JWT_DEV_SECRET — set it in root .env (spec §3.9).',
    );
  }
  const grpcAddr = (portEnv: string | undefined, defaultPort: string): string => {
    const raw = portEnv ?? defaultPort;
    return raw.includes(':') ? raw : `localhost:${raw}`;
  };
  return {
    port: Number(env.PORT_BFF ?? 8080),
    jwtSecret,
    corsOrigins: env.BFF_CORS_ORIGINS
      ? env.BFF_CORS_ORIGINS.split(',').map((o) => o.trim())
      : DEFAULT_CORS_ORIGINS,
    grpc: {
      fulfillment: grpcAddr(env.GRPC_FULFILLMENT, '50051'),
      batching: grpcAddr(env.GRPC_BATCHING, '50052'),
      print: grpcAddr(env.GRPC_PRINT, '50053'),
      deadlineMs: Number(env.BFF_GRPC_DEADLINE_MS ?? 5000),
    },
  };
}
