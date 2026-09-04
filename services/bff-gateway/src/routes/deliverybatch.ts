/**
 * DeliveryBatch REST routes (SF-15, spec §3.6 — shape khớp app gốc, contract
 * chung SF-16). Cùng service batching-service (:50052) — error message 503
 * dùng tên `batching-service`. Fee-limit / precondition violation upstream
 * trả FailedPrecondition → 422 (map chung lib/grpc-error.ts).
 *
 *   POST /delivery-batch/quotes · POST /delivery-batch/planning/confirm
 *   POST /delivery-batch/booking · POST /delivery-batch/cancel-delivery-order
 *   POST /delivery-batch/cancel-batch
 *   GET  /delivery-batch/searchbookingdetail?planningIds=a,b
 */
import type { FastifyInstance } from 'fastify';
import type {
  BookingEntry,
  BookingResult,
  Quote,
  ShipmentPlanning,
} from '../../../../api/proto/gen/ts/hubstore/batching/v1/delivery_batch';
import type {
  DeliveryAddonDto,
  DeliveryBookingDto,
  DeliveryBookingEntryDto,
  DeliveryCancelBatchRequest,
  DeliveryCancelOrderRequest,
  DeliveryConfirmPlanningRequest,
  DeliveryQuotesRequest,
  DeliveryQuoteDto,
  DeliveryStopOrderDto,
} from '@hub-store/shared';
import type { DeliveryBatchApi } from '../clients/deliverybatch.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { sendGrpcError } from '../lib/grpc-error.js';

/** REST `distance` (app gốc) → proto `distanceKm`. */
function toStopOrderQuote(s: DeliveryStopOrderDto) {
  return { address: s.address, distanceKm: s.distance, codAmount: s.codAmount, totalBill: s.totalBill };
}

function mapAddon(a: { code: string; name: string; grp: string; fee: number }): DeliveryAddonDto {
  return { code: a.code, name: a.name, grp: a.grp, fee: a.fee };
}

function mapQuote(q: Quote): DeliveryQuoteDto {
  return {
    serviceId: q.serviceId,
    name: q.name,
    vehicleType: q.vehicleType,
    fee: q.fee,
    baseFee: q.baseFee,
    etaMinutes: q.etaMinutes,
    isExceedFeeLimit: q.isExceedFeeLimit,
    addonServices: (q.addonServices ?? []).map(mapAddon),
  };
}

function mapPlanning(p: ShipmentPlanning) {
  return {
    planningId: p.planningId,
    batchCode: p.batchCode,
    stopOrder: p.stopOrder,
    orderCode: p.orderCode,
    vehicleType: p.vehicleType,
    serviceId: p.serviceId,
    addons: p.addons ?? [],
    status: p.status,
    codAmount: p.codAmount,
    totalBill: p.totalBill,
    fee: p.fee,
  };
}

/** 2 field proto driver_name/driver_phone → 1 string "name - phone" (§3.6). */
function mapBooking(b: BookingResult): DeliveryBookingDto {
  return {
    planningId: b.planningId,
    carrierBookingId: b.carrierBookingId,
    driver: `${b.driverName} - ${b.driverPhone}`,
    licensePlate: b.licensePlate,
    status: b.status,
  };
}

function mapBookingEntry(e: BookingEntry): DeliveryBookingEntryDto {
  const b = e.booking;
  return {
    planningId: e.planningId,
    booking: b
      ? {
          carrierBookingId: b.carrierBookingId,
          driverName: b.driverName,
          driverPhone: b.driverPhone,
          licensePlate: b.licensePlate,
          status: b.status,
          bookedAt: b.bookedAt,
          cancelledAt: b.cancelledAt,
          cancelReason: b.cancelReason,
        }
      : null,
    timeline: (e.timeline ?? []).map((t) => ({
      status: t.status,
      source: t.source,
      occurredAt: t.occurredAt,
      note: t.note,
    })),
  };
}

export function registerDeliveryBatchRoutes(app: FastifyInstance, deliveryBatch: DeliveryBatchApi): void {
  const svc = SERVICE_NAMES.batching;

  // Báo giá theo tải trọng — NVC step 1 (mock: 6 mức SGCN→8T).
  app.post<{ Body: DeliveryQuotesRequest }>('/delivery-batch/quotes', async (request, reply) => {
    const caller = requireUser(request);
    try {
      const resp = await deliveryBatch.getQuotes(
        { shopCode: request.body.shopCode, stopOrders: request.body.stopOrders.map(toStopOrderQuote) },
        caller,
      );
      return await reply.send({
        quotes: (resp.quotes ?? []).map(mapQuote),
        meta: resp.meta ?? { mock: false },
      });
    } catch (err) {
      return sendGrpcError(reply, err, svc, { preconditionAs422: true });
    }
  });

  // Chốt giá — fee server persist; planningId (decimal DB id) trả về cho booking.
  app.post<{ Body: DeliveryConfirmPlanningRequest }>(
    '/delivery-batch/planning/confirm',
    async (request, reply) => {
      const caller = requireUser(request);
      try {
        const resp = await deliveryBatch.confirmPlanning(
          { batchCode: request.body.batchCode, plannings: request.body.plannings },
          caller,
        );
        return await reply.send({
          plannings: (resp.plannings ?? []).map(mapPlanning),
          meta: resp.meta ?? { mock: false },
        });
      } catch (err) {
        return sendGrpcError(reply, err, svc, { preconditionAs422: true });
      }
    },
  );

  // Book carrier — gán tài xế + biển số (mock: driver pool).
  app.post<{ Body: { batchCode: string; shipmentPlannings: Array<{ planningId: string; codAmount: number; totalBill: number; stopOrder: number }> } }>(
    '/delivery-batch/booking',
    async (request, reply) => {
      const caller = requireUser(request);
      try {
        const resp = await deliveryBatch.createBooking(
          {
            batchCode: request.body.batchCode,
            shipmentPlannings: (request.body.shipmentPlannings ?? []).map((s) => ({
              planningId: s.planningId,
              codAmount: s.codAmount,
              totalBill: s.totalBill,
              stopOrder: s.stopOrder,
            })),
          },
          caller,
        );
        return await reply.send({
          bookings: (resp.bookings ?? []).map(mapBooking),
          meta: resp.meta ?? { mock: false },
        });
      } catch (err) {
        return sendGrpcError(reply, err, svc, { preconditionAs422: true });
      }
    },
  );

  // Hủy 1 đơn đã book/chốt — book-lại = confirm rồi booking (KHÔNG book trực
  // tiếp trên planning CANCELLED — Go reject FailedPrecondition → 422).
  app.post<{ Body: DeliveryCancelOrderRequest }>(
    '/delivery-batch/cancel-delivery-order',
    async (request, reply) => {
      const caller = requireUser(request);
      try {
        const resp = await deliveryBatch.cancelDeliveryOrder(
          { planningId: request.body.planningId, reason: request.body.reason },
          caller,
        );
        return await reply.send({
          planningId: resp.planningId,
          status: resp.status,
          meta: resp.meta ?? { mock: false },
        });
      } catch (err) {
        return sendGrpcError(reply, err, svc, { preconditionAs422: true });
      }
    },
  );

  // Hủy theo lô — booking ACTIVE → CANCELLED; planning CONFIRMED chưa book → DRAFT.
  app.post<{ Body: DeliveryCancelBatchRequest }>('/delivery-batch/cancel-batch', async (request, reply) => {
    const caller = requireUser(request);
    try {
      const resp = await deliveryBatch.cancelDeliveryBatch(
        { batchCode: request.body.batchCode, reason: request.body.reason },
        caller,
      );
      return await reply.send({
        results: resp.results ?? [],
        cancelledCount: resp.cancelledCount,
        meta: resp.meta ?? { mock: false },
      });
    } catch (err) {
      return sendGrpcError(reply, err, svc, { preconditionAs422: true });
    }
  });

  // Tracking detail — planningIds comma-separated (app gốc convention).
  app.get<{ Querystring: { planningIds?: string } }>(
    '/delivery-batch/searchbookingdetail',
    async (request, reply) => {
      const caller = requireUser(request);
      const planningIds = (request.query.planningIds ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      try {
        const resp = await deliveryBatch.searchBookingDetail({ planningIds }, caller);
        return await reply.send({
          bookings: (resp.bookings ?? []).map(mapBookingEntry),
          meta: resp.meta ?? { mock: false },
        });
      } catch (err) {
        return sendGrpcError(reply, err, svc, { preconditionAs422: true });
      }
    },
  );
}
