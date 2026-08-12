import type { GeoPoint } from '@/types/common'

/**
 * Distance between two points on the municipal map.
 *
 * Equirectangular approximation, which is ample at municipal distances: the
 * error against a full great-circle calculation is under a metre across the
 * span of the largest corporation in the state, and the inputs are illustrative
 * centroids rather than surveyed coordinates in the first place.
 *
 * This is a STRAIGHT-LINE distance and must never be presented as a routed
 * drive distance or used to state a travel time - the road network, one-ways
 * and level crossings all sit between the two numbers.
 */
export function greatCircleKm(a: GeoPoint, b: GeoPoint): number {
  const meanLat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const dx = (b.lng - a.lng) * Math.cos(meanLat) * 111.32
  const dy = (b.lat - a.lat) * 110.57
  return Math.sqrt(dx * dx + dy * dy)
}
