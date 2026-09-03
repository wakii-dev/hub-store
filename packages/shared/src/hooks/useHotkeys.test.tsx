import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hotkeyRegistry, useHotkeys, type HotkeyBinding } from './useHotkeys';

function pressKey(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function bindingsFor(handler: () => void): HotkeyBinding[] {
  return [
    { key: 'F4', handler, description: 'Lưu' },
    { key: 'F8', handler, description: 'Đóng' },
  ];
}

beforeEach(() => {
  hotkeyRegistry.clear();
});

describe('useHotkeys', () => {
  it('keydown F4/F8 gọi handler + preventDefault', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys('test-ctx', 'Test', bindingsFor(handler)));

    pressKey('F4');
    pressKey('F8');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('phím khác không gọi handler', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys('test-ctx', 'Test', bindingsFor(handler)));

    pressKey('F5');
    expect(handler).not.toHaveBeenCalled();
  });

  it('typing trong input không kích hoạt (target editable bị bỏ qua)', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys('test-ctx', 'Test', bindingsFor(handler)));
    document.body.innerHTML = '<input id="box" />';
    const input = document.getElementById('box') as HTMLInputElement;

    // keydown trên input vẫn đến window (bubbles) nhưng bị bỏ qua vì target editable
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('target contenteditable cũng bị bỏ qua', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys('test-ctx', 'Test', bindingsFor(handler)));
    const div = document.createElement('div');
    // isContentEditable là readonly trong lib.dom — ghi qua defineProperty (SF-12 CI tsc --noEmit).
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(div);

    act(() => {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('unmount gỡ listener + xóa registry entry', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useHotkeys('ctx-1', 'Ctx 1', bindingsFor(handler)),
    );
    expect(hotkeyRegistry.get('ctx-1')?.label).toBe('Ctx 1');

    unmount();
    expect(hotkeyRegistry.has('ctx-1')).toBe(false);

    pressKey('F4');
    expect(handler).not.toHaveBeenCalled();
  });

  it('registry chứa context + bindings trong lúc mounted (helper modal đọc)', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys('ctx-2', 'Modal A', bindingsFor(handler)));

    const ctx = hotkeyRegistry.get('ctx-2');
    expect(ctx).toBeDefined();
    expect(ctx?.bindings).toHaveLength(2);
    expect(ctx?.bindings[0]).toMatchObject({ key: 'F4', description: 'Lưu' });
  });

  it('StrictMode double-mount: registry còn đúng 1 entry, listener không double-fire', () => {
    const handler = vi.fn();
    // Mô phỏng StrictMode: mount → cleanup → mount lại cùng contextId
    const first = renderHook(() => useHotkeys('ctx-3', 'Strict', bindingsFor(handler)));
    first.unmount();
    renderHook(() => useHotkeys('ctx-3', 'Strict', bindingsFor(handler)));

    pressKey('F4');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(hotkeyRegistry.size).toBe(1);
  });

  it('bindings đổi (ví dụ modal open) → key set mới có hiệu lực', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ bs }: { bs: HotkeyBinding[] }) => useHotkeys('ctx-4', 'Dyn', bs),
      { initialProps: { bs: [] as HotkeyBinding[] } },
    );

    pressKey('F4');
    expect(handler).not.toHaveBeenCalled();

    rerender({ bs: bindingsFor(handler) });
    pressKey('F4');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('nhiều context cùng lúc → handler đúng context', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    renderHook(() => useHotkeys('ctx-a', 'A', bindingsFor(h1)));
    renderHook(() => useHotkeys('ctx-b', 'B', bindingsFor(h2)));

    pressKey('F4');
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
