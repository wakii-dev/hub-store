// @vitest-environment node
// Node env (KHÔNG jsdom): jose + TextEncoder cùng realm node — jsdom realm
// làm HS256 sign/verify fail instanceof check. session.ts chỉ cần localStorage.
import { beforeEach, describe, expect, it } from "vitest";
import { decodeFakeJwt } from "@hub-store/shared";
import {
  getSession,
  getSessionToken,
  restoreSession,
  signIn,
  signOut,
  switchRole,
} from "./session";

// Minimal localStorage stub — node env không có sẵn.
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

beforeEach(() => {
  localStorage.clear();
  signOut();
});

describe("auth session (SF-6 stub)", () => {
  it("signIn signs a fake JWT {sub, role} and persists the session", async () => {
    const session = await signIn("dev-user", "Coordinator");
    expect(session.token.split(".")).toHaveLength(3);
    const decoded = await decodeFakeJwt(session.token);
    expect(decoded.sub).toBe("dev-user");
    expect(decoded.role).toBe("Coordinator");
    expect(getSession()?.role).toBe("Coordinator");
    expect(getSessionToken()).toBe(session.token);
  });

  it("restoreSession accepts a valid token and re-arms the role store", async () => {
    await signIn("nv01", "WarehouseOps");
    const restored = await restoreSession();
    expect(restored?.sub).toBe("nv01");
    expect(restored?.role).toBe("WarehouseOps");
  });

  it("restoreSession clears an expired token (back to login)", async () => {
    // Ký token ĐÃ hết hạn (expiresIn âm) rồi tự ghi vào storage.
    const { signFakeJwt } = await import("@hub-store/shared");
    const expired = await signFakeJwt({ sub: "nv01", role: "Manager" }, { expiresIn: -10 });
    localStorage.setItem(
      "hub-store.session",
      JSON.stringify({ token: expired, sub: "nv01", role: "Manager" }),
    );
    const restored = await restoreSession();
    expect(restored).toBeNull();
    expect(getSession()).toBeNull();
  });

  it("restoreSession clears a tampered session (role mismatch)", async () => {
    await signIn("nv01", "Coordinator");
    const raw = JSON.parse(localStorage.getItem("hub-store.session")!) as { role: string };
    raw.role = "Manager"; // sửa localStorage sau khi ký
    localStorage.setItem("hub-store.session", JSON.stringify(raw));
    expect(await restoreSession()).toBeNull();
  });

  it("switchRole re-signs the token with the same sub and new role", async () => {
    await signIn("nv01", "Coordinator");
    const switched = await switchRole("WarehouseOps");
    const decoded = await decodeFakeJwt(switched.token);
    expect(decoded.sub).toBe("nv01");
    expect(decoded.role).toBe("WarehouseOps");
    expect(await restoreSession()).not.toBeNull();
  });

  it("signOut clears the session and token", async () => {
    await signIn("nv01", "Manager");
    signOut();
    expect(getSession()).toBeNull();
    expect(getSessionToken()).toBeNull();
    expect(await restoreSession()).toBeNull();
  });
});
