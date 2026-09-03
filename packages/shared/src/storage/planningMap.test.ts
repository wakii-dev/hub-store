import { beforeEach, describe, expect, it } from 'vitest';
import { loadPlanningMap, savePlanningMap, type PlanningMapEntry } from './planningMap';

const entry: PlanningMapEntry = {
  planningId: '101',
  orderCode: 'ORD-3001',
  stopOrder: 1,
  serviceId: '1T',
  vehicleType: '1T',
  addons: ['DOCUMENT'],
};

beforeEach(() => {
  localStorage.clear();
});

describe('planningMap', () => {
  it('roundtrip save → load giữ nguyên entries', () => {
    savePlanningMap('BATCH-1', [entry, { ...entry, planningId: '102', stopOrder: 2, addons: [] }]);
    expect(loadPlanningMap('BATCH-1')).toEqual([
      entry,
      { ...entry, planningId: '102', stopOrder: 2, addons: [] },
    ]);
  });

  it('key chưa tồn tại → []', () => {
    expect(loadPlanningMap('BATCH-NONE')).toEqual([]);
  });

  it('JSON corrupt → [] (throw-safe, không crash)', () => {
    localStorage.setItem('nvc.plannings.BATCH-2', '{not-valid-json');
    expect(loadPlanningMap('BATCH-2')).toEqual([]);
  });

  it('key namespaced theo batchCode — phiếu khác đọc không thấy', () => {
    savePlanningMap('BATCH-1', [entry]);
    expect(loadPlanningMap('BATCH-9')).toEqual([]);
  });
});
