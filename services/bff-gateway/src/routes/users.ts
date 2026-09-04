/**
 * SF-8 — Users management (Manager-only): list / create (+1 role) /
 * set-password / enable-disable qua KC Admin REST (kc-admin.ts).
 * Mọi handler: JWT guard (global) → isManager (403) → kcAdmin op.
 */
import type { FastifyInstance } from 'fastify';
import { KNOWN_ROLES, requireUser } from '../plugins/auth.js';
import { errorEnvelope, paginated } from '../lib/envelope.js';
import { sendForbidden, sendKcAdminError, isManager } from '../lib/authz.js';
import { KcAdminError, type KcAdminClient } from '../kc-admin.js';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

interface UserListItem {
  id: string;
  username: string;
  enabled: boolean;
  roles: string[];
}

export function registerUsersRoutes(
  app: FastifyInstance,
  opts: { kcAdmin: KcAdminClient },
): void {
  app.get('/users', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    try {
      const users = await opts.kcAdmin.listUsers();
      const byRole = new Map<string, Set<string>>();
      for (const role of KNOWN_ROLES) {
        const roleId = await opts.kcAdmin.findRoleId(role);
        // usernamesWithRole theo TÊN role — KC 26.0 by-id endpoint trả 404 (kc-admin.ts)
        byRole.set(role, roleId ? await opts.kcAdmin.usernamesWithRole(role) : new Set());
      }
      const items: UserListItem[] = users.map((u) => ({
        id: u.id,
        username: u.username,
        enabled: u.enabled,
        roles: KNOWN_ROLES.filter((r) => byRole.get(r)?.has(u.username)),
      }));
      return void reply.code(200).send(
        paginated(items, items.length, 1, Math.max(items.length, 1)),
      );
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });

  app.post('/users', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    const body = request.body as { username?: unknown; password?: unknown; role?: unknown } | null;
    const { username, password, role } = body ?? {};
    const details: Array<{ field: string; message: string }> = [];
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      details.push({ field: 'username', message: '3–64 ký tự [a-zA-Z0-9._-].' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      details.push({ field: 'password', message: 'Tối thiểu 8 ký tự.' });
    }
    if (typeof role !== 'string' || !(KNOWN_ROLES as readonly string[]).includes(role)) {
      details.push({ field: 'role', message: `Phải là một trong: ${KNOWN_ROLES.join(', ')}.` });
    }
    if (details.length > 0) {
      return void reply.code(422).send(errorEnvelope(422, 'Validation failed.', { details }));
    }
    try {
      const userId = await opts.kcAdmin.createUser(username as string, password as string);
      await opts.kcAdmin.setRealmRoleMappings(userId, [role as string]);
      return void reply.code(201).send({
        id: userId,
        username,
        enabled: true,
        roles: [role],
      });
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });

  app.post('/users/:userId/set-password', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    const { userId } = request.params as { userId: string };
    const body = request.body as { password?: unknown } | null;
    if (typeof body?.password !== 'string' || body.password.length < 8) {
      return void reply.code(422).send(
        errorEnvelope(422, 'Validation failed.', {
          details: [{ field: 'password', message: 'Tối thiểu 8 ký tự.' }],
        }),
      );
    }
    try {
      await opts.kcAdmin.setPassword(userId, body.password);
      return void reply.code(200).send({ ok: true });
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });

  app.put('/users/:userId/enabled', async (request, reply) => {
    if (!isManager(request)) return sendForbidden(reply);
    const { userId } = request.params as { userId: string };
    const body = request.body as { enabled?: unknown } | null;
    if (typeof body?.enabled !== 'boolean') {
      return void reply.code(422).send(
        errorEnvelope(422, 'Validation failed.', {
          details: [{ field: 'enabled', message: 'Phải là boolean.' }],
        }),
      );
    }
    try {
      // Self-lock: route key là KC UUID nhưng request.user.sub là USERNAME
      // (preferred_username) — phải getUserById rồi so username.
      const target = await opts.kcAdmin.getUserById(userId);
      if (!target) {
        return void reply.code(404).send(errorEnvelope(404, 'User not found.', { code: 'NOT_FOUND' }));
      }
      const actor = requireUser(request);
      if (target.username === actor.sub) {
        return void reply.code(422).send(
          errorEnvelope(422, 'Không thể tự khóa tài khoản của chính mình.', { code: 'SELF_LOCK_DENIED' }),
        );
      }
      await opts.kcAdmin.setEnabled(userId, body.enabled);
      return void reply.code(200).send({ ok: true });
    } catch (err) {
      if (err instanceof KcAdminError) return sendKcAdminError(reply, err);
      throw err;
    }
  });
}
