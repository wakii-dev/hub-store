// @vitest-environment node
// Regression SF-24 fix (FI-269): package root + map module KHÔNG được kéo
// leaflet lúc import — shell tokenGetter.test chạy node env (không window),
// import @hub-store/shared qua oidc.ts → trước fix, shared index re-export map
// → MapView import leaflet tĩnh → "ReferenceError: window is not defined" từ
// leaflet-src.js. Static import (giống chuỗi import thật của oidc.ts) — nếu ai
// thêm lại leaflet vào surface này, file này fail ở module-scope ngay.
// Leaflet giờ CHỈ nạp qua MapView → dynamic import mapController.

import { describe, expect, it } from "vitest";
import * as shared from "./index";
import * as map from "./map/index";

describe("shared root + map module (node-env import regression)", () => {
  it("import map index trong node env (không window) không throw leaflet", () => {
    expect(typeof map.escapeHtml).toBe("function");
    expect(typeof map.sortStops).toBe("function");
    expect(map.MOCK_WAREHOUSE).toBeDefined();
    expect(typeof map.deriveStopCoord).toBe("function");
    expect(typeof map.MapView).toBe("function");
  });

  it("import package root (@hub-store/shared surface) trong node env không throw", () => {
    expect(typeof shared.escapeHtml).toBe("function");
    expect(shared.ROLES).toBeDefined();
    expect(typeof shared.MapView).toBe("function");
  });
});
