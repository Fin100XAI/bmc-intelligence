import { BMC_WARD_BOUNDARIES } from './bmc-ward-boundaries'

/**
 * src/data/bmc-ward-lookup.ts
 *
 * Which Brihanmumbai ward a position falls in, by point-in-polygon against the
 * surveyed ward outlines. The outlines are simplified to about 30 m, so a
 * site on a ward line or on the shore can fall just outside every ward; it is
 * then given the ward whose centroid is nearest.
 */

function inside(lat: number, lng: number, ring: Array<[number, number]>): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i] as [number, number]
    const [yj, xj] = ring[j] as [number, number]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** The ward code (e.g. 'K/W') a position falls in. */
export function bmcWardCodeAt(lat: number, lng: number): string {
  let nearest = ''
  let best = Infinity
  for (const [code, bound] of Object.entries(BMC_WARD_BOUNDARIES)) {
    if (inside(lat, lng, bound.ring)) return code
    const d = (bound.centroid.lat - lat) ** 2 + (bound.centroid.lng - lng) ** 2
    if (d < best) {
      best = d
      nearest = code
    }
  }
  return nearest
}
