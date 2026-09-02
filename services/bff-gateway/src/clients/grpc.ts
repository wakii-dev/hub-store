/**
 * gRPC client plumbing (Task 7): insecure credentials, per-call deadline 5s
 * (spec §3.1 resilience), metadata { x-user-role: role } trên MỌI call
 * (spec §3.9 — services tin BFF).
 */
import { ChannelCredentials, Metadata } from '@grpc/grpc-js';
import type { ClientUnaryCall, ServiceError } from '@grpc/grpc-js';
import { SERVICE_NAMES } from '../config.js';

/** Tên service hiển thị trong error envelope 503 (code UPSTREAM_UNAVAILABLE). */
export { SERVICE_NAMES };

type UnaryFn<Req, Res> = (
  request: Req,
  metadata: Metadata,
  options: { deadline: number },
  callback: (error: ServiceError | null, response: Res) => void,
) => ClientUnaryCall;

/**
 * Promisify 1 gRPC unary call + deadline + x-user-role metadata.
 * `actor` (optional, SF-13) — x-user-name cho audit trail intake; các call cũ
 * không truyền → metadata giữ nguyên shape (additive).
 */
export function callUnary<Req, Res>(
  fn: UnaryFn<Req, Res>,
  request: Req,
  role: string,
  deadlineMs: number,
  actor?: string,
): Promise<Res> {
  const metadata = new Metadata();
  metadata.set('x-user-role', role);
  if (actor) {
    metadata.set('x-user-name', actor);
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
