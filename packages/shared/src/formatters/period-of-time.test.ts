import { describe, expect, it } from 'vitest';
import { formatPeriodOfTime } from './period-of-time';

describe('formatPeriodOfTime (Decision D5+D13)', () => {
  it('formats Date objects: HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY', () => {
    const from = new Date(2026, 0, 5, 9, 5); // local: 09:05 05/01/2026
    const to = new Date(2026, 0, 5, 18, 30);
    expect(formatPeriodOfTime(from, to)).toBe(
      '09:05 05/01/2026 – 18:30 05/01/2026',
    );
  });

  it('accepts ISO datetime strings (no TZ suffix = local)', () => {
    expect(formatPeriodOfTime('2026-03-14T08:30:00', '2026-03-15T23:59:00')).toBe(
      '08:30 14/03/2026 – 23:59 15/03/2026',
    );
  });

  it('pads single-digit parts with zeros', () => {
    expect(formatPeriodOfTime('2026-01-02T03:04:00', '2026-11-12T13:14:00')).toBe(
      '03:04 02/01/2026 – 13:14 12/11/2026',
    );
  });

  it('uses en-dash with surrounding spaces, no month names', () => {
    const out = formatPeriodOfTime('2026-05-01T00:00:00', '2026-05-01T00:00:00');
    expect(out).toContain(' – ');
    expect(out).not.toMatch(/[a-zA-Z]/); // locale-neutral numeric only
  });

  it('locale argument accepted, output stays numeric-identical', () => {
    const a = formatPeriodOfTime('2026-05-01T10:00:00', '2026-05-02T10:00:00');
    const b = formatPeriodOfTime(
      '2026-05-01T10:00:00',
      '2026-05-02T10:00:00',
      'en',
    );
    expect(a).toBe(b);
  });
});
