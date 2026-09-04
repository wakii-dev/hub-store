/**
 * SF-21 avatar routes (spec §4 D3): upload (multipart) + serve user avatar.
 * Storage = bảng `user_avatars` (V10) trên fulfillment DB — BFF ghi/đọc TRỰC
 * TIẾP qua pg Pool (precedent lib/audit.ts: lazy pool, cùng env connection).
 * Validate server-side: mimetype allowlist (image/jpeg|image/png) + magic
 * bytes (JPEG FF D8 FF, PNG 89 50 4E 47) + ≤5MB — chỉ trust byte thật, KHÔNG
 * tin filename hay header client. Serve kèm nosniff (chống content sniffing)
 * + Cache-Control private (avatar per-user, auth-required).
 */
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { requireUser } from '../plugins/auth.js';
import { errorEnvelope } from '../lib/envelope.js';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;
export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

let pool: Pool | null = null;

/** Lazy pool — giống lib/audit.ts (cùng env FULFILLMENT_DB_*). Null = disabled.
 *  Pool inject (test) ưu tiên TRƯỚC env check — test không cần set env DB. */
export function getAvatarPool(env: NodeJS.ProcessEnv = process.env): Pool | null {
  if (pool) return pool;
  const host = env.FULFILLMENT_DB_HOST;
  if (!host) return null;
  if (!pool) {
    pool = new Pool({
      host,
      port: Number(env.FULFILLMENT_DB_PORT ?? 5432),
      database: env.FULFILLMENT_DB_NAME ?? 'fulfillment',
      user: env.FULFILLMENT_DB_USER ?? 'hubstore',
      password: env.FULFILLMENT_DB_PASSWORD ?? '',
      max: 5,
      connectionTimeoutMillis: 3000,
      statement_timeout: 3000,
    });
  }
  return pool;
}

/** Test-only hook — inject pool giả thay vì mock module (pattern audit.ts). */
export function __setAvatarPoolForTests(p: Pool | null): void {
  pool = p;
}

/** Magic-byte sniff — trả content-type thật của buffer hoặc null. */
export function detectAvatarType(buf: Buffer): AvatarContentType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  return null;
}

export function registerAvatarRoutes(app: FastifyInstance): void {
  // POST /avatar — multipart field `file`; user tự upload avatar CỦA MÌNH
  // (userId từ token `sub`, không nhận user-id từ client).
  app.post('/avatar', async (request, reply) => {
    const user = requireUser(request);
    const file = await request.file({ limits: { files: 1, fileSize: AVATAR_MAX_BYTES } });
    if (!file) {
      void reply
        .code(400)
        .send(errorEnvelope(400, 'Multipart body with a `file` field is required.', { code: 'BAD_REQUEST' }));
      return reply;
    }
    // Buffer với cap tự kiểm — vượt 5MB dừng đọc ngay (không nạp vô hạn).
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    for await (const chunk of file.file) {
      size += chunk.length;
      if (size > AVATAR_MAX_BYTES) {
        tooLarge = true;
        break;
      }
      chunks.push(chunk);
    }
    // limits.fileSize khiến busboy truncate đúng 5MB (size không bao giờ vượt)
    // → cờ `truncated` là tín hiệu chính; manual cap là lưới an toàn thứ hai.
    if (tooLarge || file.file.truncated) {
      void reply
        .code(400)
        .send(errorEnvelope(400, 'Avatar must be 5MB or smaller.', { code: 'BAD_REQUEST' }));
      return reply;
    }
    const buf = Buffer.concat(chunks);
    const sniffed = detectAvatarType(buf);
    if (
      sniffed === null ||
      !(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.mimetype) ||
      sniffed !== file.mimetype
    ) {
      void reply.code(400).send(
        errorEnvelope(400, 'Avatar must be a JPEG or PNG image (validated by magic bytes).', {
          code: 'BAD_REQUEST',
        }),
      );
      return reply;
    }
    const p = getAvatarPool();
    if (!p) {
      void reply
        .code(503)
        .send(errorEnvelope(503, 'Avatar storage is unavailable.', { code: 'UNAVAILABLE' }));
      return reply;
    }
    try {
      const res = await p.query(
        `INSERT INTO user_avatars (user_id, content_type, data, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id) DO UPDATE
           SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()
         RETURNING updated_at`,
        [user.sub, sniffed, buf],
      );
      const updatedAt = res.rows[0]?.updated_at;
      return await reply.send({ updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null });
    } catch (err) {
      request.log.error(err, 'avatar upload write failed');
      void reply
        .code(503)
        .send(errorEnvelope(503, 'Avatar storage is unavailable.', { code: 'UNAVAILABLE' }));
      return reply;
    }
  });

  // GET /avatar/:userId — mọi user đã authenticate đọc được (spec D3: avatar
  // không nhạy cảm); bytes + content-type LƯU DB; nosniff + private cache.
  app.get<{ Params: { userId: string } }>('/avatar/:userId', async (request, reply) => {
    requireUser(request);
    const { userId } = request.params;
    if (typeof userId !== 'string' || userId.length === 0 || userId.length > 255) {
      void reply
        .code(400)
        .send(errorEnvelope(400, 'userId is required.', { code: 'BAD_REQUEST' }));
      return reply;
    }
    const p = getAvatarPool();
    if (!p) {
      void reply
        .code(503)
        .send(errorEnvelope(503, 'Avatar storage is unavailable.', { code: 'UNAVAILABLE' }));
      return reply;
    }
    let row: { content_type: string; data: Buffer } | undefined;
    try {
      const res = await p.query<{ content_type: string; data: Buffer }>(
        'SELECT content_type, data FROM user_avatars WHERE user_id = $1',
        [userId],
      );
      row = res.rows[0];
    } catch (err) {
      request.log.error(err, 'avatar read failed');
      void reply
        .code(503)
        .send(errorEnvelope(503, 'Avatar storage is unavailable.', { code: 'UNAVAILABLE' }));
      return reply;
    }
    if (!row || !(AVATAR_CONTENT_TYPES as readonly string[]).includes(row.content_type)) {
      void reply
        .code(404)
        .send(errorEnvelope(404, 'Avatar not found.', { code: 'NOT_FOUND' }));
      return reply;
    }
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Cache-Control', 'private, max-age=300');
    void reply.type(row.content_type);
    return await reply.send(row.data);
  });
}
