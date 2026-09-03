/**
 * MapTab tests (SF-24) — TDD theo plan Step 3.2: mock filterDeliveryOrders +
 * stub MapView (jsdom không render leaflet thật — mock ở MapView level,
 * KHÔNG mock leaflet global). Assert TRÊN helper buildPins (plan-critic P0-2),
 * không assert DOM pin.
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { initI18n } from '@hub-store/shared';
import { techResources } from './tech.i18n';
import { statusTone, toneColors } from './techHelpers';
import type { DeliveryOrderDto } from './techApi';

const mocks = vi.hoisted(() => ({
  filterDeliveryOrders: vi.fn(),
}));

vi.mock('./techApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./techApi')>();
  return { ...actual, filterDeliveryOrders: mocks.filterDeliveryOrders };
});

vi.mock('@hub-store/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hub-store/shared')>();
  return {
    ...actual,
    MapView: (props: { stops?: unknown[]; height?: number }) => (
      <div data-testid="map-view-stub" style={{ height: props.height }} />
    ),
  };
});

import { buildPins, MapTab } from './MapTab';

function order(props: Partial<DeliveryOrderDto>): DeliveryOrderDto {
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
    ...props,
  };
}

const WITH_LOC = order({
  code: 'TD-0001',
  status: 'SHIPPING',
  receiver: { name: 'Ngô Thị Giang', phone: '0912000001', location: { lat: 10.762, long: 106.68 } },
});
const NO_LOC = order({ code: 'TD-0002', status: 'DELIVERED' });

function renderTab(ui: React.ReactNode) {
  const i18n = initI18n({ resources: techResources });
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

beforeEach(() => mocks.filterDeliveryOrders.mockReset());
afterEach(cleanup);

describe('buildPins — pure helper (plan-critic P0-2)', () => {
  it('pin có location: color = toneColors(statusTone(status)).text (không hex copy)', () => {
    const { pinned } = buildPins([WITH_LOC, NO_LOC], 'Gọi');
    expect(pinned).toHaveLength(1);
    expect(pinned[0].color).toBe(toneColors(statusTone('SHIPPING')).text);
    expect(pinned[0].lat).toBe(10.762);
    expect(pinned[0].long).toBe(106.68);
  });

  it('pin testId `tech-map-pin-<code>` + popupHtml đủ code/status/địa phương/receiver/tel', () => {
    const { pinned } = buildPins([WITH_LOC, NO_LOC], 'Gọi');
    expect(pinned[0].testId).toBe('tech-map-pin-TD-0001');
    const html = pinned[0].popupHtml ?? '';
    expect(html).toContain('tech-map-popup-TD-0001');
    expect(html).toContain('<strong>TD-0001</strong>');
    expect(html).toContain('SHIPPING');
    expect(html).toContain('TP. Hồ Chí Minh');
    expect(html).toContain('Ngô Thị Giang');
    expect(html).toContain('href="tel:0912000001"');
    expect(html).toContain('tech-map-call-TD-0001');
    expect(html).toContain('>Gọi</a>');
  });

  it('escape HTML trong code/status/receiver/phone — <script> + quote render escaped (code-review P1)', () => {
    const evil = order({
      code: 'TD-EVIL',
      status: 'SHIPPING',
      receiver: {
        name: `Giang <script>alert("x")</script>`,
        phone: `0912"'><img src=x>`,
        location: { lat: 10.762, long: 106.68 },
      },
    });
    const { pinned } = buildPins([evil], 'Gọi');
    const html = pinned[0].popupHtml ?? '';
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="tel:0912"');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&#39;&gt;&lt;img');
    expect(html).toContain(`href="tel:0912&quot;&#39;&gt;&lt;img src=x&gt;"`);
    expect(html).toContain(`data-testid="tech-map-call-TD-EVIL"`);
  });

  it('order thiếu location: không pin + missing = 1', () => {
    const { pinned, missing } = buildPins([WITH_LOC, NO_LOC], 'Gọi');
    expect(pinned.map((p) => p.orderCode)).not.toContain('TD-0002');
    expect(missing).toBe(1);
  });

  it('tất cả có location → missing = 0', () => {
    const { missing } = buildPins([WITH_LOC], 'Gọi');
    expect(missing).toBe(0);
  });
});

describe('MapTab — render (MapView stub)', () => {
  it('fetch OK → tech-map-view + map-no-coords-note chứa "1"', async () => {
    mocks.filterDeliveryOrders.mockResolvedValue({ items: [WITH_LOC, NO_LOC], total: 2, page: 1, pageSize: 200 });
    renderTab(<MapTab />);
    await waitFor(() => expect(screen.getByTestId('map-no-coords-note').textContent).toContain('1'));
    expect(screen.getByTestId('tech-map-view')).toBeTruthy();
    expect(mocks.filterDeliveryOrders).toHaveBeenCalledWith({ page: 1, pageSize: 200 });
  });
});
