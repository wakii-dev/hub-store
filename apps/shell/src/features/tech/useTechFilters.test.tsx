import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { parseTab, TECH_FILTER_URL_DEFAULTS, useTechFilters } from './useTechFilters';

function resetUrl() {
  window.history.replaceState(null, '', '/hub-store-order/tech');
  sessionStorage.clear();
}

describe('useTechFilters — filter lưu URL + sessionStorage (acceptance reload giữ filter)', () => {
  beforeEach(resetUrl);

  it('mặc định: tab=delivery, các filter rỗng', () => {
    const { result } = renderHook(() => useTechFilters());
    expect(result.current[0]).toEqual(TECH_FILTER_URL_DEFAULTS);
  });

  it('setFilters → URL đổi (acceptance: filter đổi → URL đổi)', () => {
    const { result } = renderHook(() => useTechFilters());
    act(() => result.current[1]({ tab: 'installation', dStatus: ['NEW', 'SHIPPING'] }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('tab')).toBe('installation');
    expect(params.get('dStatus')).toBe('NEW,SHIPPING');
    // mirror sessionStorage
    expect(JSON.parse(sessionStorage.getItem('hub-store.tech.filters') ?? '{}').tab).toBe(
      'installation',
    );
  });

  it('URL có sẵn param → init từ URL (reload giữ)', () => {
    window.history.replaceState(null, '', '/hub-store-order/tech?tab=staff&sDate=2026-09-02');
    const { result } = renderHook(() => useTechFilters());
    expect(result.current[0].tab).toBe('staff');
    expect(result.current[0].sDate).toBe('2026-09-02');
  });

  it('URL không có param tech → phục hồi từ sessionStorage', () => {
    sessionStorage.setItem(
      'hub-store.tech.filters',
      JSON.stringify({ tab: 'installation', iTech: 'KTV-001' }),
    );
    const { result } = renderHook(() => useTechFilters());
    expect(result.current[0].tab).toBe('installation');
    expect(result.current[0].iTech).toBe('KTV-001');
  });

  it('URL ưu tiên hơn sessionStorage', () => {
    sessionStorage.setItem('hub-store.tech.filters', JSON.stringify({ tab: 'staff' }));
    window.history.replaceState(null, '', '/hub-store-order/tech?tab=delivery');
    const { result } = renderHook(() => useTechFilters());
    expect(result.current[0].tab).toBe('delivery');
  });

  it('resetFilters → về defaults + URL sạch', () => {
    const { result } = renderHook(() => useTechFilters());
    act(() => result.current[1]({ tab: 'staff', sDate: '2026-09-02' }));
    act(() => result.current[2]());
    expect(result.current[0]).toEqual(TECH_FILTER_URL_DEFAULTS);
    // useUrlState serialize mọi giá trị non-empty (kể cả defaults) — khớp
    // convention D1 (?page=1 cũng xuất hiện trong URL).
    expect(window.location.search).toBe('?tab=delivery&dPage=1&iPage=1');
  });
});

describe('parseTab', () => {
  it('tab hợp lệ giữ; tab lạ về delivery', () => {
    expect(parseTab('installation')).toBe('installation');
    expect(parseTab('hacker')).toBe('delivery');
  });
});
