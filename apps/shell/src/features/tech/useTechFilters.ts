/**
 * useTechFilters — filter state màn tech (acceptance: filter đổi → URL đổi;
 * reload giữ filter). URL qua useUrlState (shared) + mirror sessionStorage:
 * nếu URL KHÔNG có param tech nào (VD: navigate từ nav sang rồi quay lại)
 * → phục hồi từ sessionStorage. Tab hiện tại là 1 param (`tab`).
 */
import { useCallback, useMemo, useRef } from 'react';
import { useUrlState, type UrlStateValue } from '@hub-store/shared';

export const TECH_TABS = ['delivery', 'installation', 'staff', 'map'] as const;
export type TechTab = (typeof TECH_TABS)[number];

const SESSION_KEY = 'hub-store.tech.filters';

/** URL keys — prefix d=delivery, i=installation, s=staff; tab dùng chung. */
export const TECH_FILTER_URL_DEFAULTS = {
  tab: 'delivery',
  dStatus: [] as string[],
  dDriver: '',
  dRegion: '',
  dProvince: '',
  dFrom: '',
  dTo: '',
  iStatus: [] as string[],
  iTech: '',
  iRegion: '',
  iProvince: '',
  iFrom: '',
  iTo: '',
  dPage: '1',
  iPage: '1',
  sDate: '',
} satisfies Record<string, UrlStateValue>;

export type TechFilterState = typeof TECH_FILTER_URL_DEFAULTS;

function readSession(): Partial<TechFilterState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, UrlStateValue> = {};
    for (const key of Object.keys(TECH_FILTER_URL_DEFAULTS)) {
      const value = parsed[key];
      if (typeof value === 'string') out[key] = value;
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        out[key] = value as string[];
      }
    }
    return out as Partial<TechFilterState>;
  } catch {
    return {};
  }
}

function hasTechParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return Object.keys(TECH_FILTER_URL_DEFAULTS).some((key) => params.get(key) !== null);
}

export function useTechFilters(): readonly [
  TechFilterState,
  (partial: Partial<TechFilterState>) => void,
  () => void,
] {
  // Init: URL ưu tiên; URL trống param tech → sessionStorage (seed defaults).
  const defaults = useMemo<typeof TECH_FILTER_URL_DEFAULTS>(() => {
    if (hasTechParams(window.location.search)) return TECH_FILTER_URL_DEFAULTS;
    return { ...TECH_FILTER_URL_DEFAULTS, ...readSession() };
  }, []);

  const [state, setState] = useUrlState(defaults);
  const stateRef = useRef(state);
  stateRef.current = state;

  const setFilters = useCallback(
    (partial: Partial<TechFilterState>) => {
      const merged = { ...stateRef.current, ...partial };
      stateRef.current = merged;
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(merged));
      } catch {
        // sessionStorage đầy/blocked — URL vẫn nguồn chính, bỏ qua.
      }
      setState(partial);
    },
    [setState],
  );

  const resetFilters = useCallback(() => {
    setFilters(TECH_FILTER_URL_DEFAULTS);
  }, [setFilters]);

  return [state, setFilters, resetFilters] as const;
}

/** Tab an toàn — giá trị lạ về 'delivery'. */
export function parseTab(raw: string): TechTab {
  return (TECH_TABS as readonly string[]).includes(raw) ? (raw as TechTab) : 'delivery';
}
