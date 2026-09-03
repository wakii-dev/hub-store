/**
 * SF-21 D6 — fontScale util tests: clamp [12,20] nguyên, applyFontSize set
 * CSS var + persist localStorage, init từ storage (invalid → 14 default).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  applyFontSize,
  clampFontSize,
  initFontSizeFromStorage,
} from './fontScale';

const KEY = 'sf.fontSize';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty('--app-font-size');
});

describe('clampFontSize', () => {
  it('biên dưới/ trên: 11→12, 21→20', () => {
    expect(clampFontSize(11)).toBe(FONT_SIZE_MIN);
    expect(clampFontSize(21)).toBe(FONT_SIZE_MAX);
  });

  it('in-range giữ nguyên + làm tròn số nguyên', () => {
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize(14.4)).toBe(14);
    expect(clampFontSize(15.6)).toBe(16);
  });
});

describe('applyFontSize', () => {
  it('set --app-font-size trên documentElement + persist localStorage', () => {
    applyFontSize(18);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('18px');
    expect(localStorage.getItem(KEY)).toBe('18');
  });

  it('clamp trước khi áp/persist', () => {
    applyFontSize(99);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('20px');
    expect(localStorage.getItem(KEY)).toBe('20');
  });
});

describe('initFontSizeFromStorage', () => {
  it('storage hợp lệ → clamp, áp và trả về', () => {
    localStorage.setItem(KEY, '16');
    expect(initFontSizeFromStorage()).toBe(16);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('16px');
  });

  it('storage invalid (NaN) → default 14', () => {
    localStorage.setItem(KEY, 'abc');
    expect(initFontSizeFromStorage()).toBe(FONT_SIZE_DEFAULT);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('14px');
  });

  it('storage out-of-range → clamp vào [12,20]', () => {
    localStorage.setItem(KEY, '100');
    expect(initFontSizeFromStorage()).toBe(FONT_SIZE_MAX);
    localStorage.setItem(KEY, '5');
    expect(initFontSizeFromStorage()).toBe(FONT_SIZE_MIN);
  });
});
