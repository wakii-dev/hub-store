/**
 * Contract harness: mock 3 gRPC upstreams bằng grpc-js servers gen từ proto
 * (Task 8), boot BFF app thật (buildApp) + fastify.inject (không cần listen).
 * Per-test fail injection: override(handler) thay handler — trả
 * UNAVAILABLE/DEADLINE/INVALID_ARGUMENT + metadata x-error-details tùy ý.
 */
import { Server, ServerCredentials, status } from '@grpc/grpc-js';
import { Metadata } from '@grpc/grpc-js';
import type {
  ServiceError,
  ServerUnaryCall,
  sendUnaryData,
  UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { BffConfig } from '../src/config.js';
import { fulfillmentResponses, batchingResponses, printResponses } from './fixtures.js';
import { FulfillmentServiceService } from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import { BatchingServiceService } from '../../../api/proto/gen/ts/hubstore/batching/v1/batching';
import { PrintServiceService } from '../../../api/proto/gen/ts/hubstore/print/v1/print';

export const TEST_SECRET = 'contract-harness-dev-secret';

/** ServiceError-like cho mock handler reject (đúng shape err của grpc-js). */
export function mockGrpcError(code: number, message: string, metadata?: Metadata): ServiceError {
  return Object.assign(new Error(message), {
    code,
    details: message,
    metadata: metadata ?? new Metadata(),
  });
}

/**
 * Helper fail-injection: INVALID_ARGUMENT + details per-field (metadata).
 * CONTRACT (SF-2 pin): value = encodeURIComponent(JSON) — gRPC metadata chỉ
 * nhận ASCII printable, producer percent-encode để message tiếng Việt đi được.
 */
export function invalidArgument(details: Array<{ field: string; message: string }>): ServiceError {
  const md = new Metadata();
  md.set('x-error-details', encodeURIComponent(JSON.stringify(details)));
  return mockGrpcError(status.INVALID_ARGUMENT, 'Validation failed on upstream.', md);
}

export interface MockUpstream {
  addr: string;
  close(): Promise<void>;
  /** Ghi đè handler mặc định cho từng test (fail injection). */
  override(handlers: Record<string, UnaryHandler>): void;
}

type UnaryHandler = (call: ServerUnaryCall<any, any>, cb: sendUnaryData<any>) => void;

function startMockServer(
  definition: Parameters<Server['addService']>[0],
  defaults: Record<string, UnaryHandler>,
): Promise<MockUpstream> {
  // Delegation indirection — addService copy handler vào internal map, nên
  // override phải swap qua `current` (server vẫn thấy handler mới).
  const current: Record<string, UnaryHandler> = { ...defaults };
  const delegating: UntypedServiceImplementation = {};
  for (const name of Object.keys(current)) {
    delegating[name] = ((call: ServerUnaryCall<any, any>, cb: sendUnaryData<any>) =>
      current[name](call, cb)) as unknown as UnaryHandler;
  }
  const server = new Server();
  server.addService(definition, delegating);
  return new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        addr: `127.0.0.1:${port}`,
        close: () => new Promise<void>((res) => server.tryShutdown(() => res())),
        override: (patch) => Object.assign(current, patch),
      });
    });
  });
}

/** HS256 fake-JWT cùng format với packages/shared auth/fake-jwt (spec §3.9). */
export async function signTestToken(role = 'ADMIN', sub = 'tester'): Promise<string> {
  const key = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(key);
}

export interface Harness {
  fulfillment: MockUpstream;
  batching: MockUpstream;
  print: MockUpstream;
  app: FastifyInstance;
  closeAll(): Promise<void>;
}

const fulfillmentDefaults: Record<string, UnaryHandler> = {
  filterOrders: (_c, cb) => cb(null, fulfillmentResponses.filterOrders),
  getOrderDetail: (_c, cb) => cb(null, fulfillmentResponses.getOrderDetail),
  assignShopHub: (_c, cb) => cb(null, { order: fulfillmentResponses.getOrderDetail.order }),
  getAssignHistory: (_c, cb) => cb(null, fulfillmentResponses.getAssignHistory),
  updateDeliveryTime: (_c, cb) => cb(null, fulfillmentResponses.getOrderDetail),
  updateNote: (_c, cb) => cb(null, fulfillmentResponses.getOrderDetail),
  listRegions: (_c, cb) => cb(null, fulfillmentResponses.listRegions),
  listDeliveryStaff: (_c, cb) => cb(null, fulfillmentResponses.listDeliveryStaff),
  listDistinctShops: (_c, cb) => cb(null, fulfillmentResponses.listDistinctShops),
  getTimeDelivery: (_c, cb) => cb(null, fulfillmentResponses.getTimeDelivery),
};

const batchingDefaults: Record<string, UnaryHandler> = {
  createBatch: (_c, cb) => cb(null, batchingResponses.createBatch),
  filterBatches: (_c, cb) => cb(null, batchingResponses.filterBatches),
  getBatchDetail: (_c, cb) => cb(null, batchingResponses.getBatchDetail),
  cancelBatch: (_c, cb) => cb(null, batchingResponses.cancelBatch),
  getBatchCriteria: (_c, cb) => cb(null, batchingResponses.getBatchCriteria),
  completePicking: (_c, cb) => cb(null, batchingResponses.completePicking),
  packingSuggest: (_c, cb) => cb(null, batchingResponses.packingSuggest),
  recalculateDistance: (_c, cb) => cb(null, batchingResponses.recalculateDistance),
};

const printDefaults: Record<string, UnaryHandler> = {
  listPrinters: (_c, cb) => cb(null, printResponses.listPrinters),
  print: (_c, cb) => cb(null, printResponses.print),
};

/** Port "chắc chắn chết": bind rồi đóng — dùng cho test 503 conn-refused. */
async function grabDeadPort(): Promise<number> {
  const s = new Server();
  const port = await new Promise<number>((resolve, reject) =>
    s.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (err, p) =>
      err ? reject(err) : resolve(p),
    ),
  );
  await new Promise<void>((res) => s.tryShutdown(() => res()));
  return port;
}

export interface HarnessOptions {
  /** Deadline ngắn để test thật đường DEADLINE_EXCEEDED mà không chậm. */
  deadlineMs?: number;
  /** Trỏ 1 upstream tới port chết — test 503 UPSTREAM_UNAVAILABLE. */
  deadUpstream?: 'fulfillment' | 'batching' | 'print';
  /** Override handler mặc định lúc boot. */
  fulfillmentHandlers?: Record<string, UnaryHandler>;
  batchingHandlers?: Record<string, UnaryHandler>;
  printHandlers?: Record<string, UnaryHandler>;
}

export async function startHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const fulfillment = await startMockServer(FulfillmentServiceService, {
    ...fulfillmentDefaults,
    ...opts.fulfillmentHandlers,
  });
  const batching = await startMockServer(BatchingServiceService, {
    ...batchingDefaults,
    ...opts.batchingHandlers,
  });
  const print = await startMockServer(PrintServiceService, {
    ...printDefaults,
    ...opts.printHandlers,
  });

  const addrs: Record<string, string> = {
    fulfillment: fulfillment.addr,
    batching: batching.addr,
    print: print.addr,
  };
  if (opts.deadUpstream) {
    addrs[opts.deadUpstream] = `127.0.0.1:${await grabDeadPort()}`;
  }

  const config: BffConfig = {
    port: 0,
    jwtSecret: TEST_SECRET,
    corsOrigins: ['http://localhost:3000'],
    grpc: {
      fulfillment: addrs.fulfillment,
      batching: addrs.batching,
      print: addrs.print,
      deadlineMs: opts.deadlineMs ?? 2000,
    },
  };
  const app = buildApp(config);

  return {
    fulfillment,
    batching,
    print,
    app,
    closeAll: async () => {
      await app.close();
      await fulfillment.close();
      await batching.close();
      await print.close();
    },
  };
}

/** Authorized inject helper — token signed bằng TEST_SECRET. */
export async function authedInject(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: Record<string, unknown>,
  role = 'ADMIN',
): Promise<{ statusCode: number; body: unknown; rawPayload: Buffer; headers: Record<string, unknown> }> {
  const token = await signTestToken(role);
  const res = await app.inject({
    method,
    url,
    ...(payload !== undefined ? { payload } : {}),
    headers: { authorization: `Bearer ${token}` },
  });
  let body: unknown = null;
  try {
    body = JSON.parse(res.payload);
  } catch {
    body = null;
  }
  return {
    statusCode: res.statusCode,
    body,
    rawPayload: res.rawPayload,
    headers: res.headers as Record<string, unknown>,
  };
}
