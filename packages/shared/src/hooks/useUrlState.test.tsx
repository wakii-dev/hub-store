import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUrlState } from './useUrlState';

// type alias (KHÔNG interface) — cần implicit index signature cho generic constraint
type TestFilters = {
  code: string;
  shops: string[];
}

const DEFAULTS: TestFilters = { code: '', shops: [] };

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useUrlState', () => {
  it('init: param absent → default', () => {
    window.history.replaceState(null, '', '/?other=1');
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    expect(result.current[0]).toEqual({ code: '', shops: [] });
  });

  it('init: URL hiện có → state parse đúng (string + comma-joined array)', () => {
    window.history.replaceState(null, '', '/?code=ORD-1&shops=30201%2C30202');
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    expect(result.current[0]).toEqual({ code: 'ORD-1', shops: ['30201', '30202'] });
  });

  it('round-trip: setPartial → URL string → hook mới parse lại = state', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    act(() => result.current[1]({ code: 'ORD-9', shops: ['30201', '30202', '30203'] }));

    // set → URL string (array = comma-joined, 1 param)
    expect(window.location.search).toBe('?code=ORD-9&shops=30201%2C30202%2C30203');

    // URL → state (hook instance mới đọc lại URL)
    const second = renderHook(() => useUrlState(DEFAULTS));
    expect(second.result.current[0]).toEqual({
      code: 'ORD-9',
      shops: ['30201', '30202', '30203'],
    });
  });

  it('setPartial merge partial — key không nhắc giữ nguyên', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    act(() => result.current[1]({ code: 'ORD-1' }));
    act(() => result.current[1]({ shops: ['A'] }));
    expect(result.current[0]).toEqual({ code: 'ORD-1', shops: ['A'] });
    expect(window.location.search).toBe('?code=ORD-1&shops=A');
  });

  it('set [] / \'\' → omit khỏi URL → reload về default', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    act(() => result.current[1]({ code: 'ORD-1', shops: ['A'] }));
    act(() => result.current[1]({ code: '', shops: [] }));
    expect(window.location.search).toBe('');

    const second = renderHook(() => useUrlState(DEFAULTS));
    expect(second.result.current[0]).toEqual({ code: '', shops: [] });
  });
});
