/**
 * gRPC client plumbing (Task 7): insecure credentials, per-call deadline 5s
 * (spec §3.1 resilience), metadata trên MỌI call.
 *
 * SF-12 (FI-257) s2s auth — token passthrough (spec §3.1 CONTRACT): BFF KHÔNG
 * còn derive-only — forward raw access token đã verify (plugins/auth.ts giữ
 * trên request.user.token) qua `authorization: Bearer` metadata; Go/Java verify
 * JWKS độc lập (x-user-role chỉ được tin SAU khi verify, claim wins).
 * Machine-call không JWT (webhook sàn) → x-internal-token.
 */
import { ChannelCredentials, Metadata } from '@grpc/grpc-js';
import type { ClientUnaryCall, ServiceError } from '@grpc/grpc-js';
import { SERVICE_NAMES } from '../config.js';

/** Tên service hiển thị trong error envelope 503 (code UPSTREAM_UNAVAILABLE). */
export { SERVICE_NAMES };

/** Caller identity cho 1 gRPC call (SF-12 token passthrough).
 *  RequestUser (plugins/auth.ts) thỏa structural — routes truyền thẳng `user`. */
export interface Caller {
  role: string;
  /** Raw access token đã verify — forward `authorization: Bearer <token>`. */
  token?: string;
  /** x-user-name cho audit trail (actor). */
  actor?: string;
  /** Machine-call credential (webhook — KHÔNG có user JWT) → x-internal-token. */
  internalToken?: string;
}

type UnaryFn<Req, Res> = (
  request: Req,
  metadata: Metadata,
  options: { deadline: number },
  callback: (error: ServiceError | null, response: Res) => void,
) => ClientUnaryCall;

/**
 * Promisify 1 gRPC unary call + deadline + auth metadata (SF-12):
 * { x-user-role, authorization?, x-internal-token?, x-user-name? }.
 */
export function callUnary<Req, Res>(
  fn: UnaryFn<Req, Res>,
  request: Req,
  caller: Caller,
  deadlineMs: number,
): Promise<Res> {
  const metadata = new Metadata();
  metadata.set('x-user-role', caller.role);
  if (caller.token) {
    metadata.set('authorization', `Bearer ${caller.token}`);
  }
  if (caller.internalToken) {
    metadata.set('x-internal-token', caller.internalToken);
  }
  if (caller.actor) {
    metadata.set('x-user-name', caller.actor);
  }
  return new Promise<Res>((resolve, reject) => {
    fn(request, metadata, { deadline: Date.now() + deadlineMs }, (err, response) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

export function insecureChannel(): ReturnType<typeof ChannelCredentials.createInsecure> {
  return ChannelCredentials.createInsecure();
}
