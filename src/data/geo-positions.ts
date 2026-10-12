import type { PositionBasis } from '@/components/geo/GeoMap'
import { det } from '@/utils/deterministic'
import { WARD_BY_ID } from './reference'

/**
 * src/data/geo-positions.ts
 *
 * Where a record is drawn on the real map. Ward boundaries are not loaded,
 * so a record is placed near its ward's representative point (`Ward.centroid`,
 * an approximate location chosen from the ward's localities - see
 * `src/config/bmc/wards.ts`) with a small deterministic spread, so markers
 * that share a ward stay visible. Every such position is reported as
 * `schematic-division` and the map labels it "approximate position"; nothing
 * here claims a surveyed address.
 */

export interface MapPosition {
  lat: number
  lon: number
  positionBasis: PositionBasis
  anchorPlace?: string
}

const KM_PER_DEG_LAT = 110.574

function kmPerDegLon(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180)
}

function round5(n: number): number {
  return Math.round(n * 100_000) / 100_000
}

/** Deterministic display spread around a point, at most `maxKm` from it. */
function spread(lat: number, lon: number, seed: string, maxKm: number): [number, number] {
  const r = det(`geo-jitter:${seed}`)
  const angle = r.float(0, Math.PI * 2)
  const dist = Math.sqrt(r.float(0, 1)) * maxKm
  return [round5(lat + (Math.sin(angle) * dist) / KM_PER_DEG_LAT), round5(lon + (Math.cos(angle) * dist) / kmPerDegLon(lat))]
}

/** A ward's representative point, or undefined for an unknown ward. */
export function wardPosition(wardId: string): MapPosition | undefined {
  const ward = WARD_BY_ID.get(wardId)
  if (!ward?.centroid) return undefined
  return { lat: ward.centroid.lat, lon: ward.centroid.lng, positionBasis: 'schematic-division', anchorPlace: ward.name.split(' · ')[0] }
}

/**
 * Where a record goes on the map: near its ward's representative point, with
 * a small deterministic spread. `text` is accepted for call-site parity with
 * the other deployments and is not geocoded here.
 */
export function positionForRecord(input: { id: string; wardId?: string | null; text?: Array<string | undefined | null> }): MapPosition | null {
  if (!input.wardId) return null
  const ward = wardPosition(input.wardId)
  if (!ward) return null
  const [lat, lon] = spread(ward.lat, ward.lon, input.id, 0.6)
  return { lat, lon, positionBasis: 'schematic-division', anchorPlace: ward.anchorPlace }
}
