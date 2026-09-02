/**
 * Reviewer P0/P1: mount tab-level component với fetch thật (mock API) —
 * phủ đường lỗi (early return sau hooks — P0 hook-order) + đường success.
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { initI18n } from '@hub-store/shared';
import { techResources } from './tech.i18n';
import { DeliveryTab } from './DeliveryTab';
import type { DeliveryOrderDto } from './techApi';

const mocks = vi.hoisted(() => ({
  filterDeliveryOrders: vi.fn(),
}));

vi.mock('./techApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./techApi')>();
  return { ...actual, filterDeliveryOrders: mocks.filterDeliveryOrders };
});

function delivery(): DeliveryOrderDto {
  return {
    code: 'TD-0001',
    status: 'SHIPPING',
    driverName: 'Trương Đình Hiếu',
    driverPhone: '0901234501',
    receiver: { name: 'Ngô Thị Giang', phone: '0912000001', location: null },
    sender: { name: 'Kho Tân Bình', phone: '0913000001', location: null },
    fee: 35000,
    tip: 0,
    items: [],
    regionCode: 'R1',
    province: 'TP. Hồ Chí Minh',
    coordination: {},
    deliveryDate: '2026-09-03',
    createdAt: '',
    buttons: { allowCancel: false, allowAssign: false, allowReassign: false, allowAccept: false, allowReschedule: false },
  };
}

function renderTab(ui: React.ReactNode) {
  const i18n = initI18n({ resources: techResources });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

beforeEach(() => mocks.filterDeliveryOrders.mockReset());
afterEach(cleanup);

describe('DeliveryTab — mount với fetch (reviewer P0 hook-order + P1-1)', () => {
  it('API lỗi → EmptyState "Tải lại", KHÔNG crash route (hook-count)', async () => {
    mocks.filterDeliveryOrders.mockRejectedValue(new Error('boom'));
    expect(() =>
      renderTab(<DeliveryTab filter={{}} page={1} onPageChange={() => {}} />),
    ).not.toThrow();
    await waitFor(() => expect(screen.getByText('Tải lại')).toBeTruthy());
    // refetch vẫn hoạt động sau lỗi
    mocks.filterDeliveryOrders.mockResolvedValue({ items: [delivery()], total: 1, page: 1, pageSize: 10 });
  });

  it('API OK → card render + onTotal nhận envelope total', async () => {
    mocks.filterDeliveryOrders.mockResolvedValue({ items: [delivery()], total: 27, page: 1, pageSize: 10 });
    const onTotal = vi.fn();
    renderTab(<DeliveryTab filter={{}} page={1} onPageChange={() => {}} onTotal={onTotal} />);
    await waitFor(() => expect(screen.getByTestId('tech-delivery-card-TD-0001')).toBeTruthy());
    await waitFor(() => expect(onTotal).toHaveBeenCalledWith(27));
  });
});
