/**
 * SF-21 — PrintersPage tests: render bảng từ GET /fulfillment/printers,
 * create flow (modal → POST payload), duplicate 409 → field error. axios
 * singleton mock toàn bộ (pattern AvatarUpload.test). i18n KHÔNG init trong
 * test → t() trả key (assert trên key/testid).
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrintersPage from './PrintersPage';

const { axiosMock } = vi.hoisted(() => ({
  axiosMock: { request: vi.fn() },
}));

vi.mock('@hub-store/api-client', () => ({
  getAxiosInstance: () => axiosMock,
}));

const FIXTURE_ITEMS = [
  {
    shopCode: '30201',
    printerId: 'PRN-30201-01',
    name: 'HP LaserJet M404',
    printerIp: '192.168.30.21',
    mac: 'AA:BB:CC:30:21:01',
    type: 'bill',
  },
  {
    shopCode: '30202',
    printerId: 'PRN-30202-01',
    name: 'Canon LBP2900',
    printerIp: '192.168.30.22',
    mac: 'AA:BB:CC:30:22:01',
    type: 'a4',
  },
];

beforeEach(() => {
  axiosMock.request.mockReset();
  axiosMock.request.mockResolvedValue({ data: { items: FIXTURE_ITEMS } });
});

afterEach(() => {
  cleanup();
});

function fillInput(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function openAddModalAndFill(): Promise<void> {
  render(<PrintersPage />);
  await waitFor(() => expect(screen.getByTestId('printer-row-30201-PRN-30201-01')).toBeTruthy());
  fireEvent.click(screen.getByTestId('printers-add-button'));
  await waitFor(() => expect(screen.getByTestId('printers-add-modal')).toBeTruthy());
  fillInput('printers.form.shop', '30203');
  fillInput('printers.form.printerId', 'PRN-NEW');
  fillInput('printers.form.name', 'Canon LBP');
  fillInput('printers.form.ip', '10.0.0.5');
  fillInput('printers.form.mac', 'AA:BB:CC:00:00:01');
  // antd4 Select — dropdown portal ở body: mở qua .ant-select-selector trong
  // modal (select duy nhất trong modal là type), rồi click option "Bill".
  const selector = document.querySelector(
    '[data-testid="printers-add-modal"] .ant-select-selector',
  ) as HTMLElement;
  fireEvent.mouseDown(selector);
  const option = await waitFor(() => {
    const bill = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
      (el) => el.textContent === 'Bill',
    );
    if (!bill) throw new Error('option Bill not rendered yet');
    return bill;
  });
  fireEvent.click(option);
}

describe('PrintersPage', () => {
  it('render bảng printers từ GET /fulfillment/printers', async () => {
    render(<PrintersPage />);
    await waitFor(() =>
      expect(screen.getByTestId('printer-row-30202-PRN-30202-01')).toBeTruthy(),
    );
    expect(axiosMock.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/fulfillment/printers', method: 'GET' }),
    );
  });

  it('create flow — POST /fulfillment/printers payload đầy đủ, modal đóng', async () => {
    await openAddModalAndFill();
    fireEvent.click(screen.getByText('printers.form.submit'));
    await waitFor(() =>
      expect(axiosMock.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/fulfillment/printers',
          method: 'POST',
          data: expect.objectContaining({
            shopCode: '30203',
            printerId: 'PRN-NEW',
            type: 'bill',
          }),
        }),
      ),
    );
  });

  it('duplicate 409 → field error trên printerId (KHÔNG success)', async () => {
    axiosMock.request.mockImplementation((config: { method?: string }) => {
      if (config.method === 'POST') {
        return Promise.reject({ response: { status: 409 } });
      }
      return Promise.resolve({ data: { items: FIXTURE_ITEMS } });
    });
    await openAddModalAndFill();
    fireEvent.click(screen.getByText('printers.form.submit'));
    await waitFor(() => expect(screen.getByText('printers.duplicate')).toBeTruthy());
  });

  it('edit mode — shopCode + printerId disabled (identity immutable D9)', async () => {
    render(<PrintersPage />);
    await waitFor(() => expect(screen.getByTestId('printer-row-30201-PRN-30201-01')).toBeTruthy());
    fireEvent.click(screen.getByTestId('printer-edit-30201-PRN-30201-01'));
    await waitFor(() => expect(screen.getByTestId('printers-add-modal')).toBeTruthy());
    expect((screen.getByLabelText('printers.form.shop') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('printers.form.printerId') as HTMLInputElement).disabled).toBe(true);
  });
});
