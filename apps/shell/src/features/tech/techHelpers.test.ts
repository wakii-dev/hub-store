import { describe, expect, it } from 'vitest';
import {
  dayOf,
  dedupeRegions,
  localToday,
  parseTimeline,
  statusLabel,
  statusTone,
  unionTechnicians,
} from './techHelpers';

describe('statusTone — 10 mã trạng thái → tone pastel semantic', () => {
  it('map đủ 10 mã theo SF-6 §1.1', () => {
    expect(statusTone('NEW')).toBe('info');
    expect(statusTone('CONFIRMED')).toBe('info');
    expect(statusTone('PROCESSING')).toBe('warning');
    expect(statusTone('SHIPPING')).toBe('warning');
    expect(statusTone('DELIVERED')).toBe('success');
    expect(statusTone('FAILED')).toBe('error');
    expect(statusTone('REDELIVERY')).toBe('warning');
    expect(statusTone('RESCHEDULED')).toBe('warning');
    expect(statusTone('CANCELLED')).toBe('error');
    expect(statusTone('RETURNED')).toBe('neutral');
  });
  it('status lạ → info (an toàn)', () => {
    expect(statusTone('WHATEVER')).toBe('info');
  });
});

describe('statusLabel', () => {
  it('VI + EN + fallback raw khi lạ', () => {
    expect(statusLabel('DELIVERED', 'vi')).toBe('Đã giao');
    expect(statusLabel('DELIVERED', 'en')).toBe('Delivered');
    expect(statusLabel('MYSTERY', 'vi')).toBe('MYSTERY');
  });
});

describe('parseTimeline — JSONB passthrough guarded', () => {
  it('array hợp lệ → entries chuẩn hóa', () => {
    const entries = parseTimeline([
      { at: '2026-09-02T07:00:00+07:00', status: 'NEW', note: 'Tạo đơn', actor: 'system' },
    ]);
    expect(entries).toEqual([
      { at: '2026-09-02T07:00:00+07:00', status: 'NEW', note: 'Tạo đơn', actor: 'system' },
    ]);
  });
  it('shape lạ (string/null/object) → [] không crash', () => {
    expect(parseTimeline('raw-string')).toEqual([]);
    expect(parseTimeline(null)).toEqual([]);
    expect(parseTimeline([{ nope: 1 }])).toEqual([{ at: '', status: '', note: '', actor: '' }]);
  });
});

describe('dayOf / localToday', () => {
  it('dayOf lấy phần YYYY-MM-DD; sai format → ""', () => {
    expect(dayOf('2026-09-02T08:00:00+07:00')).toBe('2026-09-02');
    expect(dayOf('2026-09-02')).toBe('2026-09-02');
    expect(dayOf('')).toBe('');
    expect(dayOf('not-a-date')).toBe('');
  });
  it('localToday theo LOCAL time, format YYYY-MM-DD', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('dedupeRegions / unionTechnicians', () => {
  it('dedupe + sort region codes, bỏ rỗng', () => {
    expect(dedupeRegions(['R2', '', 'R1', 'R2'])).toEqual(['R1', 'R2']);
  });
  it('union technicians dedupe theo code, giữ thứ tự gặp đầu tiên', () => {
    expect(
      unionTechnicians([
        [
          { code: 'KTV-001', name: 'An', type: 'KTV', activeCount: 2 },
          { code: 'KTV-002', name: 'Bình', type: 'KTV', activeCount: 0 },
        ],
        [{ code: 'KTV-001', name: 'An', type: 'KTV', activeCount: 5 }],
      ]),
    ).toEqual([
      { code: 'KTV-001', name: 'An', type: 'KTV', activeCount: 2 },
      { code: 'KTV-002', name: 'Bình', type: 'KTV', activeCount: 0 },
    ]);
  });
});
