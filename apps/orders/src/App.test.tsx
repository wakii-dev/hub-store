import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initI18n } from "@hub-store/shared";
import { ordersResources, registerOrdersResources } from "./i18n";
import App from "./App";

describe("App (orders standalone)", () => {
  it("renders the D1 skeleton page title", () => {
    initI18n({ resources: ordersResources });
    registerOrdersResources();
    render(<App />);
    expect(screen.getByText("Đơn hàng (D1)")).toBeTruthy();
  });
});
