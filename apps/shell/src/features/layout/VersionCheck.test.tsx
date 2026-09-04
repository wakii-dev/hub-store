/**
 * SF-21 D8 — VersionCheck tests (mock axios singleton): version null → không
 * badge không modal; version mới khác sf.seenVersion → badge + modal; reload →
 * set seenVersion TRƯỚC khi location.reload() (mock reload, theo dõi thứ tự).
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VersionCheck, { SEEN_VERSION_KEY } from './VersionCheck';

const { axiosMock, reloadMock, callOrder } = vi.hoisted(() => ({
  axiosMock: { get: vi.fn() },
  reloadMock: vi.fn(),
  callOrder: [] as string[],
}));

vi.mock('@hub-store/api-client', () => ({
  getAxiosInstance: () => axiosMock,
}));

beforeEach(() => {
  axiosMock.get.mockReset();
  reloadMock.mockReset();
  callOrder.length = 0;
  localStorage.clear();
  const realSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    callOrder.push('set');
    return realSetItem.call(this, key, value);
  });
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: reloadMock.mockImplementation(() => callOrder.push('reload')) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VersionCheck', () => {
  it('version null → không badge, không modal (skip checks)', async () => {
    axiosMock.get.mockResolvedValue({ data: { version: null } });
    render(<VersionCheck />);
    await waitFor(() => expect(axiosMock.get).toHaveBeenCalledWith('/version'));
    expect(screen.queryByTestId('version-badge')).toBeNull();
    expect(screen.queryByText('Phiên bản mới available')).toBeNull();
  });

  it('version mới khác seenVersion → badge + modal hiện', async () => {
    axiosMock.get.mockResolvedValue({ data: { version: '1.2.3' } });
    localStorage.setItem(SEEN_VERSION_KEY, '1.0.0');
    render(<VersionCheck />);
    await waitFor(() =>
      expect(screen.queryByTestId('version-badge')).not.toBeNull(),
    );
    expect(await screen.findByText('Phiên bản mới available')).toBeTruthy();
    expect(screen.queryByTestId('version-reload')).toBeTruthy();
  });

  it('seenVersion trùng version → badge có nhưng KHÔNG modal', async () => {
    axiosMock.get.mockResolvedValue({ data: { version: '1.2.3' } });
    localStorage.setItem(SEEN_VERSION_KEY, '1.2.3');
    render(<VersionCheck />);
    await waitFor(() =>
      expect(screen.queryByTestId('version-badge')).not.toBeNull(),
    );
    // Đợi một tick cho effect chạy xong.
    await waitFor(() => expect(axiosMock.get).toHaveBeenCalled());
    expect(screen.queryByText('Phiên bản mới available')).toBeNull();
  });

  it('click reload → setItem seenVersion TRƯỚC reload (thứ tự set→reload)', async () => {
    axiosMock.get.mockResolvedValue({ data: { version: '2.0.0' } });
    render(<VersionCheck />);
    const reloadBtn = await screen.findByTestId('version-reload');
    fireEvent.click(reloadBtn);
    expect(callOrder).toEqual(['set', 'reload']);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
