/**
 * AddressMapCard — địa chỉ + bản đồ inline (SF-25 T7): MapView từ shared
 * (height 220, marker testid `ktv-map-pin-<code>`) KHI CÓ toạ độ; không toạ
 * độ → ẩn map, chỉ địa chỉ. "Mở bản đồ" deep-link OSM (target _blank,
 * rel noopener). Mọi giá trị nội suy vào popupHtml (raw HTML Leaflet) và
 * URL PHẢI qua escapeHtml — pattern code-review P1 MapTab SF-24.
 */
import { useTranslation } from 'react-i18next';
import { DESIGN_TOKENS, escapeHtml, MapView, type StopSpec } from '@hub-store/shared';

export interface Coords {
  lat: number;
  long: number;
}

/**
 * Deep-link OSM marker — coords inject qua escapeHtml (số thuần là no-op,
 * rule là escape MỌI interpolation vào URL/popup).
 */
export function buildOsmUrl(lat: number, lng: number): string {
  const la = escapeHtml(String(lat));
  const lo = escapeHtml(String(lng));
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`;
}

/** StopSpec cho MapView — popupHtml là raw HTML: escape từng giá trị. */
export function buildStop(props: {
  code: string;
  address: string;
  coords: Coords;
}): StopSpec {
  const code = escapeHtml(props.code);
  return {
    lat: props.coords.lat,
    long: props.coords.long,
    stopOrder: 1,
    orderCode: code,
    testId: `ktv-map-pin-${props.code}`,
    popupHtml: `<div><strong>${code}</strong><div>${escapeHtml(props.address)}</div></div>`,
  };
}

export default function AddressMapCard(props: {
  code: string;
  province: string;
  /** Ghi chú điều phối (delivery coordination.note) — hiển thị kèm địa chỉ. */
  note?: string;
  coords: Coords | null;
}) {
  const { t } = useTranslation('ktvMobile');
  const address = props.note ? `${props.province} · ${props.note}` : props.province;
  return (
    <div
      data-testid="ktv-address-card"
      style={{
        background: DESIGN_TOKENS.color.bgWhite,
        border: `1px solid ${DESIGN_TOKENS.color.divider}`,
        borderRadius: DESIGN_TOKENS.radius.lg,
        boxShadow: DESIGN_TOKENS.shadow.xs,
        padding: '12px 14px',
        marginBottom: 10,
      }}
    >
      <h3
        style={{
          margin: '0 0 6px',
          fontSize: DESIGN_TOKENS.typography.overline.fontSize,
          fontWeight: DESIGN_TOKENS.typography.overline.fontWeight,
          textTransform: 'uppercase',
          color: DESIGN_TOKENS.color.textMuted,
        }}
      >
        {t('detail.address')}
      </h3>
      <p
        data-testid="ktv-address-text"
        style={{
          margin: 0,
          fontSize: DESIGN_TOKENS.typography.body.fontSize,
          color: DESIGN_TOKENS.color.textPrimary,
        }}
      >
        {address}
      </p>
      {props.coords ? (
        <>
          {/* wrapper overflow hidden — MapView width 100% nhưng Leaflet pane
              có thể tràn 1-2px trên 375px (plan-critic P2 overflow check). */}
          <div
            style={{
              marginTop: 10,
              borderRadius: DESIGN_TOKENS.radius.md,
              overflow: 'hidden',
            }}
          >
            <MapView
              height={220}
              stops={[
                buildStop({
                  code: props.code,
                  address,
                  coords: props.coords,
                }),
              ]}
            />
          </div>
          <a
            href={buildOsmUrl(props.coords.lat, props.coords.long)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="ktv-map-open"
            style={{
              display: 'inline-block',
              marginTop: 10,
              color: DESIGN_TOKENS.color.primary,
              fontWeight: 600,
              fontSize: DESIGN_TOKENS.typography.body.fontSize,
              textDecoration: 'none',
            }}
          >
            {t('detail.map.open')} ↗
          </a>
        </>
      ) : null}
    </div>
  );
}
