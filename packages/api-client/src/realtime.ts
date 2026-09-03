/**
 * Realtime SSE hook (SF-10 / FI-255 Task 3) — the FE half of the BFF
 * `GET /events` stream. One EventSource per hook instance; each matching
 * `{type, payload, ts}` message dispatches `api.util.invalidateTags(tags)`
 * so RTKQ list queries refetch.
 *
 * Auth: EventSource cannot set headers, the BFF accepts the access token via
 * the `access_token` query param (auth.ts — /events only). The token comes
 * from a `tokenGetter` param (the shell registers its oidc getter with
 * setTokenGetter for axios; that module-level getter has no reader, so the
 * caller passes the same fn here).
 *
 * Status: 'connected' once the stream opens, 'offline' on error. 'polling' is
 * reserved for Task 5 (fallback polling after consecutive connect failures —
 * the failure counter below is the scaffold it extends). Reconnect itself is
 * native EventSource behavior (onerror fires per failed attempt, onopen fires
 * again on success, which resets the counter).
 */
import { useEffect, useRef, useState } from 'react';

// ---- Types -------------------------------------------------------------------

export type RealtimeStatus = 'connected' | 'polling' | 'offline';

/** Envelope pushed by the BFF SSE route (Task 1 contract). */
export interface RealtimeEvent {
  type: string;
  payload: unknown;
  ts: string;
}

/**
 * Minimal structural slice of an RTKQ api slice. `any` on purpose: the hook is
 * generic across the consuming app's concrete slice + typed dispatch, and a
 * strict signature (unknown params) would fail contravariance against RTKQ's
 * typed `invalidateTags`.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type RealtimeApiSlice = { util: { invalidateTags: (tags: any) => any } };

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type RealtimeDispatch = (action: any) => any;

export interface UseRealtimeEventsOptions {
  /** RTKQ api slice whose cache should be invalidated (federation singleton). */
  api: RealtimeApiSlice;
  /** Tags passed to invalidateTags on every matching event. */
  invalidationTags: readonly unknown[];
  /** Only react to these event types; default = all. */
  eventTypes?: readonly string[];
  /** Returns the Keycloak access token for the `?access_token=` param. */
  tokenGetter?: () => string | null;
}

/** Subset of the EventSource surface the stream controller relies on. */
export interface RealtimeEventSourceLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data?: unknown }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export type RealtimeEventSourceCtor = new (url: string) => RealtimeEventSourceLike;

export interface CreateRealtimeStreamOptions extends UseRealtimeEventsOptions {
  /** Where the token is attached (defaults to the app dispatch if provided). */
  dispatch?: RealtimeDispatch;
  /** Status changes (connected/offline — 'polling' arrives with Task 5). */
  onStatus?: (status: RealtimeStatus) => void;
  /** Test seam — defaults to globalThis.EventSource. */
  EventSourceImpl?: RealtimeEventSourceCtor;
}

export interface RealtimeStream {
  connect(): void;
  close(): void;
  getStatus(): RealtimeStatus;
  /** Consecutive connect failures — scaffold for Task 5 fallback polling. */
  getConnectFailures(): number;
}

// ---- API base (same resolution as baseQuery.ts) -------------------------------

type ViteEnv = { VITE_API_BASE_URL?: string } & Record<string, string | undefined>;
const env = (import.meta as unknown as { env?: ViteEnv }).env ?? {};
const API_BASE = env.VITE_API_BASE_URL ?? 'http://localhost:8080';

function globalEventSource(): RealtimeEventSourceCtor | undefined {
  return (globalThis as { EventSource?: RealtimeEventSourceCtor }).EventSource;
}

// ---- Stream controller (framework-free — unit-testable without a renderer) ----

export function createRealtimeStream(options: CreateRealtimeStreamOptions): RealtimeStream {
  const { api, invalidationTags, eventTypes, tokenGetter, dispatch, onStatus, EventSourceImpl } =
    options;

  let status: RealtimeStatus = 'offline';
  let connectFailures = 0;
  let source: RealtimeEventSourceLike | null = null;

  function setStatus(next: RealtimeStatus): void {
    status = next;
    onStatus?.(next);
  }

  function handleMessage(raw: unknown): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(String((raw as { data?: unknown }).data)) as RealtimeEvent;
    } catch {
      return; // non-JSON frame — ignore
    }
    if (!event || typeof event.type !== 'string') return;
    if (eventTypes && !eventTypes.includes(event.type)) return;
    dispatch?.(api.util.invalidateTags([...invalidationTags]));
  }

  return {
    connect() {
      if (source) return; // idempotent — one connection per stream instance
      const Ctor = EventSourceImpl ?? globalEventSource();
      if (!Ctor) {
        // No EventSource (SSR/node) — count as a failed connect (Task 5 scaffold).
        connectFailures += 1;
        setStatus('offline');
        return;
      }
      const token = tokenGetter?.() ?? null;
      const query = token ? `?access_token=${encodeURIComponent(token)}` : '';
      const es = new Ctor(`${API_BASE}/events${query}`);
      source = es;
      es.onopen = () => {
        connectFailures = 0;
        setStatus('connected');
      };
      es.onmessage = (ev) => handleMessage(ev);
      es.onerror = () => {
        connectFailures += 1;
        // TODO(Task 5): >2 consecutive failures → switch to polling mode.
        setStatus('offline');
      };
    },

    close() {
      if (!source) return;
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      source.close();
      source = null;
      setStatus('offline');
    },

    getStatus: () => status,
    getConnectFailures: () => connectFailures,
  };
}

// ---- React hook ---------------------------------------------------------------

/**
 * Mount-once hook: opens the SSE stream, invalidates `invalidationTags` on
 * every matching event, returns the connection status. Cleanup on unmount
 * closes the EventSource. One EventSource per hook instance; StrictMode's
 * double-invoke is safe (cleanup closes the first connection before remount).
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('offline');
  // Latest-options ref: options identity changes per render must NOT reconnect.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const stream = createRealtimeStream({ ...optionsRef.current, onStatus: setStatus });
    stream.connect();
    return () => stream.close();
  }, []);

  return status;
}
