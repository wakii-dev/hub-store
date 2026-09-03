// Unit AddressMapCard (SF-25 T7) — buildOsmUrl coords + buildStop escapeHtml
// popupHtml + render: có coords → MapView (stub) + deep-link; không coords →
// ẩn map chỉ địa chỉ. MapView stub ở shared level (jsdom không render leaflet
// thật — pattern MapTab.test SF-24).
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { getI18n, initI18n } from "@hub-store/shared";
import { ktvMobileResources } from "../../i18n";

vi.mock("@hub-store/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hub-store/shared")>();
  return {
    ...actual,
    MapView: (props: { stops?: unknown[]; height?: number }) => (
      <div data-testid="map-view-stub" style={{ height: props.height }} />
    ),
  };
});

import AddressMapCard, { buildOsmUrl, buildStop } from "./AddressMapCard";

initI18n({ resources: ktvMobileResources });

function wrap(ui: React.ReactNode) {
  return <I18nextProvider i18n={getI18n()!}>{ui}</I18nextProvider>;
}

describe("buildOsmUrl — deep-link OSM", () => {
  it("inject coords vào mlats + fragment map=17", () => {
    expect(buildOsmUrl(10.7398, 106.689)).toBe(
      "https://www.openstreetmap.org/?mlat=10.7398&mlon=106.689#map=17/10.7398/106.689",
    );
  });
});

describe("buildStop — escapeHtml mọi giá trị vào popupHtml (raw HTML Leaflet)", () => {
  it("escape code + address (P1 pattern MapTab SF-24)", () => {
    const stop = buildStop({
      code: "TD<1>",
      address: 'Hẻm "A" & B',
      coords: { lat: 10.7, long: 106.6 },
    });
    expect(stop.popupHtml).not.toContain("<1>");
    expect(stop.popupHtml).toContain("&lt;1&gt;");
    expect(stop.popupHtml).not.toContain('"A" &');
    expect(stop.popupHtml).toContain("&quot;A&quot; &amp; B");
    expect(stop.testId).toBe("ktv-map-pin-TD<1>"); // testid là DOM attr, không cần escape
    expect(stop.orderCode).toBe("TD&lt;1&gt;");
    expect(stop.lat).toBe(10.7);
    expect(stop.long).toBe(106.6);
  });
});

describe("AddressMapCard render", () => {
  it("có coords → MapView (height 220) + link Mở bản đồ đúng URL OSM", () => {
    render(
      wrap(
        <AddressMapCard
          code="TD-0007"
          province="TP. Hồ Chí Minh"
          note="Gọi trước 15 phút"
          coords={{ lat: 10.7398, long: 106.689 }}
        />,
      ),
    );
    expect(screen.getByTestId("map-view-stub")).toBeTruthy();
    expect(screen.getByTestId("ktv-address-text").textContent).toBe(
      "TP. Hồ Chí Minh · Gọi trước 15 phút",
    );
    const link = screen.getByTestId("ktv-map-open") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(buildOsmUrl(10.7398, 106.689));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    cleanup();
  });

  it("KHÔNG coords → ẩn map card, chỉ địa chỉ (install không có receiver)", () => {
    render(
      wrap(
        <AddressMapCard code="SO-0004" province="TP. Hồ Chí Minh" coords={null} />,
      ),
    );
    expect(screen.queryByTestId("map-view-stub")).toBeNull();
    expect(screen.queryByTestId("ktv-map-open")).toBeNull();
    expect(screen.getByTestId("ktv-address-text").textContent).toBe("TP. Hồ Chí Minh");
    cleanup();
  });
});
