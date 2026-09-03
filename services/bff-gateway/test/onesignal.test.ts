/**
 * SF-23 T4 — sendOneSignalPush dual-mode (mock globalThis.fetch):
 * (a) real mode (đủ appId+key): POST đúng shape (app_id, included_segments,
 *     headings/contents en) + Authorization Basic;
 * (b) mock mode (thiếu key HOẶC appId): return false ngay, ZERO fetch;
 * (c) fetch reject (timeout/network) → false, KHÔNG throw (push never breaks
 *     event flow);
 * (d) non-2xx → warn + false.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendOneSignalPush } from '../src/lib/onesignal.js';

const FULL_CFG = { appId: 'app-123', restApiKey: 'key-abc' };

describe('sendOneSignalPush', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('real mode — POST đúng URL/shape + Authorization Basic, 2xx → true', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'os-1' }), { status: 200 }));
    await expect(sendOneSignalPush(FULL_CFG, { title: 'Đơn mới', body: 'ORD-1' })).resolves.toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, { method: string; headers: unknown; body: string; signal: AbortSignal }];
    const [url, init] = call;
    expect(url).toBe('https://onesignal.com/api/v1/notifications');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Basic key-abc',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      app_id: 'app-123',
      included_segments: ['Subscribed Users'],
      headings: { en: 'Đơn mới' },
      contents: { en: 'ORD-1' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('mock mode — thiếu restApiKey → false KHÔNG fetch', async () => {
    await expect(sendOneSignalPush({ appId: 'app-123', restApiKey: '' }, { title: 't', body: 'b' }))
      .resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mock mode — thiếu appId → false KHÔNG fetch', async () => {
    await expect(
      sendOneSignalPush({ appId: '', restApiKey: 'key-abc' }, { title: 't', body: 'b' }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch reject (timeout/network) → false KHÔNG throw', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted due to timeout'));
    await expect(sendOneSignalPush(FULL_CFG, { title: 't', body: 'b' })).resolves.toBe(false);
  });

  it('non-ok response → false (warn)', async () => {
    fetchMock.mockResolvedValue(new Response('{"errors":{}}', { status: 400 }));
    await expect(sendOneSignalPush(FULL_CFG, { title: 't', body: 'b' })).resolves.toBe(false);
  });
});
