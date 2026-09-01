import { describe, expect, it } from "vitest";
import type { RegionDto } from "@hub-store/shared";
import { buildRegionOptions } from "./regions";

const regions: RegionDto[] = [
  { code: "01", name: "Hà Nội", type: "province" },
  { code: "001", name: "Ba Đình", type: "ward", parentCode: "01" },
  { code: "002", name: "Cầu Giấy", type: "ward", parentCode: "01" },
  { code: "79", name: "TP. Hồ Chí Minh", type: "province" },
  { code: "7901", name: "Quận 1", type: "ward", parentCode: "79" },
];

describe("buildRegionOptions — Địa chỉ multi tỉnh→phường", () => {
  it("group theo tỉnh, option tỉnh + các phường con", () => {
    const groups = buildRegionOptions(regions);
    expect(groups).toHaveLength(2);

    expect(groups[0].label).toBe("Hà Nội");
    expect(groups[0].options).toEqual([
      { label: "Hà Nội", value: "01" },
      { label: "Ba Đình", value: "001" },
      { label: "Cầu Giấy", value: "002" },
    ]);

    expect(groups[1].label).toBe("TP. Hồ Chí Minh");
    expect(groups[1].options).toEqual([
      { label: "TP. Hồ Chí Minh", value: "79" },
      { label: "Quận 1", value: "7901" },
    ]);
  });

  it("ward mồ côi (không có province parent) → bỏ qua, không crash", () => {
    const orphanOnly: RegionDto[] = [{ code: "999", name: "Lẻ", type: "ward", parentCode: "XX" }];
    expect(buildRegionOptions(orphanOnly)).toEqual([]);
  });
});
