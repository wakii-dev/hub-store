/**
 * Unit tests SF-14 (review P1-3) — pin logic phân loại + semantics collectedAmount:
 *  (a) shopHealth (per-shop aggregate) + itemState (per-order drill-down);
 *  (b) POST /cod/confirm body: OMIT collectedAmount = absence (server lấy
 *      expected — D3) vs collectedAmount: 0 = thu thật 0 đồng.
 * Pure functions — không cần render/jsdom.
 */
import { describe, expect, it } from 'vitest';
import { COD_COLLECTION_STATUS, type SettlementDetailItem, type SettlementShopRow } from '@hub-store/shared';
import {
  buildConfirmBody,
  itemState,
  parseCollectedAmount,
} from './ConfirmCollectModal';
import { shopHealth } from './ShopTable';

function row(partial: Partial<SettlementShopRow> = {}): SettlementShopRow {
  return {
    shopCode: 'SHP-001',
    shopName: 'FPT Shop Cầu Giấy',
    totalOrders: 10,
    totalExpected: 1_000_000,
    totalCollected: 1_000_000,
    diffAmount: 0,
    pendingCount: 0,
    mismatchCount: 0,
    ...partial,
  };
}

function item(partial: Partial<SettlementDetailItem>): SettlementDetailItem {
  return {
    fulfillCode: 'FLC-2026-0901-0034',
    batchCode: 'PB-001',
    shopCode: 'SHP-001',
    shopName: 'FPT Shop Cầu Giấy',
    expectedAmount: 450_000,
    collectedBy: '',
    status: COD_COLLECTION_STATUS.CONFIRMED,
    ...partial,
  };
}

describe('shopHealth — phân loại shop theo aggregate (Thiếu thu / Lệch tiền / Đủ)', () => {
  it('pendingCount > 0 → "short" (Thiếu thu) — ưu tiên kể cả khi có mismatch', () => {
    expect(shopHealth(row({ pendingCount: 1 }))).toBe('short');
    expect(shopHealth(row({ pendingCount: 3, mismatchCount: 2 }))).toBe('short');
  });

  it('pendingCount = 0 + mismatchCount > 0 → "mismatch" (Lệch tiền)', () => {
    expect(shopHealth(row({ mismatchCount: 1 }))).toBe('mismatch');
  });

  it('không pending không mismatch → "ok" (Đủ) — kể cả diff âm do case khác', () => {
    expect(shopHealth(row())).toBe('ok');
  });
});

describe('itemState — phân loại đơn trong drill-down (PENDING / LỆCH / ĐÃ THU)', () => {
  it('status = COD_PENDING → "pending" (dùng enum constant, không magic 0)', () => {
    expect(itemState(item({ status: COD_COLLECTION_STATUS.PENDING }))).toBe('pending');
  });

  it('CONFIRMED + collected ≠ expected → "mismatch"', () => {
    expect(
      itemState(item({ collectedAmount: 400_000 })), // expected 450.000
    ).toBe('mismatch');
  });

  it('CONFIRMED + collected = expected → "ok"', () => {
    expect(itemState(item({ collectedAmount: 450_000 }))).toBe('ok');
  });

  it('CONFIRMED + thiếu collectedAmount → "ok" (server đã set collected = expected)', () => {
    expect(itemState(item({ collectedAmount: undefined }))).toBe('ok');
  });
});

describe('parseCollectedAmount — input thực thu (trống = đủ, 0 = thu thật 0 đồng)', () => {
  it('trống / whitespace → undefined = OMIT collectedAmount (server lấy expected)', () => {
    expect(parseCollectedAmount('')).toBeUndefined();
    expect(parseCollectedAmount('   ')).toBeUndefined();
  });

  it('"0" → 0 (số 0 THẬT — phân biệt với absence)', () => {
    expect(parseCollectedAmount('0')).toBe(0);
  });

  it('nhận số nguyên dương, cả dạng có grouping "450.000" / "450,000"', () => {
    expect(parseCollectedAmount('450000')).toBe(450_000);
    expect(parseCollectedAmount('450.000')).toBe(450_000);
    expect(parseCollectedAmount('450,000')).toBe(450_000);
  });

  it('âm / thập phân / rác → throw (FE chặn trước, BFF vẫn là gate cuối)', () => {
    expect(() => parseCollectedAmount('-5')).toThrow();
    expect(() => parseCollectedAmount('1.5')).toThrow();
    expect(() => parseCollectedAmount('abc')).toThrow();
  });
});

describe('buildConfirmBody — semantics presence của collectedAmount trên wire', () => {
  it('absence: collected undefined → KHÔNG có key collectedAmount trong body', () => {
    const body = buildConfirmBody('FLC-1');
    expect('collectedAmount' in body).toBe(false);
    expect(body).toEqual({ fulfillCode: 'FLC-1' });
  });

  it('0 đồng: collected = 0 → key CÓ MẶT với giá trị 0 (thu thật 0, không phải absence)', () => {
    const body = buildConfirmBody('FLC-1', 0);
    expect('collectedAmount' in body).toBe(true);
    expect(body.collectedAmount).toBe(0);
  });

  it('số dương passthrough', () => {
    expect(buildConfirmBody('FLC-1', 280_000)).toEqual({
      fulfillCode: 'FLC-1',
      collectedAmount: 280_000,
    });
  });
});
