import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { initI18n } from "@hub-store/shared";
import { shellResources } from "./i18n";
import App from "./App";

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

describe("App (shell)", () => {
  it("renders header title + nav", () => {
    renderApp();
    expect(screen.getByText("Hub Store")).toBeTruthy();
    expect(screen.getByTitle("Đơn hàng")).toBeTruthy();
    expect(screen.getByTitle("Phiếu soạn")).toBeTruthy();
    expect(screen.getByTitle("In phiếu")).toBeTruthy();
  });

  it("renders remote-unavailable fallback instead of a white page", async () => {
    renderApp("/hub-store-order/order");
    // Lazy import của stub reject async → fallback xuất hiện sau microtask
    expect(await screen.findByText(/Remote không khả dụng/)).toBeTruthy();
  });
});
