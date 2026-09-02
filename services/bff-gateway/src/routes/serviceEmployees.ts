/**
 * StaffArea REST routes (SF-17 — spec §6):
 *   GET  /service-employees                      — bất kỳ role đã đăng nhập
 *   GET  /service-employees/:code                — bất kỳ
 *   POST /service-employees                      — Admin (requireRole → 403 FORBIDDEN)
 *   PUT  /service-employees/:code                — Admin
 *   PUT  /service-employees/:code/active         — Admin
 *   POST /service-employees/payment-account/verify — Admin
 * Error mapping một chỗ: sendGrpcError. Role từ JWT guard, truyền xuống gRPC
 * qua metadata x-user-role. Write routes gate server-side requireRole('Admin')
 * — không chỉ ẩn nút FE (spec §4 non-functional).
 */
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { FastifyInstance } from 'fastify';
import type { StaffAreaApi } from '../clients/staffArea.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser, requireRole } from '../plugins/auth.js';
import { paginated } from '../lib/envelope.js';
import { sendGrpcError, grpcError } from '../lib/grpc-error.js';
import {
  mapServiceEmployee,
  mapVerifyResult,
} from '../mappers/staffArea.js';

export interface StaffAreaRouteDeps {
  staffArea: StaffAreaApi;
}

/** Body shape create/update — full-replace (employee_code immutable khi update). */
interface ServiceEmployeeBody {
  employeeCode?: string;
  fullName?: string;
  titleCode?: string;
  paymentAccount?: string;
  isActive?: boolean;
  regionCodes?: string[];
}

export function registerServiceEmployeesRoutes(app: FastifyInstance, deps: StaffAreaRouteDeps): void {
  const s = deps.staffArea;

  // List — LUÔN gồm inactive (FE dim client-side). Filters: titleCode/query/regionCode.
  app.get<{ Querystring: { titleCode?: string; query?: string; regionCode?: string } }>(
    '/service-employees',
    async (request, reply) => {
      const { role } = requireUser(request);
      const q = request.query;
      try {
        const resp = await s.listServiceEmployees(
          { titleCode: q.titleCode ?? '', query: q.query ?? '', regionCode: q.regionCode ?? '' },
          role,
        );
        const items = (resp.items ?? []).map(mapServiceEmployee);
        return await reply.send(paginated(items, Number(resp.total), 1, Math.max(items.length, 1)));
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Detail.
  app.get<{ Params: { code: string } }>('/service-employees/:code', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await s.getServiceEmployee({ employeeCode: request.params.code }, role);
      if (!resp.employee) {
        return sendGrpcError(
          reply,
          grpcError(GrpcStatus.NOT_FOUND, `Service employee ${request.params.code} not found.`),
          SERVICE_NAMES.fulfillment,
        );
      }
      return await reply.send(mapServiceEmployee(resp.employee));
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Create — validation (format code/account, cap 100) ở upstream gRPC (BFF pass-through).
  app.post<{ Body: ServiceEmployeeBody }>('/service-employees', async (request, reply) => {
    if (!requireRole(request, reply, 'Admin')) return reply;
    const { role } = requireUser(request);
    const b = request.body;
    try {
      const resp = await s.createServiceEmployee(
        {
          employee: {
            employeeCode: b.employeeCode ?? '',
            fullName: b.fullName ?? '',
            titleCode: b.titleCode ?? '',
            paymentAccount: b.paymentAccount ?? '',
            isActive: true,
            regionCodes: b.regionCodes ?? [],
            createdAt: '',
            updatedAt: '',
          },
        },
        role,
      );
      if (!resp.employee) {
        return sendGrpcError(
          reply,
          grpcError(GrpcStatus.INTERNAL, 'Upstream returned no employee.'),
          SERVICE_NAMES.fulfillment,
        );
      }
      return await reply.send(mapServiceEmployee(resp.employee));
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Update — full-replace, employee_code immutable (route param là nguồn sự thật).
  app.put<{ Params: { code: string }; Body: ServiceEmployeeBody }>(
    '/service-employees/:code',
    async (request, reply) => {
      if (!requireRole(request, reply, 'Admin')) return reply;
      const { role } = requireUser(request);
      const b = request.body;
      try {
        const resp = await s.updateServiceEmployee(
          {
            employeeCode: request.params.code,
            employee: {
              employeeCode: request.params.code,
              fullName: b.fullName ?? '',
              titleCode: b.titleCode ?? '',
              paymentAccount: b.paymentAccount ?? '',
              isActive: b.isActive ?? true,
              regionCodes: b.regionCodes ?? [],
              createdAt: '',
              updatedAt: '',
            },
          },
          role,
        );
        if (!resp.employee) {
          return sendGrpcError(
            reply,
            grpcError(GrpcStatus.NOT_FOUND, `Service employee ${request.params.code} not found.`),
            SERVICE_NAMES.fulfillment,
          );
        }
        return await reply.send(mapServiceEmployee(resp.employee));
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Toggle active — off-switch duy nhất (KHÔNG có delete API, spec §3).
  app.put<{ Params: { code: string }; Body: { active?: boolean } }>(
    '/service-employees/:code/active',
    async (request, reply) => {
      if (!requireRole(request, reply, 'Admin')) return reply;
      const { role } = requireUser(request);
      try {
        const resp = await s.setServiceEmployeeActive(
          { employeeCode: request.params.code, isActive: request.body.active ?? true },
          role,
        );
        if (!resp.employee) {
          return sendGrpcError(
            reply,
            grpcError(GrpcStatus.NOT_FOUND, `Service employee ${request.params.code} not found.`),
            SERVICE_NAMES.fulfillment,
          );
        }
        return await reply.send(mapServiceEmployee(resp.employee));
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Verify TK nhận tiền — dual-mode upstream (MOCK default / ZALOPAY env).
  app.post<{ Body: { paymentAccount?: string } }>(
    '/service-employees/payment-account/verify',
    async (request, reply) => {
      if (!requireRole(request, reply, 'Admin')) return reply;
      const { role } = requireUser(request);
      try {
        const resp = await s.verifyPaymentAccount(
          { paymentAccount: request.body.paymentAccount ?? '' },
          role,
        );
        return await reply.send(mapVerifyResult(resp));
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );
}
