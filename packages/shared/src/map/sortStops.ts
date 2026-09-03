/**
 * sortStops (SF-24) — tách khỏi mapController để map/index có surface
 * leaflet-free lúc import (mapController import leaflet tĩnh, chỉ được reached
 * qua dynamic import của MapView — regression index.node.test.ts).
 */

/** Sắp stops theo stopOrder tăng dần — nguồn sự thật duy nhất về thứ tự. */
export function sortStops<T extends { stopOrder: number }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
}
