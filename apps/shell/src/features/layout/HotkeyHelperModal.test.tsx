/**
 * SF-21 D5 — HotkeyHelperModal qua AppLayout header: click nút keyboard →
 * modal mở với snapshot hotkeyRegistry; ô search filter theo key; close →
 * modal ẩn. Render AppLayout trực tiếp (providers tối thiểu như App.test —
 * usePermissions đọc role store qua setRole, không cần provider).
 */
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initI18n, setRole, hotkeyRegistry } from '@hub-store/shared';
import type { HotkeyContext } from '@hub-store/shared';
import { shellResources } from '../../i18n';
import AppLayout from './AppLayout';

const CTXS: HotkeyContext[] = [
  {
    id: 'd1-orders-page',
    label: 'Danh sách đơn hàng',
    bindings: [
      { key: 'F6', handler: () => {}, description: 'Tạo đơn mới' },
    ],
  },
  {
    id: 'users-page',
    label: 'Quản lý người dùng',
    bindings: [
      { key: 'F4', handler: () => {}, description: 'Lưu người dùng' },
      { key: 'F6', handler: () => {}, description: 'Tạo người dùng' },
    ],
  },
];

function renderLayout() {
  const i18n = initI18n({ resources: shellResources });
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/hub-store-order/order']}>
        <AppLayout
          session={{ sub: 'tester' } as never}
          lang="vi"
          onToggleLanguage={() => {}}
          onSignOut={() => {}}
        >
          <div>content</div>
        </AppLayout>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  setRole('Coordinator');
  for (const ctx of CTXS) hotkeyRegistry.set(ctx.id, ctx);
});

afterEach(() => {
  cleanup();
  for (const ctx of CTXS) hotkeyRegistry.delete(ctx.id);
  setRole(null);
});

describe('HotkeyHelperModal (qua AppLayout header)', () => {
  it('click hotkey-helper-button → modal mở, liệt kê bindings các context mounted', async () => {
    const { getByTestId } = renderLayout();
    fireEvent.click(getByTestId('hotkey-helper-button'));
    const modal = await waitFor(() => getByTestId('hotkey-helper-modal'));
    expect(modal.textContent).toContain('F6');
    expect(modal.textContent).toContain('Tạo đơn mới');
    expect(modal.textContent).toContain('Danh sách đơn hàng');
    expect(modal.textContent).toContain('Lưu người dùng');
  });

  it('search "F6" → table còn đúng dòng F6 (F4 biến mất)', async () => {
    const { getByTestId } = renderLayout();
    fireEvent.click(getByTestId('hotkey-helper-button'));
    await waitFor(() => getByTestId('hotkey-helper-modal'));
    fireEvent.change(getByTestId('hotkey-search'), { target: { value: 'F6' } });
    const modal = getByTestId('hotkey-helper-modal');
    expect(modal.textContent).toContain('Tạo đơn mới');
    expect(modal.textContent).toContain('Tạo người dùng');
    expect(modal.textContent).not.toContain('Lưu người dùng');
  });

  it('search không khớp gì → empty text; close → modal ẩn', async () => {
    const { getByTestId } = renderLayout();
    fireEvent.click(getByTestId('hotkey-helper-button'));
    await waitFor(() => getByTestId('hotkey-helper-modal'));
    fireEvent.change(getByTestId('hotkey-search'), { target: { value: 'zzz-khong-có' } });
    expect(getByTestId('hotkey-helper-modal').textContent).toContain('Không có phím tắt nào khớp.');

    // jsdom không fire transitionend → motion đóng không bao giờ kết thúc;
    // đợi step-queue vào leave-active rồi dispatch tay để rc-motion unmount.
    const modalEl = document.querySelector('.ant-modal') as HTMLElement;
    fireEvent.click(modalEl.querySelector('.ant-modal-close') as HTMLElement);
    await waitFor(() => expect(modalEl.className).toContain('ant-zoom-leave-active'));
    fireEvent.transitionEnd(modalEl);
    await waitFor(() => expect(() => getByTestId('hotkey-helper-modal')).toThrow());
  });
});
