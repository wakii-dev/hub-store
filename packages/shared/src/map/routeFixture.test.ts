import { describe, expect, it } from "vitest";
import { deriveStopCoord, MOCK_WAREHOUSE } from "./routeFixture";

describe("deriveStopCoord", () => {
  it("ổn định — cùng orderCode cùng toạ độ", () => {
    expect(deriveStopCoord("ORD-001")).toEqual(deriveStopCoord("ORD-001"));
  });
  it("khác orderCode → toạ độ phân biệt (jitter ≠ 0)", () => {
    const a = deriveStopCoord("ORD-001");
    const b = deriveStopCoord("ORD-002");
    expect(a).not.toEqual(b);
  });
  it("nằm trong bán kính jitter quanh warehouse HCMC", () => {
    const p = deriveStopCoord("ORD-XYZ");
    expect(p).toBeDefined();
    expect(Math.abs(p!.lat - MOCK_WAREHOUSE.lat)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(p!.long - MOCK_WAREHOUSE.long)).toBeLessThanOrEqual(0.03);
  });
  it("orderCode rỗng → trả undefined (fallback chưa có tọa độ)", () => {
    expect(deriveStopCoord("")).toBeUndefined();
  });
});
