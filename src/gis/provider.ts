import type { GeoPoint } from '@/types/common'

/**
 * src/gis/provider.ts
 *
 * SCAFFOLDING — not wired into `src/data/geography.ts` or `CityMap.tsx`. See
 * docs/architecture/05-gis-backend.md.
 *
 * The interface a real WFS/WMS/vector-tile source would satisfy, shaped to
 * match what `Ward.polygon` (`src/types/organisation.ts`) already expects -
 * `Array<[number, number]>` in normalised map space - so that swapping the
 * implementation is the only change `geography.ts` and every page rendering
 * through `CityMap.tsx` would need to make.
 */

export interface BoundaryFeature {
  id: string
  /** Normalised polygon in the same [lng, lat]-ordered 0-100 map space Ward.polygon already uses. */
  polygon: Array<[number, number]>
  centroid: GeoPoint
  /** Real survey provenance, once this is backed by an actual source - the field the demo's "illustrative" disclosure has nothing to hold today. */
  surveySource?: string
  surveyedAt?: string
}

export interface GisProvider {
  /** Ward or zone boundaries for the active corporation. */
  wardBoundaries(tenantId: string): Promise<BoundaryFeature[]>
  zoneBoundaries(tenantId: string): Promise<BoundaryFeature[]>
  /**
   * Parcel/building-level geometry, once real survey data and the canonical
   * BuildingId (docs/architecture/02-canonical-data-model.md) both exist.
   * Deliberately optional - most GIS sources this platform would integrate
   * with won't have parcel-level coverage on day one.
   */
  parcelBoundaries?(tenantId: string, wardId: string): Promise<BoundaryFeature[]>
}
