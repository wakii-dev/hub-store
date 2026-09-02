import { describe, expect, it } from 'vitest';
import { buildRegistry, buildStaffRows, type StaffRow } from './staffModel';
import type { InstallationOrderDto, SuggestedTechnicianDto } from './techApi';

function installation(partial: Partial<InstallationOrderDto>): InstallationOrderDto {
  return {
    serviceOrderCode: 'SO-0001',
    deliveryOrderCode: '',
    technicianCode: '',
    status: 'NEW',
    expectedTime: '',
    timeline: [],
    serviceFee: 0,
    feeAdjust: 0,
    items: [],
    regionCode: '',
    province: '',
    createdAt: '2026-09-02T00:00:00+07:00',
    buttons: {
      allowCancel: false,
      allowAssign: false,
      allowReassign: false,
      allowAccept: false,
      allowReschedule: false,
    },
    ...partial,
  };
}

describe('buildStaffRows — group staff × ngày (acceptance: KTV-CTV detail nhóm theo ngày đúng)', () => {
  it('group theo technicianCode × ngày expectedTime; đếm distinct đơn giao', () => {
    const rows = buildStaffRows(
      [
        installation({
          serviceOrderCode: 'SO-1',
          technicianCode: 'KTV-001',
          expectedTime: '2026-09-02T08:00:00+07:00',
          deliveryOrderCode: 'TD-0001',
          regionCode: 'R1',
        }),
        installation({
          serviceOrderCode: 'SO-2',
          technicianCode: 'KTV-001',
          expectedTime: '2026-09-02T09:00:00+07:00',
          deliveryOrderCode: 'TD-0001', // trùng → không đếm thêm
        }),
        installation({
          serviceOrderCode: 'SO-3',
          technicianCode: 'KTV-001',
          expectedTime: '2026-09-03T08:00:00+07:00',
          deliveryOrderCode: 'TD-0002',
        }),
        installation({
          serviceOrderCode: 'SO-4',
          technicianCode: 'KTV-002',
          expectedTime: '2026-09-02T10:00:00+07:00',
        }),
      ],
      [{ code: 'KTV-001', name: 'Nguyễn Văn An', type: 'KTV', activeCount: 3 }],
    );

    const an = rows.find((r) => r.code === 'KTV-001') as StaffRow;
    expect(an.name).toBe('Nguyễn Văn An');
    expect(an.regions).toEqual(['R1']);
    expect(an.totalInstall).toBe(3);
    expect(an.totalDelivery).toBe(2); // TD-0001 + TD-0002
    expect(an.days).toEqual([
      { day: '2026-09-02', installCount: 2, deliveryCount: 1 },
      { day: '2026-09-03', installCount: 1, deliveryCount: 1 },
    ]);

    // Staff không có trong registry → fallback name=code, type=KTV
    const binh = rows.find((r) => r.code === 'KTV-002') as StaffRow;
    expect(binh.name).toBe('KTV-002');
    expect(binh.type).toBe('KTV');
  });

  it('bỏ đơn chưa gán KTV và đơn ngày không parse được', () => {
    const rows = buildStaffRows([
      installation({ serviceOrderCode: 'SO-5', technicianCode: '', expectedTime: '2026-09-02T08:00:00+07:00' }),
      // expectedTime rỗng + createdAt rỗng → không suy ra được ngày → bỏ
      installation({ serviceOrderCode: 'SO-6', technicianCode: 'KTV-001', expectedTime: '', createdAt: '' }),
    ]);
    expect(rows).toEqual([]);
  });

  it('fallback ngày từ createdAt khi expectedTime rỗng', () => {
    const rows = buildStaffRows([
      installation({
        serviceOrderCode: 'SO-7',
        technicianCode: 'CTV-001',
        createdAt: '2026-09-01T10:00:00+07:00',
      }),
    ]);
    expect(rows[0].days).toEqual([{ day: '2026-09-01', installCount: 1, deliveryCount: 0 }]);
  });
});

describe('buildRegistry — suggest union theo regions quan sát được', () => {
  it('gọi suggest mỗi region 1 lần rồi union; không region → []', async () => {
    const calls: string[] = [];
    const fetchSuggest = async (region: string): Promise<SuggestedTechnicianDto[]> => {
      calls.push(region);
      return [
        { code: 'KTV-001', name: 'An', type: 'KTV', activeCount: 1 },
        { code: 'CTV-001', name: 'Em', type: 'CTV', activeCount: 0 },
      ];
    };
    const registry = await buildRegistry(['R2', 'R1'], fetchSuggest);
    expect(calls.sort()).toEqual(['R1', 'R2']);
    expect(registry).toHaveLength(2);
    expect(await buildRegistry([], fetchSuggest)).toEqual([]);
  });
});
