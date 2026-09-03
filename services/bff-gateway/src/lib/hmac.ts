/**
 * SF-26 HMAC verify — timing-safe, fail-closed. Secret KHÔNG BAO GIỜ xuất
 * hiện trong message/log/error.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface HmacResult {
  ok: boolean;
  status: number;
  message: string;
}

export function verifyHmac(
  rawBody: Buffer | string,
  signature: unknown,
  secret: string,
): HmacResult {
  if (!secret) return { ok: false, status: 503, message: 'webhook auth unavailable' };
  if (typeof signature !== 'string' || signature.length === 0) {
    return { ok: false, status: 401, message: 'missing X-Signature' };
  }
  const provided = signature.replace(/^sha256=/i, '').toLowerCase();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: 'invalid signature' };
  }
  return { ok: true, status: 200, message: 'ok' };
}
