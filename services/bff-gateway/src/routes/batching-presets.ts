/**
 * Batching criteria presets (SF-28 T6 — plan, spec §3 Q3):
 *   GET  /batching/criteria-presets — static list 4 preset (KHÔNG gọi batching
 *       service) — Coordinator/Manager/Admin.
 *   POST /batching/criteria-preset-select — validate presetId ∈ list (sai →
 *       422), audit `batching.criteria_preset_select` fire-and-forget, trả
 *       { ok: true } — cùng role gate.
 */
import type { FastifyInstance } from 'fastify';
import { requireRole, requireUser } from '../plugins/auth.js';
import { sendBadRequest } from '../lib/grpc-error.js';
import { logActivity } from '../lib/audit.js';

export interface CriteriaPreset {
  id: string;
  name: string;
  description: string;
}

export const CRITERIA_PRESETS: CriteriaPreset[] = [
  { id: 'shortest', name: 'Ngắn nhất', description: 'Ưu tiên tổng quãng đường di chuyển ít nhất giữa các điểm giao.' },
  { id: 'cod_priority', name: 'Ưu tiên COD', description: 'Giao các đơn COD giá trị cao trước để thu tiền sớm trong ngày.' },
  { id: 'fewest_stops', name: 'Ưu tiên số dừng', description: 'Giảm số điểm dừng mỗi chuyến — hợp đơn rải nhiều tòa, cùng tòa gộp trước.' },
  { id: 'balanced', name: 'Cân bằng', description: 'Cân đối quãng đường, COD và số dừng — preset mặc định được đề xuất.' },
];

export function registerBatchingPresetRoutes(app: FastifyInstance): void {
  app.get('/batching/criteria-presets', async (request, reply) => {
    if (requireRole(request, reply, 'Coordinator', 'Manager', 'Admin') === null) return reply;
    return await reply.send({ items: CRITERIA_PRESETS });
  });

  app.post<{ Body: { presetId?: string; orderCount?: number } }>(
    '/batching/criteria-preset-select',
    async (request, reply) => {
      if (requireRole(request, reply, 'Coordinator', 'Manager', 'Admin') === null) return reply;
      const user = requireUser(request);
      const presetId =
        typeof request.body?.presetId === 'string' ? request.body.presetId.trim() : '';
      const preset = CRITERIA_PRESETS.find((p) => p.id === presetId);
      if (!preset) {
        return sendBadRequest(reply, [
          {
            field: 'presetId',
            message: `presetId phải là một trong: ${CRITERIA_PRESETS.map((p) => p.id).join(', ')}.`,
          },
        ]);
      }
      const orderCount =
        typeof request.body?.orderCount === 'number' && Number.isFinite(request.body.orderCount)
          ? request.body.orderCount
          : undefined;
      // Fire-and-forget audit (SF-7) — KHÔNG fail mutation khi DB thiếu.
      logActivity({
        actor: user.sub,
        action: 'batching.criteria_preset_select',
        targetType: 'batching_criteria_preset',
        targetId: preset.id,
        detail: { presetId: preset.id, ...(orderCount !== undefined ? { orderCount } : {}) },
      });
      return await reply.send({ ok: true });
    },
  );
}
