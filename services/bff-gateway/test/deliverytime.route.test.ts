/**
 * Contract tests SF-28 T4 delivery-time (plan Task 4): GET time-slots (422
 * quá khứ / lọc slot hôm nay / OK ngày mai / 422 quá +7 ngày), PUT
 * delivery-time guard PAST_DATE_NOT_ALLOWED (chặn TRƯỚC proxy), role gates
 * Coordinator/Manager/Admin trên 2 PUT cũ, GET shops ?q= filter. Harness
 * pattern transfer.route.test.ts — mock gRPC upstream qua override().
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  startHarness,
  signTestToken,
} from './harness.js';
import type { Harness } from './harness.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

/** Ngày VN hôm nay + offsetDays — cùng logic vnToday() của route (UTC+7). */
function vnToday(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

async function injectGet(url: string, role = 'Coordinator'): Promise<{ statusCode: number; body: any }> {
  const res = await h.app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${await signTestToken(role)}` },
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = null;
  }
  return { statusCode: res.statusCode, body };
}

async function injectPut(
  url: string,
  payload: Record<string, unknown>,
  role = 'Coordinator',
): Promise<{ statusCode: number; body: any }> {
  const res = await h.app.inject({
    method: 'PUT',
    url,
    payload,
    headers: { authorization: `Bearer ${await signTestToken(role)}` },
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = null;
  }
  return { statusCode: res.statusCode, body };
}

describe('SF-28 T4 — GET /fulfillment/time-slots', () => {
  it('ngày mai — 200, đủ 4 slot shape {id, from, to}', async () => {
    const { statusCode, body } = await injectGet(`/fulfillment/time-slots?date=${vnToday(1)}`);
    expect(statusCode).toBe(200);
    expect(body.date).toBe(vnToday(1));
    expect(body.slots).toEqual([
      { id: '08-10', from: '08:00', to: '10:00' },
      { id: '10-12', from: '10:00', to: '12:00' },
      { id: '14-16', from: '14:00', to: '16:00' },
      { id: '16-18', from: '16:00', to: '18:00' },
    ]);
  });

  it('ngày hôm qua — 422 PAST_DATE_NOT_ALLOWED', async () => {
    const { statusCode, body } = await injectGet(`/fulfillment/time-slots?date=${vnToday(-1)}`);
    expect(statusCode).toBe(422);
    expect(body.code).toBe('PAST_DATE_NOT_ALLOWED');
  });

  it('hôm nay — lọc slot đã qua (end <= giờ VN hiện tại)', async () => {
    const { statusCode, body } = await injectGet(`/fulfillment/time-slots?date=${vnToday(0)}`);
    expect(statusCode).toBe(200);
    const nowMin = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 420) % 1440;
    for (const s of body.slots) {
      const [hEnd, mEnd] = s.to.split(':').map(Number);
      expect(hEnd * 60 + mEnd).toBeGreaterThan(nowMin);
    }
    // Slot còn lại là suffix của danh sách static (lọc giữ nguyên thứ tự).
    const all = ['08-10', '10-12', '14-16', '16-18'];
    const kept = body.slots.map((s: { id: string }) => s.id);
    expect(kept).toEqual(all.filter((id) => kept.includes(id)));
  });

  it('quá +7 ngày — 422 DATE_OUT_OF_RANGE', async () => {
    const { statusCode, body } = await injectGet(`/fulfillment/time-slots?date=${vnToday(8)}`);
    expect(statusCode).toBe(422);
    expect(body.code).toBe('DATE_OUT_OF_RANGE');
  });

  it('date sai format — 422 VALIDATION_ERROR', async () => {
    const { statusCode, body } = await injectGet('/fulfillment/time-slots?date=05-09-2026');
    expect(statusCode).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('WarehouseOps — 403 PERMISSION_DENIED', async () => {
    const { statusCode, body } = await injectGet(
      `/fulfillment/time-slots?date=${vnToday(1)}`,
      'WarehouseOps',
    );
    expect(statusCode).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
  });
});

describe('SF-28 T4 — PUT /fulfillment/:code/delivery-time (guard + role gate)', () => {
  const url = '/fulfillment/ORD-3001/delivery-time';
  const tomorrowBody = {
    deliveryTime: { from: `${vnToday(1)}T08:00:00+07:00`, to: `${vnToday(1)}T10:00:00+07:00` },
  };

  it('from ngày hôm qua — 422 PAST_DATE_NOT_ALLOWED, KHÔNG gọi upstream', async () => {
    let called = false;
    h.fulfillment.override({
      updateDeliveryTime: (_c, cb) => {
        called = true;
        cb(null, {});
      },
    });
    const { statusCode, body } = await injectPut(url, {
      deliveryTime: { from: `${vnToday(-1)}T08:00:00+07:00`, to: `${vnToday(-1)}T10:00:00+07:00` },
    });
    expect(statusCode).toBe(422);
    expect(body.code).toBe('PAST_DATE_NOT_ALLOWED');
    expect(called).toBe(false);
  });

  it('from thiếu / không parse được — 422 VALIDATION_ERROR', async () => {
    const { statusCode, body } = await injectPut(url, {
      deliveryTime: { from: 'không-phải-iso', to: `${vnToday(1)}T10:00:00+07:00` },
    });
    expect(statusCode).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('from ngày mai — proxy upstream (200, map order)', async () => {
    const { statusCode, body } = await injectPut(url, tomorrowBody);
    expect(statusCode).toBe(200);
    expect(body.fulfillCode).toBe('ORD-3001');
  });

  it('WarehouseOps — 403 PERMISSION_DENIED, không gọi upstream', async () => {
    let called = false;
    h.fulfillment.override({
      updateDeliveryTime: (_c, cb) => {
        called = true;
        cb(null, {});
      },
    });
    const { statusCode, body } = await injectPut(url, tomorrowBody, 'WarehouseOps');
    expect(statusCode).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
    expect(called).toBe(false);
  });

  it('Manager — được phép (role gate 3 role)', async () => {
    const { statusCode } = await injectPut(url, tomorrowBody, 'Manager');
    expect(statusCode).toBe(200);
  });
});

describe('SF-28 T4 — PUT /fulfillment/:code/note (role gate)', () => {
  const url = '/fulfillment/ORD-3001/note';

  it('WarehouseOps — 403 PERMISSION_DENIED, không gọi upstream', async () => {
    let called = false;
    h.fulfillment.override({
      updateNote: (_c, cb) => {
        called = true;
        cb(null, {});
      },
    });
    const { statusCode, body } = await injectPut(url, { note: 'giao sau 18h' }, 'WarehouseOps');
    expect(statusCode).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
    expect(called).toBe(false);
  });

  it('Coordinator — 200 (được phép)', async () => {
    const { statusCode } = await injectPut(url, { note: 'giao sau 18h' }, 'Coordinator');
    expect(statusCode).toBe(200);
  });
});

describe('SF-28 T4 — GET /master-data/shops?q=', () => {
  beforeEach(() => {
    h.fulfillment.override({
      listDistinctShops: (_c, cb) =>
        cb(null, {
          items: [
            { code: '30201', name: 'FPT Shop Cầu Giấy', address: '124 Xuân Thủy' },
            { code: '30202', name: 'FPT Shop Hải Phòng', address: '1 Lê Chân' },
            { code: '40101', name: 'Kho Đồng Đế', address: '9 Đồng Đế' },
          ],
        }),
    });
  });

  it('q khớp code — lọc đúng', async () => {
    const { statusCode, body } = await injectGet('/master-data/shops?q=30202');
    expect(statusCode).toBe(200);
    expect(body.items.map((s: { shopCode: string }) => s.shopCode)).toEqual(['30202']);
  });

  it('q khớp name case-insensitive', async () => {
    const { statusCode, body } = await injectGet('/master-data/shops?q=fpt%20shop%20h');
    expect(statusCode).toBe(200);
    expect(body.items.map((s: { shopCode: string }) => s.shopCode)).toEqual(['30202']);
  });

  it('không có q — trả đủ list', async () => {
    const { statusCode, body } = await injectGet('/master-data/shops');
    expect(statusCode).toBe(200);
    expect(body.items).toHaveLength(3);
  });
});
