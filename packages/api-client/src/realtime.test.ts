/**
 * Realtime SSE hook tests (SF-10 / FI-255 Task 3). Node-env vitest (package
 * convention — no jsdom/testing-library in this package), so:
 * - EventSource is faked with a small class (records url/handlers/close).
 * - The React hook runs against a minimal fake-hooks harness installed via
 *   vi.mock('react') — enough to exercise mount/effect/unmount + state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRealtimeStream,
  useRealtimeEvents,
  type CreateRealtimeStreamOptions,
  type RealtimeEventSourceLike,
  type RealtimeStatus,
} from './realtime';

// ---- Fake EventSource ---------------------------------------------------------

class FakeEventSource implements RealtimeEventSourceLike {
  static instances: FakeEventSource[] = [];

  url: string;
  readyState = 0; // CONNECTING
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data?: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2; // CLOSED
  }

  // test drivers
  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }
  message(event: unknown): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  raw(data: string): void {
    this.onmessage?.({ data });
  }
  fail(): void {
    this.onerror?.();
  }
}

const lastSource = (): FakeEventSource => FakeEventSource.instances.at(-1)!;

// ---- Fake React hooks harness --------------------------------------------------
// vi.mock('react') installs these; renderHook() runs the real hook body, runs
// effects after "mount", and unmount() runs cleanups. The hook has a single
// state slot, a single ref and one []-dep effect, so no dep-comparison needed.

type FakeHooks = {
  useState: (init: unknown) => [unknown, (v: unknown) => void];
  useRef: (init: unknown) => { current: unknown };
  useEffect: (create: () => (() => void) | void, deps?: unknown[]) => void;
};

const harness = vi.hoisted(() => ({ current: null as FakeHooks | null }));

vi.mock('react', () => ({
  useState: (...args: Parameters<NonNullable<typeof harness.current>['useState']>) =>
    harness.current!.useState(...args),
  useRef: (...args: Parameters<NonNullable<typeof harness.current>['useRef']>) =>
    harness.current!.useRef(...args),
  useEffect: (...args: Parameters<NonNullable<typeof harness.current>['useEffect']>) =>
    harness.current!.useEffect(...args),
}));

interface HookRuntime {
  /** Re-runs the hook body (effects stay mounted); returns latest status. */
  rerender: () => RealtimeStatus;
  /** Runs effect cleanups (the hook's unmount path). */
  unmount: () => void;
}

function renderHook(render: () => RealtimeStatus): { runtime: HookRuntime; status: RealtimeStatus } {
  const stateSlot: { value: unknown } = { value: undefined };
  const refSlot: { current: unknown } = { current: undefined };
  const effects: { create: () => (() => void) | void; hasRun: boolean; cleanup?: () => void }[] = [];
  let mounted = true;

  harness.current = {
    useState(init: unknown) {
      if (stateSlot.value === undefined) stateSlot.value = init;
      const setState = (v: unknown) => {
        stateSlot.value = v;
      };
      return [stateSlot.value, setState];
    },
    useRef(init: unknown) {
      if (refSlot.current === undefined) refSlot.current = { current: init };
      return refSlot.current as { current: unknown };
    },
    useEffect(create: () => (() => void) | void) {
      if (!effects[0]) effects[0] = { create, hasRun: false };
      const def = effects[0];
      def.create = create;
      if (!def.hasRun && mounted) {
        def.hasRun = true;
        def.cleanup = def.create() ?? undefined;
      }
    },
  };

  const run = (): RealtimeStatus => render();
  return { status: run(), runtime: { rerender: run, unmount() { mounted = false; for (const d of effects) d.cleanup?.(); } } };
}

// ---- Shared stubs --------------------------------------------------------------

const TAGS = [{ type: 'Fulfillment', id: 'LIST' }];

function baseOptions(overrides: Partial<CreateRealtimeStreamOptions> = {}) {
  const invalidateTags = vi.fn((tags: unknown) => ({ type: 'invalidateTags', payload: tags }));
  const api = { util: { invalidateTags } };
  const dispatch = vi.fn();
  const options: CreateRealtimeStreamOptions = {
    api,
    invalidationTags: TAGS,
    EventSourceImpl: FakeEventSource as unknown as new (url: string) => RealtimeEventSourceLike,
    dispatch,
    ...overrides,
  };
  return { options, api, invalidateTags, dispatch };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
});

afterEach(() => {
  delete (globalThis as { EventSource?: unknown }).EventSource;
  harness.current = null;
});

describe('createRealtimeStream', () => {
  it('connects to ${API_BASE}/events with the access_token query param', () => {
    const { options } = baseOptions({ tokenGetter: () => 'tok-123' });
    createRealtimeStream(options).connect();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(lastSource().url).toBe('http://localhost:8080/events?access_token=tok-123');
  });

  it('is idempotent — connect() twice keeps a single EventSource', () => {
    const { options } = baseOptions();
    const stream = createRealtimeStream(options);
    stream.connect();
    stream.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('emits connected on open and offline on error, counting failures (Task 5 scaffold)', () => {
    const statuses: RealtimeStatus[] = [];
    const { options } = baseOptions({ onStatus: (s) => statuses.push(s) });
    const stream = createRealtimeStream(options);
    expect(stream.getStatus()).toBe('offline');
    stream.connect();
    lastSource().open();
    expect(stream.getStatus()).toBe('connected');
    expect(stream.getConnectFailures()).toBe(0);
    lastSource().fail();
    expect(statuses).toEqual(['connected', 'offline']);
    expect(stream.getStatus()).toBe('offline');
    expect(stream.getConnectFailures()).toBe(1);
    // native reconnect success resets the failure counter
    lastSource().open();
    expect(stream.getConnectFailures()).toBe(0);
    expect(stream.getStatus()).toBe('connected');
  });

  it('dispatches invalidateTags for a matching message', () => {
    const { options, invalidateTags, dispatch } = baseOptions();
    createRealtimeStream(options).connect();
    lastSource().open();
    lastSource().message({ type: 'order.assigned', payload: { code: 'DH-1' }, ts: '2026-09-03T00:00:00Z' });
    expect(invalidateTags).toHaveBeenCalledTimes(1);
    expect(invalidateTags).toHaveBeenCalledWith(TAGS);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does NOT dispatch for non-matching message types when eventTypes is set', () => {
    const { options, invalidateTags } = baseOptions({ eventTypes: ['order.assigned', 'batch.created'] });
    createRealtimeStream(options).connect();
    lastSource().open();
    lastSource().message({ type: 'order.cancelled', payload: {}, ts: '2026-09-03T00:00:00Z' });
    lastSource().message({ type: 'batch.created', payload: {}, ts: '2026-09-03T00:00:00Z' });
    expect(invalidateTags).toHaveBeenCalledTimes(1);
  });

  it('forwards all types when no filter is given, and ignores non-JSON frames', () => {
    const { options, invalidateTags } = baseOptions();
    createRealtimeStream(options).connect();
    lastSource().open();
    lastSource().raw('not-json{{');
    lastSource().message({ type: 'a', payload: null, ts: 't' });
    lastSource().message({ type: 'b', payload: null, ts: 't' });
    expect(invalidateTags).toHaveBeenCalledTimes(2);
  });

  it('close() closes the EventSource, detaches handlers and goes offline', () => {
    const { options } = baseOptions();
    const stream = createRealtimeStream(options);
    stream.connect();
    const es = lastSource();
    es.open();
    stream.close();
    expect(es.closed).toBe(true);
    expect(es.onopen).toBeNull();
    expect(es.onmessage).toBeNull();
    expect(es.onerror).toBeNull();
    expect(stream.getStatus()).toBe('offline');
  });

  it('counts a failed connect when EventSource is unavailable (node/SSR)', () => {
    delete (globalThis as { EventSource?: unknown }).EventSource;
    const { options } = baseOptions({ EventSourceImpl: undefined });
    const stream = createRealtimeStream(options);
    stream.connect();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(stream.getConnectFailures()).toBe(1);
    expect(stream.getStatus()).toBe('offline');
  });
});

describe('useRealtimeEvents', () => {
  function mountHook(overrides: Partial<CreateRealtimeStreamOptions> = {}) {
    const { options, invalidateTags } = baseOptions(overrides);
    const { runtime, status } = renderHook(() => useRealtimeEvents(options));
    return { options, invalidateTags, runtime, initialStatus: status };
  }

  it('starts offline, transitions to connected on open, and dispatches on matching events', () => {
    const { invalidateTags, runtime, initialStatus } = mountHook({ eventTypes: ['order.assigned'] });
    expect(initialStatus).toBe('offline');
    const es = lastSource();
    expect(es.url).toBe('http://localhost:8080/events'); // no tokenGetter → no query
    es.open();
    es.message({ type: 'order.assigned', payload: {}, ts: 't' });
    es.message({ type: 'order.cancelled', payload: {}, ts: 't' }); // filtered out
    expect(runtime.rerender()).toBe('connected');
    expect(invalidateTags).toHaveBeenCalledTimes(1);
  });

  it('passes the token from tokenGetter in the EventSource URL', () => {
    mountHook({ tokenGetter: () => 'abc.def' });
    expect(lastSource().url).toBe('http://localhost:8080/events?access_token=abc.def');
  });

  it('cleans up on unmount — effect cleanup closes the EventSource', () => {
    const { runtime } = mountHook();
    const es = lastSource();
    es.open();
    runtime.unmount();
    expect(es.closed).toBe(true);
    expect(es.onopen).toBeNull();
    expect(es.onmessage).toBeNull();
    expect(es.onerror).toBeNull();
  });
});
