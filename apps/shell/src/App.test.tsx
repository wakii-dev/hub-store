import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { initI18n, setRole } from "@hub-store/shared";
import { shellResources } from "./i18n";
import App from "./App";

// SF-4: session thật = OIDC UserManager (Keycloak) — trong unit test mock
// module auth/oidc với user điều khiển được. Flow redirect/callback THẬT là
// integration với Keycloak — phủ bởi E2E auth.setup (login UI thật).
const state = vi.hoisted(() => ({
  user: null as { profile: { preferred_username?: string; sub?: string; realm_access?: { roles: string[] } } } | null,
}));

vi.mock("./auth/oidc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth/oidc")>();
  const { setRole } = await import("@hub-store/shared");
  return {
    ...actual,
    loadCurrentUser: async () => {
      // thực thi setCurrentUser thật: role store (federation singleton) phải
      // được cập nhật thì usePermissions thấy đúng role.
      setRole(state.user ? actual.mapRole(state.user.profile) : null);
      return state.user;
    },
    onSessionChange: () => {},
    signinRedirect: async () => {},
    signoutRedirect: async () => {},
    registerTokenGetter: () => {},
    installUnauthorizedInterceptor: () => {},
  };
});

function setCurrentUser(username: string, role: string) {
  state.user = {
    profile: {
      preferred_username: username,
      realm_access: { roles: ["default-roles-hubstore", role] },
    },
  } as NonNullable<typeof state.user>;
}

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
  state.user = null;
  setRole(null);
});

afterEach(cleanup);

describe("App (shell)", () => {
  it("shows the login page when there is no session", async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId("login-page")).toBeTruthy());
  });

  it("Coordinator sees all three nav items (D1 + D2 + Print)", async () => {
    setCurrentUser("coordinator", "Coordinator");
    renderApp();
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.getByTestId("nav-orders")).toBeTruthy();
    expect(screen.getByTestId("nav-batch")).toBeTruthy();
    expect(screen.getByTestId("nav-print")).toBeTruthy();
  });

  it("WarehouseOps does NOT see the orders nav and gets 403 on /order", async () => {
    setCurrentUser("warehouse", "WarehouseOps");
    renderApp("/hub-store-order/order");
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.queryByTestId("nav-orders")).toBeNull();
    expect(screen.getByTestId("nav-batch")).toBeTruthy();
    expect(screen.getByTestId("nav-print")).toBeTruthy();
    expect(screen.getByTestId("forbidden")).toBeTruthy();
  });

  it("Manager sees all three nav items (role matrix §2)", async () => {
    setCurrentUser("manager", "Manager");
    renderApp("/hub-store-order/batch");
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.getByTestId("nav-orders")).toBeTruthy();
    expect(screen.getByTestId("nav-batch")).toBeTruthy();
    expect(screen.getByTestId("nav-print")).toBeTruthy();
  });

  it("renders remote-unavailable fallback instead of a white page", async () => {
    setCurrentUser("dev-user", "Coordinator");
    renderApp("/hub-store-order/batch/print");
    // Lazy import của stub reject async → fallback xuất hiện sau microtask
    expect(await screen.findByText(/Remote không khả dụng/)).toBeTruthy();
  });

  it("renders 404 for unknown routes", async () => {
    setCurrentUser("manager", "Manager");
    renderApp("/hub-store-order/unknown");
    await waitFor(() => expect(screen.getByTestId("app-sidebar")).toBeTruthy());
    expect(screen.getByText("Không tìm thấy trang")).toBeTruthy();
  });

  it("header shows username + logout is available (role switcher đã bỏ — SF-4)", async () => {
    setCurrentUser("coordinator", "Coordinator");
    renderApp();
    await waitFor(() => expect(screen.getByTestId("header-user")).toBeTruthy());
    expect(screen.getByTestId("header-user").textContent).toBe("coordinator");
    expect(screen.getByTestId("logout-button")).toBeTruthy();
    expect(screen.queryByTestId("role-switcher")).toBeNull();
    expect(screen.getByTestId("lang-toggle")).toBeTruthy();
  });
});
