import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { initI18n } from "@hub-store/shared";
import { ordersResources, registerOrdersResources } from "./i18n";
import App from "./App";

describe("App (orders standalone)", () => {
  // vitest chạy globals:false → RTL auto-cleanup KHÔNG kích hoạt. Không
  // unmount thì timer debounce trong TransferHubModal (D1Page luôn mount nó)
  // sống sót qua teardown jsdom → callback fire sau khi `window` đã chết →
  // unhandled "ReferenceError: window is not defined" fail run (flake runner,
  // dev 05/09/2026). cleanup() unmount → useEffect clearTimeout → hết timer
  // mồ côi.
  afterEach(cleanup);

  it("renders the D1 page title", () => {
    initI18n({ resources: ordersResources });
    registerOrdersResources();
    render(<App />);
    expect(screen.getByText("Danh sách đơn hàng kho chi nhánh")).toBeTruthy();
  });
});
