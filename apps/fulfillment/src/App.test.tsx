import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "@hub-store/shared";
import { fulfillmentResources, registerFulfillmentResources } from "./i18n";
import App from "./App";

// Standalone App vẫn mount RTKQ Provider thật (createAppStore) — hook query
// sẽ gọi network trong jsdom (fetch không có → query error state, không crash).
// Mock fetch để test sạch.
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.reject(new Error("no network in test"))),
);

afterEach(() => cleanup());

describe("App (fulfillment standalone)", () => {
  it("renders the D2 page title", () => {
    initI18n({ resources: fulfillmentResources });
    registerFulfillmentResources();
    render(<App />);
    expect(screen.getByText("Danh sách yêu cầu soạn hàng")).toBeTruthy();
  });
});
