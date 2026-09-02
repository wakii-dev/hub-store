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
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { FastifyInstance } from 'fastify';
import { createServer } from 'node:http';

/** Private key type sinh ra bởi generateKeyPair('RS256'). */
type RsaPrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
import { buildApp } from '../src/app.js';
import type { BffConfig } from '../src/config.js';
import {
  fulfillmentResponses,
  batchingResponses,
  printResponses,
  deliveryBatchResponses,
  techResponses,
} from './fixtures.js';
import { FulfillmentServiceService } from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import { TechServiceService } from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';
import { BatchingServiceService } from '../../../api/proto/gen/ts/hubstore/batching/v1/batching';
import { DeliveryBatchServiceService } from '../../../api/proto/gen/ts/hubstore/batching/v1/delivery_batch';
import { PrintServiceService } from '../../../api/proto/gen/ts/hubstore/print/v1/print';

export const TEST_ISSUER = 'https://keycloak.test/realms/hubstore';
export const TEST_AUDIENCE = 'hubstore-api';

/** Keypair + JWKS endpoint giả lập Keycloak — BFF verify JWKS thật qua HTTP. */
export interface TestIdentity {
  signToken(role: string, sub?: string): Promise<string>;
  /** Thêm jwk vào JWKS đang serve (test unknown-kid refetch). */
  addKey(jwk: Record<string, unknown>): void;
  jwksUrl: string;
  close(): Promise<void>;
}

export async function startTestIdentity(): Promise<TestIdentity> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-kid-1', alg: 'RS256', use: 'sig' };
  const keys: Record<string, unknown>[] = [jwk];
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [...keys] }));
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('jwks server bind failed');
  return {
    jwksUrl: `http://127.0.0.1:${address.port}/certs`,
    addKey: (j) => keys.push(j),
    signToken: (role, sub = 'tester') =>
      new SignJWT({
        realm_access: { roles: [role] },
        preferred_username: sub,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-kid-1' })
        .setSubject(sub)
        .setIssuer(TEST_ISSUER)
        .setAudience(TEST_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(privateKey),
    close: () => new Promise<void>((res) => httpServer.close(() => res())),
  };
}

/** Keypair thứ 2 (kid khác) — test JWKS refetch khi gặp unknown kid. */
export async function generateSecondIdentity(): Promise<{
  privateKey: RsaPrivateKey;
  jwk: Record<string, unknown>;
}> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-kid-2', alg: 'RS256', use: 'sig' };
  return { privateKey, jwk };
}

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
  /** Service phụ cùng server/addr (SF-19: TechService sống cùng fulfillment). */
  extraServices: Array<{ definition: Parameters<Server['addService']>[0]; defaults: Record<string, UnaryHandler> }> = [],
): Promise<MockUpstream> {
  // Delegation indirection — addService copy handler vào internal map, nên
  // override phải swap qua `current` (server vẫn thấy handler mới).
  const current: Record<string, UnaryHandler> = {
    ...defaults,
    ...Object.assign({}, ...extraServices.map((s) => s.defaults)),
  };
  const delegating: UntypedServiceImplementation = {};
  for (const name of Object.keys(current)) {
    delegating[name] = ((call: ServerUnaryCall<any, any>, cb: sendUnaryData<any>) =>
      current[name](call, cb)) as unknown as UnaryHandler;
  }
  const server = new Server();
  server.addService(definition, delegating);
  for (const extra of extraServices) {
    server.addService(extra.definition, delegating);
  }
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

/** RS256 token có claim Keycloak (realm_access.roles + iss/aud) — sign bằng
 * keypair của identity đang chạy (khác key → 401). */
export async function signTestToken(role = 'Manager', sub = 'tester'): Promise<string> {
  if (!currentIdentity) throw new Error('startHarness chưa chạy — không có identity');
  return currentIdentity.signToken(role, sub);
}

export interface Harness {
  fulfillment: MockUpstream;
  /** SF-19 — cùng server/addr với fulfillment (override qua chung current). */
  tech: MockUpstream;
  batching: MockUpstream;
  deliverybatch: MockUpstream;
  print: MockUpstream;
  app: FastifyInstance;
  identity: TestIdentity;
  closeAll(): Promise<void>;
}

/** Module-level — signTestToken cần keypair của identity đang chạy. */
let currentIdentity: TestIdentity | null = null;

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

const techDefaults: Record<string, UnaryHandler> = {
  filterDeliveryOrders: (_c, cb) => cb(null, techResponses.filterDeliveryOrders),
  filterInstallationOrders: (_c, cb) => cb(null, techResponses.filterInstallationOrders),
  assignTechnician: (_c, cb) => cb(null, techResponses.assignTechnician),
  suggestTechnicians: (_c, cb) => cb(null, techResponses.suggestTechnicians),
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

const deliveryBatchDefaults: Record<string, UnaryHandler> = {
  getQuotes: (_c, cb) => cb(null, deliveryBatchResponses.getQuotes),
  confirmPlanning: (_c, cb) => cb(null, deliveryBatchResponses.confirmPlanning),
  createBooking: (_c, cb) => cb(null, deliveryBatchResponses.createBooking),
  cancelDeliveryOrder: (_c, cb) => cb(null, deliveryBatchResponses.cancelDeliveryOrder),
  cancelDeliveryBatch: (_c, cb) => cb(null, deliveryBatchResponses.cancelDeliveryBatch),
  searchBookingDetail: (_c, cb) => cb(null, deliveryBatchResponses.searchBookingDetail),
  listAddonServices: (_c, cb) => cb(null, deliveryBatchResponses.listAddonServices),
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
  deadUpstream?: 'fulfillment' | 'batching' | 'deliverybatch' | 'print';
  /** Override handler mặc định lúc boot. */
  fulfillmentHandlers?: Record<string, UnaryHandler>;
  techHandlers?: Record<string, UnaryHandler>;
  batchingHandlers?: Record<string, UnaryHandler>;
  deliverybatchHandlers?: Record<string, UnaryHandler>;
  printHandlers?: Record<string, UnaryHandler>;
}

export async function startHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const identity = await startTestIdentity();
  currentIdentity = identity;
  const fulfillment = await startMockServer(
    FulfillmentServiceService,
    {
      ...fulfillmentDefaults,
      ...opts.fulfillmentHandlers,
    },
    // SF-19: TechService gRPC sống cùng fulfillment-service → chung mock server
    // (app.ts tạo tech client từ config.grpc.fulfillment). deadUpstream
    // 'fulfillment' vì vậy cũng giết tech — khớp topology thật.
    [
      {
        definition: TechServiceService,
        defaults: { ...techDefaults, ...opts.techHandlers },
      },
    ],
  );
  const tech: MockUpstream = {
    addr: fulfillment.addr,
    close: async () => {}, // đóng chung qua fulfillment.close()
    override: fulfillment.override,
  };
  const batching = await startMockServer(BatchingServiceService, {
    ...batchingDefaults,
    ...opts.batchingHandlers,
  });
  const deliverybatch = await startMockServer(DeliveryBatchServiceService, {
    ...deliveryBatchDefaults,
    ...opts.deliverybatchHandlers,
  });
  const print = await startMockServer(PrintServiceService, {
    ...printDefaults,
    ...opts.printHandlers,
  });

  const addrs: Record<string, string> = {
    fulfillment: fulfillment.addr,
    batching: batching.addr,
    deliverybatch: deliverybatch.addr,
    print: print.addr,
  };
  if (opts.deadUpstream) {
    addrs[opts.deadUpstream] = `127.0.0.1:${await grabDeadPort()}`;
  }

  const config: BffConfig = {
    port: 0,
    oidc: {
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      jwksUrl: identity.jwksUrl,
      adminBaseUrl: 'https://keycloak.test/realms/hubstore',
      adminTokenUrl: 'https://keycloak.test/realms/master/protocol/openid-connect/token',
      adminUsername: 'admin',
      adminPassword: 'admin',
    },
    corsOrigins: ['http://localhost:3000'],
    grpc: {
      fulfillment: addrs.fulfillment,
      batching: addrs.batching,
      deliverybatch: addrs.deliverybatch,
      print: addrs.print,
      deadlineMs: opts.deadlineMs ?? 2000,
    },
    devResetPassword: false, // contract tests không test reset-password (auth.route.test riêng)
    kafka: { enabled: false, bootstrapServers: 'localhost:9092' }, // SF-27 side-channel — off trong test
  };
  const app = buildApp(config);

  return {
    fulfillment,
    tech,
    batching,
    deliverybatch,
    print,
    app,
    identity,
    closeAll: async () => {
      currentIdentity = null;
      await app.close();
      await fulfillment.close();
      await batching.close();
      await deliverybatch.close();
      await print.close();
      await identity.close();
    },
  };
}

/** Authorized inject helper — token RS256 sign bằng identity của harness. */
export async function authedInject(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: Record<string, unknown>,
  role = 'Manager',
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
