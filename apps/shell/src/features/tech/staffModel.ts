/**
 * staffModel — derive bảng "KTV-CTV theo ngày" FE-side (SF-20 task 4).
 * BE SF-19 không có endpoint aggregate → group từ FilterInstallationOrders
 * (technicianCode × ngày theo expectedTime, fallback createdAt) +
 * suggest registry (union theo region codes quan sát được).
 */
import type { InstallationOrderDto, SuggestedTechnicianDto } from './techApi';
import { dayOf, unionTechnicians } from './techHelpers';

export interface StaffDayWork {
  /** Ngày YYYY-MM-DD. */
  day: string;
  /** Số đơn lắp đặt trong ngày. */
  installCount: number;
  /** Số đơn giao liên quan (distinct deliveryOrderCode). */
  deliveryCount: number;
}

export interface StaffRow {
  code: string;
  name: string;
  type: string;
  regions: string[];
  days: StaffDayWork[];
  totalInstall: number;
  totalDelivery: number;
  /** Đơn lắp của staff (giữ nguyên thứ tự fetch — cho detail modal). */
  installations: InstallationOrderDto[];
}

function dayOfOrder(order: InstallationOrderDto): string {
  return dayOf(order.expectedTime) || dayOf(order.createdAt);
}

/**
 * Group đơn lắp theo staff × ngày. Staff không có technicianCode (chưa
 * gán) bị bỏ qua — bảng là workload per NV. Ngày không parse được → bỏ.
 */
export function buildStaffRows(
  installations: InstallationOrderDto[],
  registry: SuggestedTechnicianDto[] = [],
): StaffRow[] {
  const meta = new Map<string, SuggestedTechnicianDto>();
  for (const tech of registry) meta.set(tech.code, tech);

  const byStaff = new Map<string, StaffRow>();
  for (const order of installations) {
    const code = order.technicianCode?.trim();
    if (!code) continue;
    const day = dayOfOrder(order);
    if (!day) continue;
    let row = byStaff.get(code);
    if (!row) {
      const info = meta.get(code);
      row = {
        code,
        name: info?.name ?? code,
        type: info?.type ?? 'KTV',
        regions: [],
        days: [],
        totalInstall: 0,
        totalDelivery: 0,
        installations: [],
      };
      byStaff.set(code, row);
    }
    row.installations.push(order);
    row.totalInstall += 1;
    if (order.deliveryOrderCode?.trim()) row.totalDelivery += 1;
  }

  // Regions = union regionCode của đơn staff phụ trách (nếu registry không cho).
  const rows = [...byStaff.values()];
  for (const row of rows) {
    const regionSet = new Set<string>();
    const allDeliveries = new Set<string>();
    for (const order of row.installations) {
      if (order.regionCode?.trim()) regionSet.add(order.regionCode);
      if (order.deliveryOrderCode?.trim()) allDeliveries.add(order.deliveryOrderCode);
    }
    row.regions = [...regionSet].sort();
    row.totalDelivery = allDeliveries.size;
    // Gộp theo ngày + đếm distinct đơn giao mỗi ngày.
    const perDay = new Map<string, { install: number; deliveries: Set<string> }>();
    for (const order of row.installations) {
      const day = dayOfOrder(order);
      let bucket = perDay.get(day);
      if (!bucket) {
        bucket = { install: 0, deliveries: new Set<string>() };
        perDay.set(day, bucket);
      }
      bucket.install += 1;
      if (order.deliveryOrderCode?.trim()) bucket.deliveries.add(order.deliveryOrderCode);
    }
    row.days = [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, bucket]) => ({
        day,
        installCount: bucket.install,
        deliveryCount: bucket.deliveries.size,
      }));
  }
  return rows;
}

/**
 * Registry staff: union suggest theo mọi region code xuất hiện trong đơn
 * lắp (suggest là nguồn danh sách NV duy nhất của SF-19).
 */
export function buildRegistry(regions: string[], fetchSuggest: (r: string) => Promise<SuggestedTechnicianDto[]>): Promise<SuggestedTechnicianDto[]> {
  if (regions.length === 0) return Promise.resolve([]);
  return Promise.all(regions.map(fetchSuggest)).then(unionTechnicians);
}
