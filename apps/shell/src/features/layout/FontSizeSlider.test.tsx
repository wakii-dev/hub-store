/**
 * SF-21 D6 — FontSizeSlider tests: kéo slider → CSS var trên documentElement
 * cập nhật ngay + persist; mount init từ localStorage (reload giữ).
 * rc-slider v10 (antd 4.24) — tương tác qua keyboard trên handle [role=slider]
 * (ArrowRight = +1 step).
 */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import FontSizeSlider from './FontSizeSlider';

const KEY = 'sf.fontSize';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty('--app-font-size');
});

afterEach(cleanup);

/** Kéo handle từ 14 lên `target` bằng phím mũi tên (rc-slider v10 keyboard). */
function dragHandleTo(target: number) {
  const handle = document.querySelector('[role="slider"]') as HTMLElement;
  expect(handle).toBeTruthy();
  const presses = target - 14;
  for (let i = 0; i < presses; i += 1) {
    fireEvent.keyDown(handle, { key: 'ArrowRight', keyCode: 39, which: 39 });
  }
}

describe('FontSizeSlider', () => {
  it('kéo slider 14→18 → documentElement style cập nhật + localStorage persist', () => {
    render(<FontSizeSlider />);
    expect(document.querySelector('[data-testid="font-size-slider"]')).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('14px');
    dragHandleTo(18);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('18px');
    expect(localStorage.getItem(KEY)).toBe('18');
  });

  it('mount đọc storage → áp giá trị đã lưu (reload giữ)', () => {
    localStorage.setItem(KEY, '16');
    render(<FontSizeSlider />);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('16px');
  });

  it('storage rác → init về 14px', () => {
    localStorage.setItem(KEY, 'not-a-number');
    render(<FontSizeSlider />);
    expect(document.documentElement.style.getPropertyValue('--app-font-size')).toBe('14px');
  });
});
