import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { initI18n } from '@hub-store/shared';
import { techResources } from './tech.i18n';
import { AssignTechnicianModal } from './AssignTechnicianModal';
import type { InstallationOrderDto } from './techApi';

const mocks = vi.hoisted(() => ({
  suggestTechnicians: vi.fn(),
  assignTechnician: vi.fn(),
}));

vi.mock('./techApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./techApi')>();
  return {
    ...actual,
    suggestTechnicians: mocks.suggestTechnicians,
    assignTechnician: mocks.assignTechnician,
  };
});

function order(partial: Partial<InstallationOrderDto> = {}): InstallationOrderDto {
  return {
    serviceOrderCode: 'SO-0001',
    deliveryOrderCode: 'TD-0001',
    technicianCode: '',
    status: 'NEW',
    expectedTime: '',
    timeline: [],
    serviceFee: 0,
    feeAdjust: 0,
    items: [],
    regionCode: 'R1',
    province: '',
    createdAt: '',
    buttons: {
      allowCancel: false,
      allowAssign: true,
      allowReassign: false,
      allowAccept: false,
      allowReschedule: false,
    },
    ...partial,
  };
}

function renderModal(props: Partial<Parameters<typeof AssignTechnicianModal>[0]> = {}) {
  const i18n = initI18n({ resources: techResources });
  return render(
    <I18nextProvider i18n={i18n}>
      <AssignTechnicianModal
        open
        order={order()}
        onClose={() => {}}
        onAssigned={() => {}}
        {...props}
      />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  mocks.suggestTechnicians.mockReset();
  mocks.assignTechnician.mockReset();
});
afterEach(cleanup);

describe('AssignTechnicianModal — gợi ý NV (SF-19 suggest) + chọn + confirm', () => {
  it('mở modal → fetch suggest theo regionCode đơn → render danh sách', async () => {
    mocks.suggestTechnicians.mockResolvedValue([
      { code: 'KTV-001', name: 'Nguyễn Văn An', type: 'KTV', activeCount: 2 },
      { code: 'CTV-001', name: 'Hoàng Văn Em', type: 'CTV', activeCount: 0 },
    ]);
    renderModal();
    await waitFor(() => expect(screen.getByText('Nguyễn Văn An')).toBeTruthy());
    expect(mocks.suggestTechnicians).toHaveBeenCalledWith('R1');
    expect(screen.getByText(/2 đơn đang phụ trách/)).toBeTruthy();
  });

  it('chọn NV + confirm → assignTechnician gọi đúng code', async () => {
    mocks.suggestTechnicians.mockResolvedValue([
      { code: 'KTV-001', name: 'Nguyễn Văn An', type: 'KTV', activeCount: 1 },
    ]);
    mocks.assignTechnician.mockResolvedValue({ order: order({ technicianCode: 'KTV-001' }) });
    const onAssigned = vi.fn();
    const onClose = vi.fn();
    renderModal({ onAssigned, onClose });

    const confirm = await screen.findByTestId('tech-assign-confirm');
    expect((confirm as HTMLButtonElement).disabled).toBe(true); // chưa chọn
    fireEvent.click(screen.getByText('Nguyễn Văn An'));
    fireEvent.click(confirm);
    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
    expect(mocks.assignTechnician).toHaveBeenCalledWith('SO-0001', 'KTV-001');
    expect(onClose).toHaveBeenCalled();
  });

  it('409 (precondition BE) → message conflict, không onAssigned', async () => {
    mocks.suggestTechnicians.mockResolvedValue([
      { code: 'KTV-001', name: 'Nguyễn Văn An', type: 'KTV', activeCount: 1 },
    ]);
    mocks.assignTechnician.mockRejectedValue({
      response: { status: 409, data: { message: 'conflict' } },
    });
    const onAssigned = vi.fn();
    renderModal({ onAssigned });
    fireEvent.click(await screen.findByText('Nguyễn Văn An'));
    fireEvent.click(screen.getByTestId('tech-assign-confirm'));
    await waitFor(() => expect(screen.getByText(/không ở trạng thái cho phép gán/i)).toBeTruthy());
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it('suggest rỗng → Alert "không có KTV gợi ý"', async () => {
    mocks.suggestTechnicians.mockResolvedValue([]);
    renderModal();
    await waitFor(() => expect(screen.getByText(/Không có KTV gợi ý/)).toBeTruthy());
  });

  it('re-assign: đơn đã có technicianCode → option hiện tại luôn có trong list', async () => {
    mocks.suggestTechnicians.mockResolvedValue([
      { code: 'KTV-002', name: 'Trần Văn Bình', type: 'KTV', activeCount: 0 },
    ]);
    renderModal({ order: order({ technicianCode: 'KTV-001', buttons: { allowCancel: false, allowAssign: false, allowReassign: true, allowAccept: false, allowReschedule: false } }) });
    await waitFor(() => expect(screen.getByText('Trần Văn Bình')).toBeTruthy());
    expect(screen.getByText('KTV-001')).toBeTruthy();
  });
});
