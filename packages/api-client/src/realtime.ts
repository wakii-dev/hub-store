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
 * Status: 'connected' once the stream opens, 'offline' on error, 'polling'
 * when the fallback state machine kicks in. Transient drops (after a
 * successful open) are handled by EventSource's native reconnect — onopen
 * fires again on success, which resets the counter. Fatal connect failures
 * (e.g. an expired token: the BFF answers 401 and EventSource gives up
 * permanently, no native retry) are handled by a manual reconnect that
 * re-reads `tokenGetter` for a FRESH token. After more than
 * MAX_SSE_FAILURES consecutive failures without a successful (re)open, the
 * stream degrades to 30s fallback polling (invalidateTags on an interval)
 * while a background timer retries SSE every SSE_RETRY_INTERVAL_MS; the
 * moment SSE opens again, polling stops and the counter resets. The BFF can
 * also push a synthetic `stream.degraded` event (its Kafka consumer died) —
 * that counts as one failure toward polling and is never forwarded to the app.
 */
import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';

// ---- Types -------------------------------------------------------------------

/**
 * Tunables for the fallback state machine (exported so tests can read/assert
 * against them and hosts could tune via a wrapper if ever needed).
 */
export const POLL_INTERVAL_MS = 30_000;
export const SSE_RETRY_INTERVAL_MS = 60_000;
export const MAX_SSE_FAILURES = 2;
/** Delay between manual reconnects after a fatal connect failure (fresh token). */
export const RECONNECT_DELAY_MS = 3_000;

/** Synthetic BFF event — the BFF's Kafka consumer died; stream is degraded. */
const DEGRADED_EVENT_TYPE = 'stream.degraded';

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
  /**
   * Redux dispatch used to dispatch `invalidateTags`. Optional override
   * (tests); defaults to the app store's dispatch via `useDispatch` — the
   * bridges are mounted inside the remote's `<Provider>` (store per-remote,
   * spec §2).
   */
  dispatch?: RealtimeDispatch;
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
  /** Status changes (connected / polling / offline). */
  onStatus?: (status: RealtimeStatus) => void;
  /** Test seam — defaults to globalThis.EventSource. */
  EventSourceImpl?: RealtimeEventSourceCtor;
}

export interface RealtimeStream {
  connect(): void;
  close(): void;
  getStatus(): RealtimeStatus;
  /** Consecutive connect failures (reset on every successful open). */
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
  /** Whether the current source ever reached onopen (fatal-failure heuristic). */
  let sourceOpened = false;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function setStatus(next: RealtimeStatus): void {
    status = next;
    onStatus?.(next);
  }

  function closeSource(): void {
    if (!source) return;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.close();
    source = null;
  }

  function clearTimers(): void {
    if (pollingTimer !== null) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    if (retryTimer !== null) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function countFailure(): void {
    connectFailures += 1;
    // >MAX consecutive failures without a successful open → degrade to polling.
    if (connectFailures > MAX_SSE_FAILURES && pollingTimer === null) enterPollingMode();
  }

  /** Fallback mode: invalidate on an interval, retry SSE in the background. */
  function enterPollingMode(): void {
    closeSource(); // stop native reconnect churn — one fresh attempt per retry tick
    pollingTimer = setInterval(() => {
      dispatch?.(api.util.invalidateTags([...invalidationTags]));
    }, POLL_INTERVAL_MS);
    retryTimer = setInterval(() => {
      closeSource();
      openConnection();
    }, SSE_RETRY_INTERVAL_MS);
    setStatus('polling');
  }

  function openConnection(): void {
    const Ctor = EventSourceImpl ?? globalEventSource();
    if (!Ctor) {
      // No EventSource (SSR/node) — count as a failed connect.
      connectFailures += 1;
      if (pollingTimer === null) setStatus('offline');
      return;
    }
    const token = tokenGetter?.() ?? null;
    const query = token ? `?access_token=${encodeURIComponent(token)}` : '';
    const es = new Ctor(`${API_BASE}/events${query}`);
    source = es;
    sourceOpened = false;
    es.onopen = () => {
      // SSE is back (first connect, native reconnect, or polling-mode retry):
      // stop fallback polling and reset the failure counter.
      sourceOpened = true;
      clearTimers();
      connectFailures = 0;
      setStatus('connected');
    };
    es.onmessage = (ev) => handleMessage(ev);
    es.onerror = () => {
      // Transient (after a successful open): EventSource keeps retrying
      // natively; each error without a subsequent open counts as one failure
      // toward the polling threshold.
      countFailure();
      if (pollingTimer === null) setStatus('offline');
      // Fatal connect failure (error WITHOUT a prior open — e.g. expired
      // token: the BFF 401s and EventSource gives up permanently, no native
      // retry). Close the source and schedule a manual reconnect that
      // re-reads tokenGetter for a FRESH token — bounded by the same failure
      // counter (past MAX_SSE_FAILURES the polling state machine takes over;
      // its retry tick also re-reads the token on every openConnection).
      if (source === es && !sourceOpened && pollingTimer === null) {
        closeSource();
        scheduleReconnect();
      }
    };
  }

  /** One-shot manual reconnect after a fatal connect failure (fresh token). */
  function scheduleReconnect(): void {
    if (pollingTimer !== null || reconnectTimer !== null) return;
    if (connectFailures > MAX_SSE_FAILURES) return; // polling mode handles retries
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (source === null) openConnection();
    }, RECONNECT_DELAY_MS);
  }

  function handleMessage(raw: unknown): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(String((raw as { data?: unknown }).data)) as RealtimeEvent;
    } catch {
      return; // non-JSON frame — ignore
    }
    if (!event || typeof event.type !== 'string') return;
    if (event.type === DEGRADED_EVENT_TYPE) {
      // BFF control signal — its Kafka consumer died. One failure toward the
      // polling threshold; never invalidated, never forwarded to the app.
      countFailure();
      return;
    }
    if (eventTypes && !eventTypes.includes(event.type)) return;
    dispatch?.(api.util.invalidateTags([...invalidationTags]));
  }

  return {
    connect() {
      if (source) return; // idempotent — one connection per stream instance
      openConnection();
    },

    close() {
      const hadConnection = source !== null;
      clearTimers();
      closeSource();
      if (hadConnection) setStatus('offline');
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
 *
 * The dispatch for `invalidateTags` resolves from the Redux context
 * (`useDispatch` — must be rendered inside the remote's `<Provider>`);
 * an explicit `options.dispatch` overrides it (tests).
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions): RealtimeStatus {
  const appDispatch = useDispatch() as unknown as RealtimeDispatch;
  const [status, setStatus] = useState<RealtimeStatus>('offline');
  // Latest-options ref: options identity changes per render must NOT reconnect.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const stream = createRealtimeStream({
      ...optionsRef.current,
      dispatch: optionsRef.current.dispatch ?? appDispatch,
      onStatus: setStatus,
    });
    stream.connect();
    return () => stream.close();
    // appDispatch is stable for a given store — a change means the store
    // itself changed, so reconnecting (with the new dispatch) is correct.
  }, [appDispatch]);

  return status;
}
