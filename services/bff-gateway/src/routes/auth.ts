/**
 * DEV-ONLY forgot-password (SF-4 C1): POST /auth/reset-password — nhận
 * username + password mới, set thẳng qua Keycloak Admin API.
 *
 * ⚠️ KHÔNG CÓ BƯỚC XÁC MINH DANH TÍNH (không email, không OTP) — endpoint này
 * CHỈ DÀNH CHO DEV. Production bắt buộc thay bằng OTP email hoặc Keycloak
 * built-in forgot-password flow (xem README mục "Forgot password (dev-only)").
 *
 * Admin credential qua env KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
 * (.env.example SF-1) — KHÔNG hardcode secret (dev default 'admin'/'admin'
 * khớp compose dev default). Admin token = password grant realm master,
 * client admin-cli — dùng 1 lần mỗi request (đủ cho dev, không cache).
 */
import type { FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@hub-store/shared';
import type { BffOidcConfig } from '../config.js';

function badRequest(reply: { code(c: number): { send(b: unknown): unknown } }, message: string): void {
  const body: ErrorEnvelope = { statusCode: 400, message, code: 'BAD_REQUEST' };
  void reply.code(400).send(body);
}

interface AdminTokenResponse {
  access_token?: string;
}

interface KcUser {
  id?: string;
}

async function getAdminToken(oidc: BffOidcConfig): Promise<string> {
  const res = await fetch(oidc.adminTokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: oidc.adminUsername,
      password: oidc.adminPassword,
    }),
  });
  if (!res.ok) {
    throw new Error(`Keycloak admin token request failed (${res.status}).`);
  }
  const body = (await res.json()) as AdminTokenResponse;
  if (typeof body.access_token !== 'string') {
    throw new Error('Keycloak admin token response missing access_token.');
  }
  return body.access_token;
}

async function findUserId(oidc: BffOidcConfig, token: string, username: string): Promise<string | null> {
  const url = `${oidc.adminBaseUrl}/users?username=${encodeURIComponent(username)}&exact=true&max=1`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Keycloak user lookup failed (${res.status}).`);
  }
  const users = (await res.json()) as KcUser[];
  return typeof users[0]?.id === 'string' ? users[0].id : null;
}

export function registerAuthRoutes(app: FastifyInstance, opts: { oidc: BffOidcConfig }): void {
  app.post('/auth/reset-password', async (request, reply) => {
    const body = request.body as { username?: unknown; newPassword?: unknown } | null;
    const username = body?.username;
    const newPassword = body?.newPassword;
    if (typeof username !== 'string' || username.trim() === '') {
      return badRequest(reply, 'Body must include non-empty string "username".');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return badRequest(reply, 'Body must include "newPassword" with at least 6 characters.');
    }

    const token = await getAdminToken(opts.oidc);
    const userId = await findUserId(opts.oidc, token, username.trim());
    if (!userId) {
      // 404 envelope-style — user không tồn tại (dev-only, không anti-enumeration).
      const notFound: ErrorEnvelope = {
        statusCode: 404,
        message: `User "${username.trim()}" not found in realm.`,
        code: 'NOT_FOUND',
      };
      return void reply.code(404).send(notFound);
    }
    const res = await fetch(`${opts.oidc.adminBaseUrl}/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'password', value: newPassword, temporary: false }),
    });
    if (!res.ok) {
      throw new Error(`Keycloak reset-password failed (${res.status}).`);
    }
    return void reply.code(200).send({ ok: true });
  });
}
