import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initI18n } from "@hub-store/shared";
import { fulfillmentResources, registerFulfillmentResources } from "./i18n";
import App from "./App";

describe("App (fulfillment standalone)", () => {
  it("renders the batch list skeleton page title", () => {
    initI18n({ resources: fulfillmentResources });
    registerFulfillmentResources();
    render(<App />);
    expect(screen.getByText("Phiếu soạn hàng (D2)")).toBeTruthy();
  });
});
