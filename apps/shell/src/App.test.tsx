import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { initI18n, setRole } from "@hub-store/shared";
import { shellResources } from "./i18n";
import { signIn, signOut } from "./auth/session";
import App from "./App";

// jsdom realm vs jose node realm — mock auth crypto (session logic có test
// riêng ở session.test.ts, node env). Token format tự chế: fake.<payload64>.sig
vi.mock("@hub-store/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/shared")>();
  const encode = (payload: unknown) =>
    btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return {
    ...actual,
    signFakeJwt: async (payload: { sub: string; role: string }) =>
      `fake.${encode(payload)}.sig`,
    decodeFakeJwt: async (token: string) => {
      const [, payload64] = token.split(".");
      return JSON.parse(atob(payload64)) as unknown as ReturnType<
        typeof actual.decodeFakeJwt
      >;
    },
  };
});

function renderApp(initialPath = "/hub-store-order/order") {
  const i18n = initI18n({ resources: shellResources });
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  signOut();
  setRole(null);
});

afterEach(cleanup);

describe("App (shell)", () => {
  it("shows the login stub when there is no session", () => {
    renderApp();
    expect(screen.getByTestId("login-page")).toBeTruthy();
  });

  it("Coordinator sees all three nav items (D1 + D2 + Print)", async () => {
    await signIn("dev-user", "Coordinator");
    renderApp();
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.getByTestId("nav-orders")).toBeTruthy();
    expect(screen.getByTestId("nav-batch")).toBeTruthy();
    expect(screen.getByTestId("nav-print")).toBeTruthy();
  });

  it("WarehouseOps does NOT see the orders nav and gets 403 on /order", async () => {
    await signIn("nv-kho", "WarehouseOps");
    renderApp("/hub-store-order/order");
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.queryByTestId("nav-orders")).toBeNull();
    expect(screen.getByTestId("nav-batch")).toBeTruthy();
    expect(screen.getByTestId("nav-print")).toBeTruthy();
    expect(screen.getByTestId("forbidden")).toBeTruthy();
  });

  it("Manager sees all three nav items (role matrix §2)", async () => {
    await signIn("quanly", "Manager");
    renderApp("/hub-store-order/batch");
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.getByTestId("nav-orders")).toBeTruthy();
    expect(screen.getByTestId("nav-batch")).toBeTruthy();
    expect(screen.getByTestId("nav-print")).toBeTruthy();
  });

  it("renders remote-unavailable fallback instead of a white page", async () => {
    await signIn("dev-user", "Coordinator");
    renderApp("/hub-store-order/batch/print");
    // Lazy import của stub reject async → fallback xuất hiện sau microtask
    expect(await screen.findByText(/Remote không khả dụng/)).toBeTruthy();
  });

  it("renders 404 for unknown routes", async () => {
    await signIn("dev-user", "Manager");
    renderApp("/hub-store-order/unknown");
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.getByText("Không tìm thấy trang")).toBeTruthy();
  });

  it("header shows username + logout is available", async () => {
    await signIn("nv01", "Coordinator");
    renderApp();
    await waitFor(() => expect(screen.getByTestId("header-user")).toBeTruthy());
    expect(screen.getByTestId("header-user").textContent).toBe("nv01");
    expect(screen.getByTestId("logout-button")).toBeTruthy();
    expect(screen.getByTestId("role-switcher")).toBeTruthy();
    expect(screen.getByTestId("lang-toggle")).toBeTruthy();
  });
});
