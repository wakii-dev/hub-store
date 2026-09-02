/**
 * Tests card delivery/installation: tel: phone-call theo flag (task 5) +
 * buttons BE-authoritative — không flag không nút (task 6).
 */
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { initI18n } from '@hub-store/shared';
import { techResources } from './tech.i18n';
import { DeliveryCard } from './DeliveryTab';
import { InstallationCard } from './InstallationTab';
import type { DeliveryOrderDto, InstallationOrderDto } from './techApi';

vi.mock('./techApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./techApi')>();
  return { ...actual }; // IS_SHOW_PHONE_CALL giữ giá trị thật (true)
});

const buttons = (flags: Partial<{ allowCancel: boolean; allowAssign: boolean; allowReassign: boolean; allowAccept: boolean; allowReschedule: boolean }> = {}) => ({
  allowCancel: false,
  allowAssign: false,
  allowReassign: false,
  allowAccept: false,
  allowReschedule: false,
  ...flags,
});

function delivery(partial: Partial<DeliveryOrderDto> = {}): DeliveryOrderDto {
  return {
    code: 'TD-0001',
    status: 'SHIPPING',
    driverName: 'Trương Đình Hiếu',
    driverPhone: '0901234501',
    receiver: { name: 'Ngô Thị Giang', phone: '0912000001', location: null },
    sender: { name: 'Kho Tân Bình', phone: '0913000001', location: null },
    fee: 35000,
    tip: 0,
    items: [{ code: 'SP-1001', name: 'Máy giặt LG 10kg', quantity: 1, categoryL1: '', categoryL2: '' }],
    regionCode: 'R1',
    province: 'TP. Hồ Chí Minh',
    coordination: {},
    deliveryDate: '2026-09-03',
    createdAt: '',
    buttons: buttons(),
    ...partial,
  };
}

function installation(partial: Partial<InstallationOrderDto> = {}): InstallationOrderDto {
  return {
    serviceOrderCode: 'SO-0001',
    deliveryOrderCode: 'TD-0001',
    technicianCode: '',
    status: 'NEW',
    expectedTime: '',
    timeline: [],
    serviceFee: 200000,
    feeAdjust: 0,
    items: [],
    regionCode: 'R1',
    province: '',
    createdAt: '',
    buttons: buttons(),
    ...partial,
  };
}

function renderWithI18n(ui: React.ReactNode) {
  const i18n = initI18n({ resources: techResources });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

afterEach(cleanup);

describe('phone-call tel: (task 5)', () => {
  it('receiver/driver phone → anchor tel: (desktop link, mobile mở dialer)', () => {
    renderWithI18n(<DeliveryCard order={delivery()} locale="vi" />);
    const links = screen.getAllByTestId('tech-phone-link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('tel:0901234501');
    expect(hrefs).toContain('tel:0912000001');
    expect(hrefs).toContain('tel:0913000001');
  });

  it('phone rỗng → không có tel: link', () => {
    renderWithI18n(
      <DeliveryCard
        order={delivery({
          driverPhone: '',
          receiver: { name: 'X', phone: '', location: null },
          sender: { name: 'Y', phone: '', location: null },
        })}
        locale="vi"
      />,
    );
    expect(screen.queryAllByTestId('tech-phone-link')).toHaveLength(0);
  });
});

describe('buttons BE-authoritative (task 6) — không flag không nút', () => {
  it('allowAssign → nút "Gán KTV"', () => {
    renderWithI18n(
      <InstallationCard order={installation({ buttons: buttons({ allowAssign: true }) })} locale="vi" onAssign={() => {}} />,
    );
    expect(screen.getByTestId('tech-assign-SO-0001').textContent).toContain('Gán KTV');
  });

  it('allowReassign → nút "Gán lại KTV" (cùng modal nguồn)', () => {
    renderWithI18n(
      <InstallationCard
        order={installation({ technicianCode: 'KTV-001', buttons: buttons({ allowReassign: true }) })}
        locale="vi"
        onAssign={() => {}}
      />,
    );
    expect(screen.getByTestId('tech-assign-SO-0001').textContent).toContain('Gán lại KTV');
  });

  it('không flag nào → KHÔNG có nút assign (không nút không flag)', () => {
    renderWithI18n(<InstallationCard order={installation()} locale="vi" onAssign={() => {}} />);
    expect(screen.queryByTestId('tech-assign-SO-0001')).toBeNull();
  });

  it('flag accept/reschedule/cancel KHÔNG sinh nút chết (không endpoint desktop — SF-25)', () => {
    renderWithI18n(
      <InstallationCard
        order={installation({ buttons: buttons({ allowCancel: true, allowAccept: true, allowReschedule: true }) })}
        locale="vi"
        onAssign={() => {}}
      />,
    );
    expect(screen.queryByTestId('tech-assign-SO-0001')).toBeNull();
  });
});

describe('TechStatusTag', () => {
  it('render pill với testid theo status', () => {
    renderWithI18n(<DeliveryCard order={delivery({ status: 'DELIVERED' })} locale="vi" />);
    expect(screen.getByTestId('tech-status-DELIVERED').textContent).toContain('Đã giao');
  });
});
