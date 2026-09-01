/**
 * gRPC status → HTTP error envelope mapping (spec §3.1 + §3.6 + resilience
 * policy §3.1). MỘT chỗ duy nhất — routes gọi `sendGrpcError` trong catch.
 *
 * Mapping:
 *   INVALID_ARGUMENT  → 422 + details[] per-field (từ gRPC metadata, see below)
 *   UNAUTHENTICATED   → 401 (code UNAUTHENTICATED)
 *   PERMISSION_DENIED → 403 (code PERMISSION_DENIED)
 *   NOT_FOUND         → 404 (code NOT_FOUND)
 *   DEADLINE_EXCEEDED / UNAVAILABLE / UNKNOWN  → 503 code UPSTREAM_UNAVAILABLE
 *     + message kèm tên service (fulfillment-service/batching-service/print-service)
 *   khác              → 500 (code INTERNAL)
 *
 * Convention chi tiết per-field (SF-2 contract decision): upstream set gRPC
 * metadata key `x-error-details` = JSON array [{ field, message }] (type
 * ErrorDetail của @hub-store/shared). Không có key → details=[{field:'request',
 * message: err.details}].
 */
// grpc-js ≥1.13: enum exported as `status` (lowercase).
import { status as GrpcStatus, Metadata } from '@grpc/grpc-js';
import type { ServiceError } from '@grpc/grpc-js';
import type { FastifyReply } from 'fastify';
import type { ErrorDetail } from '@hub-store/shared';
import { errorEnvelope } from './envelope.js';

export const METADATA_DETAILS_KEY = 'x-error-details';

export function isServiceError(err: unknown): err is ServiceError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'number' &&
    'details' in err
  );
}

/** Lỗi upstream tự raise trong mock/test — shape trùng ServiceError. */
export function grpcError(code: GrpcStatus, message: string, metadata?: Metadata): ServiceError {
  const err: ServiceError = Object.assign(new Error(message), {
    code,
    details: message,
    metadata: metadata ?? new Metadata(),
  });
  return err;
}

/**
 * Parse details từ metadata. CONTRACT (SF-2 pin): value là
 * `encodeURIComponent(JSON.stringify(ErrorDetail[]))` — gRPC metadata chỉ
 * nhận ASCII printable nên producer PHẢI percent-encode (message tiếng Việt
 * vẫn đi được). Parser cũng chấp nhận JSON thô (ASCII) cho tiện debug.
 */
function parseDetails(err: ServiceError): ErrorDetail[] {
  const raw = err.metadata?.get(METADATA_DETAILS_KEY)?.[0];
  if (typeof raw === 'string') {
    for (const candidate of [raw, safeDecode(raw)]) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (d): d is ErrorDetail =>
              typeof d === 'object' && d !== null && typeof (d as ErrorDetail).field === 'string',
          );
        }
      } catch {
        // thử candidate kế tiếp — malformed metadata không được crash mapping.
      }
    }
  }
  return [{ field: 'request', message: err.details ?? 'Invalid argument.' }];
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function mapGrpcError(
  err: unknown,
  serviceName: string,
): { statusCode: number; body: ReturnType<typeof errorEnvelope> } {
  if (!isServiceError(err)) {
    return {
      statusCode: 500,
      body: errorEnvelope(500, err instanceof Error ? err.message : 'Internal error.', {
        code: 'INTERNAL',
      }),
    };
  }
  switch (err.code as GrpcStatus) {
    case GrpcStatus.INVALID_ARGUMENT:
      return {
        statusCode: 422,
        body: errorEnvelope(422, err.details ?? 'Validation failed.', {
          code: 'VALIDATION_ERROR',
          details: parseDetails(err),
        }),
      };
    case GrpcStatus.UNAUTHENTICATED:
      return {
        statusCode: 401,
        body: errorEnvelope(401, err.details ?? 'Upstream rejected credentials.', {
          code: 'UNAUTHENTICATED',
        }),
      };
    case GrpcStatus.PERMISSION_DENIED:
      return {
        statusCode: 403,
        body: errorEnvelope(403, err.details ?? 'Permission denied.', {
          code: 'PERMISSION_DENIED',
        }),
      };
    case GrpcStatus.NOT_FOUND:
      return {
        statusCode: 404,
        body: errorEnvelope(404, err.details ?? 'Not found.', { code: 'NOT_FOUND' }),
      };
    case GrpcStatus.DEADLINE_EXCEEDED:
    case GrpcStatus.UNAVAILABLE:
    case GrpcStatus.UNKNOWN:
      // Resilience policy (spec §3.1): timeout/mất kết nối upstream → 503 +
      // code UPSTREAM_UNAVAILABLE + message kèm tên service. Degraded mode:
      // Java sống + Go chết → D1 vẫn render, cột batchCode trống (FE-side).
      return {
        statusCode: 503,
        body: errorEnvelope(
          503,
          `${serviceName} is unavailable: ${err.details ?? 'no response within deadline / connection failed'}.`,
          { code: 'UPSTREAM_UNAVAILABLE' },
        ),
      };
    default:
      return {
        statusCode: 500,
        body: errorEnvelope(500, err.details ?? 'Internal error.', { code: 'INTERNAL' }),
      };
  }
}

/** Catch-all của routes: map + send error envelope, return reply để dừng flow. */
export function sendGrpcError(reply: FastifyReply, err: unknown, serviceName: string): void {
  const { statusCode, body } = mapGrpcError(err, serviceName);
  void reply.code(statusCode).send(body);
}

/** 422 validation error do CHÍNH BFF raise (vd printType không hợp lệ). */
export function sendBadRequest(reply: FastifyReply, details: ErrorDetail[]): void {
  void reply.code(422).send(
    errorEnvelope(422, 'Request validation failed.', { code: 'VALIDATION_ERROR', details }),
  );
}
