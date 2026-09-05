/**
 * SF-8 — Manager/Admin guard. Reply envelope TRỰC TIẾP (KHÔNG throw qua
 * setErrorHandler — app.ts clobber code<500 → BAD_REQUEST, mất PERMISSION_DENIED).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorEnvelope } from './envelope.js';
import { requireUser } from '../plugins/auth.js';

export function sendForbidden(reply: FastifyReply): void {
  void reply.code(403).send(errorEnvelope(403, 'Forbidden', { code: 'PERMISSION_DENIED' }));
}

export function sendKcAdminError(reply: FastifyReply, err: unknown): void {
  const e = err as { status?: number; kind?: string; message?: string };
  const status = typeof e.status === 'number' ? e.status : 503;
  const code =
    e.kind === 'not-configured' ? 'KC_ADMIN_NOT_CONFIGURED'
    : e.kind === 'conflict' ? 'USERNAME_EXISTS'
    : e.kind === 'not-found' ? 'NOT_FOUND'
    : 'UPSTREAM_UNAVAILABLE';
  void reply.code(status).send(errorEnvelope(status, e.message ?? 'Keycloak admin error.', { code }));
}

export function isManager(request: FastifyRequest): boolean {
  return requireUser(request).role === 'Manager';
}

export function isAdmin(request: FastifyRequest): boolean {
  return requireUser(request).role === 'Admin';
}

/**
 * users.manage — FE PERMISSION_MATRIX (packages/shared usePermissions) + 1000-
 * role-matrix regression spec: Manager + Admin (admin có nav-users). BFF từng
 * Manager-only → admin mở /users nhận 403 PERMISSION_DENIED ("Thao tác thất
 * bại") dù FE cho phép — contract mismatch, đã đồng bộ về Manager ∨ Admin.
 */
export function canManageUsers(request: FastifyRequest): boolean {
  const role = requireUser(request).role;
  return role === 'Manager' || role === 'Admin';
}
