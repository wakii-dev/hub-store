/**
 * Region options — build grouped options (tỉnh → phường) cho MultiSelect
 * "Địa chỉ" từ GET /master-data/regions (pure — unit test riêng).
 *
 * Group = tỉnh (label không chọn được trong antd group); TRONG mỗi group có:
 * option tỉnh (chọn cả tỉnh — backend match theo tên trong address) + các
 * option phường (parentCode trỏ tỉnh).
 */
import type { RegionDto } from "@hub-store/shared";

export interface RegionOption {
  label: string;
  value: string;
}

export interface RegionOptionGroup {
  label: string;
  options: RegionOption[];
}

export function buildRegionOptions(regions: RegionDto[]): RegionOptionGroup[] {
  const provinces = regions.filter((r) => r.type === "province");
  return provinces.map((province) => {
    const wards = regions.filter((r) => r.type === "ward" && r.parentCode === province.code);
    return {
      label: province.name,
      options: [
        { label: province.name, value: province.code },
        ...wards.map((ward) => ({ label: ward.name, value: ward.code })),
      ],
    };
  });
}
