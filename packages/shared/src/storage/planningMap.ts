/**
 * Planning map — SF-16 (spec §2.5, plan T6.1): persist mapping planningId ↔ đơn
 * sau khi confirmPlanning/book thành công, dùng làm GATE cho action "Book lại
 * vận đơn" (D2) + prefill modal rebook (D1).
 *
 * Cross-MF: shell serve cả 2 remote cùng origin (:3000) → localStorage CHUNG.
 * Đường duy nhất qua @hub-store/shared — KHÔNG import cross-app (P0 plan-critic).
 * Corrupt JSON → [] (throw-safe — map hỏng chỉ làm mất gate rebook, không crash).
 */

export interface PlanningMapEntry {
  planningId: string;
  orderCode: string;
  stopOrder: number;
  serviceId: string;
  vehicleType: string;
  addons: string[];
}

const key = (batchCode: string) => `nvc.plannings.${batchCode}`;

/** Security P2: localStorage là input không tin cậy (UDF/devtools/cross-app)
 * — validate shape từng entry, bỏ qua entry malformed thay vì cast mù. */
const isEntry = (v: unknown): v is PlanningMapEntry => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.planningId === "string" &&
    typeof e.orderCode === "string" &&
    typeof e.stopOrder === "number" &&
    typeof e.serviceId === "string" &&
    typeof e.vehicleType === "string" &&
    Array.isArray(e.addons) &&
    e.addons.every((a) => typeof a === "string")
  );
};

export const loadPlanningMap = (batchCode: string): PlanningMapEntry[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(batchCode)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
};

export const savePlanningMap = (batchCode: string, entries: PlanningMapEntry[]): void => {
  localStorage.setItem(key(batchCode), JSON.stringify(entries));
};
