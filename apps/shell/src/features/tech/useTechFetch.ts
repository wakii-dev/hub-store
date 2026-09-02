/**
 * useTechFetch — fetch hook tối thiểu cho shell screen (không RTKQ):
 * isLoading lần đầu, isFetching các lần sau (reskin mờ theo SF-6 §3 —
 * không skeleton toàn trang khi refetch), error message, refetch.
 * Stale-guard qua sequence ref — response cũ không ghi đè response mới.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TechFetchResult<T> {
  data: T | null;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTechFetch<T>(fn: () => Promise<T>, deps: unknown[]): TechFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [fetching, setFetching] = useState(true);
  const seqRef = useRef(0);
  // fn giữ qua ref để không làm re-run deps phía caller phải memo hàm.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    const seq = ++seqRef.current;
    setFetching(true);
    fnRef
      .current()
      .then((result) => {
        if (seqRef.current !== seq) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (seqRef.current !== seq) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (seqRef.current !== seq) return;
        setLoadingFirst(false);
        setFetching(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, isLoading: loadingFirst, isFetching: fetching, error, refetch: run };
}
