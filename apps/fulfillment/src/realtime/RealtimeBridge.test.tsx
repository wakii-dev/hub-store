/**
 * RealtimeBridge tests (SF-10 T4, D2) — EventSource fake theo pattern của
 * packages/api-client realtime.test.ts: bridge mount mở ĐÚNG 1 stream /events,
 * gắn ?access_token= khi shell đã đăng ký tokenGetter (MF singleton), close
 * sạch khi unmount.
 */
import { cleanup, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore, setTokenGetter } from "@hub-store/api-client";
import RealtimeBridge from "./RealtimeBridge";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
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
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeEventSource.instances = [];
});

describe("RealtimeBridge (fulfillment)", () => {
  it("mount mở 1 stream /events và close khi unmount", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const { unmount } = render(
      <Provider store={createAppStore()}>
        <RealtimeBridge />
      </Provider>,
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain("/events");
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("token đã đăng ký → URL chứa access_token (getStoredToken → getter shell)", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    setTokenGetter(() => "tok-123");
    render(
      <Provider store={createAppStore()}>
        <RealtimeBridge />
      </Provider>,
    );
    expect(FakeEventSource.instances[0].url).toContain("access_token=tok-123");
  });
});
