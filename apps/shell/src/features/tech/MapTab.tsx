/**
 * MapTab — tab "Bản đồ" (SF-24, FI-269): pins đơn giao theo trạng thái trên
 * Leaflet (MapView shared). Fetch KHÔNG filter (spec §4.3 — toàn bộ đơn,
 * pageSize 200 tường minh vì seed hiện tại << 200). Đơn thiếu
 * receiver.location → note đếm ở dưới map (fallback "chưa có tọa độ").
 */
import { useMemo } from 'react';
import { Skeleton } from 'antd';
import { useTranslation } from 'react-i18next';
import { EmptyState, MapView, type StopSpec } from '@hub-store/shared';
import { useTechFetch } from './useTechFetch';
import { filterDeliveryOrders, type DeliveryOrderDto } from './techApi';
import { statusTone, toneColors } from './techHelpers';

const PAGE_SIZE = 200; // tường minh — seed hiện tại << 200 (spec P1)

/** Màu pin theo trạng thái — toneColors(statusTone), KHÔNG hex cứng. */
function pinColor(status: string): string {
  return toneColors(statusTone(status)).text;
}

/**
 * Pure helper — unit test target (plan-critic P0-2): pins có color (tone) +
 * testId `tech-map-pin-<code>` + popupHtml đủ code/status/address/receiver/tel.
 * Đơn thiếu receiver.location → không pin, đếm vào `missing`.
 */
export function buildPins(
  orders: DeliveryOrderDto[],
  callLabel: string,
): { pinned: StopSpec[]; missing: number } {
  const pinned: StopSpec[] = [];
  let missing = 0;
  for (const order of orders) {
    const loc = order.receiver?.location;
    if (!loc) {
      missing++;
      continue;
    }
    pinned.push({
      lat: loc.lat,
      long: loc.long,
      stopOrder: 0,
      orderCode: order.code,
      color: pinColor(order.status),
      testId: `tech-map-pin-${order.code}`,
      popupHtml: `<div class="sf24-tech-popup" data-testid="tech-map-popup-${order.code}"><strong>${order.code}</strong><div>${order.status}</div>${order.province ? `<div>${order.province}</div>` : ''}${order.receiver?.name ? `<div>${order.receiver.name}</div>` : ''}${order.receiver?.phone ? `<a href="tel:${order.receiver.phone}" data-testid="tech-map-call-${order.code}">${callLabel}</a>` : ''}</div>`,
    });
  }
  return { pinned, missing };
}

export function MapTab() {
  const { t } = useTranslation('tech');
  const { data, isLoading, isFetching, error, refetch } = useTechFetch(
    () => filterDeliveryOrders({ page: 1, pageSize: PAGE_SIZE }).then((r) => r.items ?? []),
    [],
  );
  const { pinned, missing } = useMemo(
    () => buildPins(data ?? [], t('map.call')),
    [data, t],
  );

  if (error) {
    return <EmptyState title={t('error.load')} sub={error} actionLabel={t('common.refetch')} onAction={refetch} />;
  }

  return (
    <div
      style={{ opacity: isFetching && !isLoading ? 0.6 : 1, transition: 'opacity .15s ease' }}
      data-testid="tech-map-view"
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          <MapView stops={pinned} scrollWheelZoom height={480} />
          {missing > 0 && (
            <div data-testid="map-no-coords-note" style={{ marginTop: 8 }}>
              {t('map.noCoords', { count: missing })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
