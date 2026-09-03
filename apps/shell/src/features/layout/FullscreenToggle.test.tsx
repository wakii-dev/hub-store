/**
 * SF-21 D7 — FullscreenToggle tests (jsdom không có Fullscreen API → mock):
 * click toggle → requestFullscreen/exitFullscreen; F11 → preventDefault +
 * toggle cùng handler; fullscreenchange → icon state đổi.
 */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FullscreenToggle from './FullscreenToggle';

function defineFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: el,
    configurable: true,
    writable: true,
  });
}

/** jsdom không có Fullscreen API — beforeEach dọn sạch để mỗi test tự mock. */
beforeEach(() => {
  defineFullscreenElement(null);
  delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
  delete (document as unknown as Record<string, unknown>).exitFullscreen;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  defineFullscreenElement(null);
});

describe('FullscreenToggle', () => {
  it('click khi chưa fullscreen → requestFullscreen trên documentElement', () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: request,
      configurable: true,
    });
    const { getByTestId } = render(<FullscreenToggle />);
    expect(document.querySelector('[data-testid="fullscreen-toggle"]')).toBeTruthy();
    fireEvent.click(getByTestId('fullscreen-toggle'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('đang fullscreen → click → exitFullscreen; fullscreenchange → aria-label đổi', () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: request,
      configurable: true,
    });
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    const { getByTestId } = render(<FullscreenToggle />);
    // Simulate vào fullscreen: set element + fire change event.
    defineFullscreenElement(document.documentElement);
    fireEvent(document, new Event('fullscreenchange'));
    expect(getByTestId('fullscreen-toggle').getAttribute('aria-label')).toContain('Thoát');
    fireEvent.click(getByTestId('fullscreen-toggle'));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(0);
  });

  it('F11 → preventDefault + toggle (requestFullscreen)', () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: request,
      configurable: true,
    });
    render(<FullscreenToggle />);
    const evt = new KeyboardEvent('keydown', { key: 'F11', bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('API unavailable → button ẩn', () => {
    const { container } = render(<FullscreenToggle />);
    expect(container.querySelector('[data-testid="fullscreen-toggle"]')).toBeNull();
  });
});
