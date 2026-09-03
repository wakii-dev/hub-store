/**
 * Unit tests settlementApi.exportCsv (SF-14 T5): GET /cod/settlement.csv với
 * responseType 'blob' + query from/to — mock axios singleton (@hub-store/
 * api-client) để pin contract gọi BFF (Authorization Bearer do interceptor
 * gắn — endpoint guard Manager/Admin, window.open trần sẽ 403).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@hub-store/api-client', () => ({
  getAxiosInstance: () => ({ get: getMock, defaults: { baseURL: '/api' } }),
}));

import { settlementApi } from './settlementApi';

describe('settlementApi.exportCsv — GET /cod/settlement.csv blob (SF-14 T5)', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('gọi đúng endpoint + query from/to + responseType blob → trả Blob nguyên vẹn', async () => {
    const blob = new Blob(['shop_code,shop_name\r\n'], { type: 'text/csv' });
    getMock.mockResolvedValue({ data: blob });
    const out = await settlementApi.exportCsv('2026-08-01', '2026-08-31');
    expect(getMock).toHaveBeenCalledWith('/cod/settlement.csv', {
      params: { from: '2026-08-01', to: '2026-08-31' },
      responseType: 'blob',
    });
    expect(out).toBe(blob);
  });

  it('lỗi network → reject (SettlementPage bắt → toast settlement.error.export)', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    await expect(settlementApi.exportCsv('2026-08-01', '2026-08-31')).rejects.toThrow('boom');
  });
});
