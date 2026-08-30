import { describe, expect, it } from 'vitest';
import { formatVnd } from './vnd';

describe('formatVnd (Decision D2)', () => {
  it('VI: dot thousands, đ suffix no space', () => {
    expect(formatVnd(15_000_000, 'vi')).toBe('15.000.000đ');
  });

  it('EN: comma thousands, ₫ suffix with space', () => {
    expect(formatVnd(15_000_000, 'en')).toBe('15,000,000 ₫');
  });

  it('defaults to vi', () => {
    expect(formatVnd(15_000_000)).toBe('15.000.000đ');
  });

  it('zero', () => {
    expect(formatVnd(0, 'vi')).toBe('0đ');
    expect(formatVnd(0, 'en')).toBe('0 ₫');
  });

  it('negative', () => {
    expect(formatVnd(-1_500_000, 'vi')).toBe('-1.500.000đ');
    expect(formatVnd(-1_500_000, 'en')).toBe('-1,500,000 ₫');
  });

  it('non-round thousands', () => {
    expect(formatVnd(1_234_567, 'vi')).toBe('1.234.567đ');
    expect(formatVnd(1_234_567, 'en')).toBe('1,234,567 ₫');
    expect(formatVnd(1_000, 'vi')).toBe('1.000đ');
  });

  it('small numbers have no separator', () => {
    expect(formatVnd(999, 'vi')).toBe('999đ');
    expect(formatVnd(999, 'en')).toBe('999 ₫');
  });

  it('non-integer rounds to nearest đồng', () => {
    expect(formatVnd(1500.4, 'vi')).toBe('1.500đ');
    expect(formatVnd(1500.5, 'vi')).toBe('1.501đ');
  });
});
