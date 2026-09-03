// jsdom render smoke — session được mock ở tầng ./auth/oidc (redirect flow
// thật là integration Keycloak, phủ bởi E2E T8). i18n init bằng resources
// thật (ktvMobile ns) để assert theo text VI.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { initI18n } from "@hub-store/shared";
import { ktvMobileResources } from "./i18n";

const state = vi.hoisted(() => ({
  user: null as { profile: unknown; access_token: string; session: unknown } | null,
  signoutRedirect: vi.fn(),
}));

vi.mock("./auth/oidc", () => ({
  loadCurrentUser: vi.fn(async () => state.user),
  sessionFromUser: vi.fn((u: (typeof state)["user"]) => (u ? u.session : null)),
  onSessionChange: vi.fn(),
  signinCallback: vi.fn(),
  signinRedirect: vi.fn(),
  signoutRedirect: state.signoutRedirect,
}));

import App from "./App";

initI18n({ resources: ktvMobileResources });

const ktvUser = {
  profile: { preferred_username: "KTV-001", name: "Nguyễn Văn An" },
  access_token: "kc-access-token",
  session: { sub: "KTV-001", role: "InsideTechnician", name: "Nguyễn Văn An" },
};

// Đã login NHƯNG không có role technician (session mock = null) → App phải
// render ForbiddenPage — KHÔNG phải LoginGate (vòng lặp redirect Keycloak).
const managerUser = {
  profile: { preferred_username: "manager" },
  access_token: "kc-access-token",
  session: null,
};

beforeEach(() => {
  state.signoutRedirect.mockClear();
  window.history.replaceState(null, "", "/");
  cleanup();
});

describe("App — authenticated technician (T3 placeholder shell)", () => {
  it("render MyOrders placeholder + bottom-nav 2 mục", async () => {
    state.user = ktvUser;
    render(<App />);
    expect(await screen.findByTestId("ktv-my-orders")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Đơn của tôi" })).toBeTruthy();
    expect(screen.getByText("Xin chào, Nguyễn Văn An")).toBeTruthy();
    expect(screen.getByTestId("ktv-bottom-nav")).toBeTruthy();
    expect(screen.getByTestId("ktv-nav-orders")).toBeTruthy();
    expect(screen.getByTestId("ktv-nav-account")).toBeTruthy();
  });

  it("route /account → AccountPage: user info + nút Đăng xuất", async () => {
    state.user = ktvUser;
    window.history.replaceState(null, "", "/account");
    render(<App />);
    expect(await screen.findByTestId("ktv-account")).toBeTruthy();
    expect(screen.getByText("KTV-001")).toBeTruthy();
    expect(screen.getByText("KTV lắp đặt")).toBeTruthy();
    const logout = screen.getByRole("button", { name: /Đăng xuất/ });
    logout.click();
    await waitFor(() => expect(state.signoutRedirect).toHaveBeenCalledTimes(1));
  });

  it("role gate: session null role → 403 Không có quyền truy cập", async () => {
    state.user = managerUser;
    render(<App />);
    expect(await screen.findByTestId("ktv-forbidden")).toBeTruthy();
    expect(screen.getByText("Không có quyền truy cập")).toBeTruthy();
  });
});

describe("App — boot states", () => {
  it("chưa login → LoginGate spinner (trước khi signinRedirect điều hướng)", async () => {
    state.user = null;
    render(<App />);
    expect(await screen.findByTestId("ktv-login-gate")).toBeTruthy();
  });
});
