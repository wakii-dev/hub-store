/**
 * MOCK route coords — SF-24. Backend CHƯA có tọa độ warehouse/stops
 * (delivery_batch.proto không GeoPoint; REQUIREMENT-GAP FI-245).
 * KHÔNG geocode. Khi backend có GeoPoint → đổi nguồn ở đây, API không đổi.
 */
export interface LatLng { lat: number; long: number }

export const MOCK_WAREHOUSE: LatLng = { lat: 10.7951, long: 106.7218 };

const RADIUS = 0.03;
/** Hash FNV-1a 32-bit — ổn định cross-session. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deriveStopCoord(orderCode: string): LatLng | undefined {
  if (!orderCode) return undefined;
  const h = hash(orderCode);
  const dLat = ((h % 1000) / 1000 - 0.5) * 2 * RADIUS;
  const dLong = ((Math.floor(h / 1000) % 1000) / 1000 - 0.5) * 2 * RADIUS;
  return { lat: MOCK_WAREHOUSE.lat + dLat, long: MOCK_WAREHOUSE.long + dLong };
}
