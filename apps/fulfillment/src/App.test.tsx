import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the fulfillment app name", () => {
    render(<App />);
    expect(screen.getByText("Hub Store — fulfillment")).toBeTruthy();
  });
});
