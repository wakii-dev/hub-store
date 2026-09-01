// @vitest-environment node
// Node env — lý do xem session.test.ts (jose realm). localStorage stub giống hệt.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAxiosInstance, setTokenGetter } from "@hub-store/api-client";
import { signIn, signOut } from "./session";

const store = new Map<string, string>();
const localStorageStub: Storage = {
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
  getItem: (k: string) => store.get(k) ?? null,
  key: (i: number) => [...store.keys()][i] ?? null,
  removeItem: (k: string) => void store.delete(k),
  setItem: (k: string, v: string) => void store.set(k, v),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageStub,
  configurable: true,
  writable: true,
});

/** Token-getter registration (spec §2 SF-6): shell đăng ký lúc init — request
 * axios/RTK-Query tự mang Bearer token, KHÔNG context xuyên MF boundary. */
describe("setTokenGetter + session", () => {
  afterEach(() => {
    setTokenGetter(() => null);
    signOut();
    vi.restoreAllMocks();
  });

  it("interceptor attaches Bearer token from the session to every request", async () => {
    const { token } = await signIn("dev-user", "Coordinator");
    setTokenGetter(() => {
      // mirror main.tsx wiring
      const raw = localStorage.getItem("hub-store.session");
      return raw ? (JSON.parse(raw) as { token: string }).token : null;
    });

    const instance = getAxiosInstance();
    const adapter = vi.fn((config: { headers: { get: (k: string) => string } }) => {
      void config;
      return Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config });
    });
    // @ts-expect-error — test-only adapter override
    instance.defaults.adapter = adapter;

    await instance.get("/fulfillment/filter");
    expect(adapter).toHaveBeenCalledTimes(1);
    const sentConfig = adapter.mock.calls[0][0] as {
      headers: { get: (k: string) => string | string[] };
    };
    const auth = sentConfig.headers.get("Authorization");
    expect(String(auth)).toBe(`Bearer ${token}`);
  });

  it("no session → no Authorization header", async () => {
    signOut();
    setTokenGetter(() => null);
    const instance = getAxiosInstance();
    const adapter = vi.fn((config: unknown) =>
      Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config }),
    );
    // @ts-expect-error — test-only adapter override
    instance.defaults.adapter = adapter;
    await instance.get("/healthz");
    const sentConfig = adapter.mock.calls[0][0] as {
      headers: { get: (k: string) => string | string[] | undefined };
    };
    expect(sentConfig.headers.get("Authorization")).toBeUndefined();
  });
});
