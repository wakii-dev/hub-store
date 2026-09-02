/**
 * useUrlState — filter object ↔ URL query params, ROUTER-AGNOSTIC.
 *
 * KHÔNG phụ thuộc react-router-dom (shared không có dep đó). Dùng
 * window.location.search + history.replaceState — hoạt động bên dưới
 * BrowserRouter của shell vì replaceState không đụng router state
 * (SF-6/7 chỉ cần nhớ reload-keep-filter acceptance D1).
 *
 * SERIALIZATION (chốt): array = COMMA-JOINED vào MỘT param
 * (`shops=30201,30202`), KHÔNG phải repeated params. Lý do: đơn giản,
 * round-trip qua URLSearchParams.set/get là 1 dòng; constraint: giá trị
 * option KHÔNG được chứa dấu ',' (filter values là codes/ids — OK).
 *
 * Empty/absent semantics: param absent → về default khi parse (reload).
 * Set [] / '' → omit khỏi URL → reload về default.
 */
import { useCallback, useState } from 'react';

export type UrlStateValue = string | string[];

function parseFromSearch<T extends Record<string, UrlStateValue>>(
  search: string,
  defaults: T,
): T {
  const params = new URLSearchParams(search);
  const out: Record<string, UrlStateValue> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const raw = params.get(key);
    if (raw === null) continue;
    out[key] = Array.isArray(defaults[key]) ? raw.split(',') : raw;
  }
  return out as T;
}

function serializeToSearch(state: Record<string, UrlStateValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else if (value !== '' && value != null) {
      params.set(key, value);
    }
  }
  return params.toString();
}

/**
 * useUrlState<T>(defaults) → [state, setPartial].
 * setPartial merge partial filters vào state + URL (replaceState —
 * KHÔNG push history entry).
 */
export function useUrlState<T extends Record<string, UrlStateValue>>(
  defaults: T,
): readonly [T, (partial: Partial<T>) => void] {
  const [state, setState] = useState<T>(() =>
    parseFromSearch(window.location.search, defaults),
  );

  const setPartial = useCallback((partial: Partial<T>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      const qs = serializeToSearch(next);
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      );
      return next;
    });
  }, []);

  return [state, setPartial] as const;
}
