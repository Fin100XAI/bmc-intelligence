import type { GeoPoint } from '@/types/common'
import { activeCorporation } from '@/config/municipality.config'
import { resolveDivisions, resolveZoneCount } from '@/config/corporations'
import { generateCityGeography } from './geo-generator'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * The active corporation's ward geometry.
 *
 * Brihanmumbai's twenty-four wards are hand-authored below, in a normalised
 * 0–100 map space, purely so that spatial relationships (island city in the
 * south, western and eastern suburbs to the north, the protected forest belt
 * between them) are legible. Every other corporation's geometry is generated
 * from its own published administrative divisions, area, population and
 * physical form - see `./geo-generator.ts`.
 *
 * In neither case are these official GIS boundaries, and they must never be
 * presented as such - every spatial surface carries that statement, and
 * `municipality.mapConfiguration.provenanceStatement` states it per
 * corporation.
 */

export interface WardGeometrySpec {
  code: string
  name: string
  /** Corporation-specific grouping label, e.g. "Western Suburbs" or "North". */
  region: string
  zoneCode: string
  /** Approximate real-world centroid, used only for distance heuristics. */
  centroid: GeoPoint
  polygon: Array<[number, number]>
  areaSqKm: number
  population: number
  floodProne: boolean
}

/** Non-municipal reference features drawn behind the ward layer. */
export interface MapBackdropFeature {
  id: string
  label: string
  kind: 'forest' | 'water' | 'creek' | 'river' | 'lake'
  polygon: Array<[number, number]>
}

export interface ZoneSpec {
  code: string
  name: string
  region: string
}

function build$MUMBAI_BACKDROP_FEATURES(): MapBackdropFeature[] {
  return [
  {
    id: 'sgnp',
    label: t('Protected Forest Belt'),
    kind: 'forest',
    polygon: [
      [45, 8],
      [51, 12],
      [52, 24],
      [49, 34],
      [45, 38],
      [43, 30],
      [44, 18],
    ],
  },
  {
    id: 'arabian-sea',
    label: t('Arabian Sea'),
    kind: 'water',
    polygon: [
      [0, 0],
      [21, 0],
      [21, 20],
      [24, 40],
      [21, 56],
      [27, 66],
      [30, 78],
      [34, 92],
      [40, 100],
      [0, 100],
    ],
  },
  {
    id: 'harbour',
    label: t('Mumbai Harbour'),
    kind: 'water',
    polygon: [
      [82, 40],
      [100, 42],
      [100, 100],
      [58, 100],
      [56, 88],
      [60, 74],
      [66, 60],
      [74, 48],
    ],
  },
  {
    id: 'thane-creek',
    label: t('Thane Creek'),
    kind: 'creek',
    polygon: [
      [72, 10],
      [82, 12],
      [84, 30],
      [82, 42],
      [74, 48],
      [71, 38],
      [70, 24],
    ],
  },
]
}
let MUMBAI_BACKDROP_FEATURES: MapBackdropFeature[] = build$MUMBAI_BACKDROP_FEATURES()
registerLayer(() => {
  MUMBAI_BACKDROP_FEATURES = build$MUMBAI_BACKDROP_FEATURES()
})

function build$MUMBAI_WARD_GEOMETRY(): WardGeometrySpec[] {
  return [
  // ------------------------------------------------------------ Island City
  {
    code: 'A',
    name: t('Colaba · Fort · Churchgate'),
    region: 'City',
    zoneCode: 'Z1',
    centroid: { lat: 18.9067, lng: 72.8147 },
    polygon: [
      [45, 100],
      [56, 96],
      [57, 89],
      [50, 86],
      [43, 88],
      [41, 94],
    ],
    areaSqKm: 12.5,
    population: 210847,
    floodProne: true,
  },
  {
    code: 'B',
    name: t('Sandhurst Road · Dongri'),
    region: 'City',
    zoneCode: 'Z1',
    centroid: { lat: 18.9509, lng: 72.8347 },
    polygon: [
      [43, 88],
      [50, 86],
      [57, 89],
      [58, 84],
      [51, 81],
      [43, 83],
    ],
    areaSqKm: 2.5,
    population: 140633,
    floodProne: true,
  },
  {
    code: 'C',
    name: t('Marine Lines · Kalbadevi'),
    region: 'City',
    zoneCode: 'Z1',
    centroid: { lat: 18.9503, lng: 72.8231 },
    polygon: [
      [43, 83],
      [51, 81],
      [58, 84],
      [58, 78],
      [50, 76],
      [42, 78],
    ],
    areaSqKm: 1.8,
    population: 166161,
    floodProne: true,
  },
  {
    code: 'D',
    name: t('Malabar Hill · Grant Road'),
    region: 'City',
    zoneCode: 'Z1',
    centroid: { lat: 18.9647, lng: 72.8089 },
    polygon: [
      [33, 82],
      [42, 78],
      [50, 76],
      [49, 70],
      [39, 69],
      [32, 74],
    ],
    areaSqKm: 6.6,
    population: 346866,
    floodProne: false,
  },
  {
    code: 'E',
    name: t('Byculla · Mazgaon'),
    region: 'City',
    zoneCode: 'Z1',
    centroid: { lat: 18.9757, lng: 72.8377 },
    polygon: [
      [50, 76],
      [58, 78],
      [59, 71],
      [57, 68],
      [49, 70],
    ],
    areaSqKm: 7.4,
    population: 393286,
    floodProne: true,
  },
  {
    code: 'F/S',
    name: t('Parel · Sewri'),
    region: 'City',
    zoneCode: 'Z2',
    centroid: { lat: 18.9967, lng: 72.8422 },
    polygon: [
      [49, 70],
      [57, 68],
      [59, 63],
      [56, 60],
      [47, 62],
    ],
    areaSqKm: 13.5,
    population: 396122,
    floodProne: true,
  },
  {
    code: 'G/S',
    name: t('Worli · Prabhadevi'),
    region: 'City',
    zoneCode: 'Z2',
    centroid: { lat: 19.0026, lng: 72.8194 },
    polygon: [
      [30, 72],
      [39, 69],
      [49, 70],
      [47, 62],
      [38, 61],
      [30, 65],
    ],
    areaSqKm: 10.4,
    population: 457931,
    floodProne: true,
  },
  {
    code: 'F/N',
    name: t('Matunga · Sion · Wadala'),
    region: 'City',
    zoneCode: 'Z2',
    centroid: { lat: 19.0269, lng: 72.8553 },
    polygon: [
      [47, 62],
      [56, 60],
      [58, 54],
      [52, 51],
      [45, 54],
    ],
    areaSqKm: 12.9,
    population: 524393,
    floodProne: true,
  },
  {
    code: 'G/N',
    name: t('Dadar · Dharavi · Mahim'),
    region: 'City',
    zoneCode: 'Z2',
    centroid: { lat: 19.0293, lng: 72.8434 },
    polygon: [
      [30, 65],
      [38, 61],
      [47, 62],
      [45, 54],
      [36, 53],
      [29, 58],
    ],
    areaSqKm: 9.3,
    population: 582007,
    floodProne: true,
  },

  // -------------------------------------------------------- Western Suburbs
  {
    code: 'H/W',
    name: t('Bandra West · Khar West'),
    region: 'Western Suburbs',
    zoneCode: 'Z3',
    centroid: { lat: 19.0596, lng: 72.8295 },
    polygon: [
      [26, 58],
      [36, 53],
      [41, 52],
      [40, 45],
      [30, 45],
      [25, 51],
    ],
    areaSqKm: 12.6,
    population: 336778,
    floodProne: true,
  },
  {
    code: 'H/E',
    name: t('Santacruz East · Kalina'),
    region: 'Western Suburbs',
    zoneCode: 'Z3',
    centroid: { lat: 19.0805, lng: 72.8567 },
    polygon: [
      [41, 52],
      [52, 51],
      [53, 44],
      [46, 42],
      [40, 45],
    ],
    areaSqKm: 13.6,
    population: 580835,
    floodProne: true,
  },
  {
    code: 'K/W',
    name: t('Andheri West · Juhu · Versova'),
    region: 'Western Suburbs',
    zoneCode: 'Z4',
    centroid: { lat: 19.1268, lng: 72.8299 },
    polygon: [
      [23, 50],
      [30, 45],
      [40, 45],
      [39, 36],
      [28, 35],
      [22, 41],
    ],
    areaSqKm: 24.4,
    population: 748688,
    floodProne: true,
  },
  {
    code: 'K/E',
    name: t('Andheri East · Vile Parle East'),
    region: 'Western Suburbs',
    zoneCode: 'Z3',
    centroid: { lat: 19.1197, lng: 72.8697 },
    polygon: [
      [40, 45],
      [46, 42],
      [53, 44],
      [52, 35],
      [45, 33],
      [39, 36],
    ],
    areaSqKm: 24.8,
    population: 823885,
    floodProne: true,
  },
  {
    code: 'P/S',
    name: t('Goregaon · Aarey'),
    region: 'Western Suburbs',
    zoneCode: 'Z4',
    centroid: { lat: 19.1646, lng: 72.8493 },
    polygon: [
      [24, 40],
      [28, 35],
      [39, 36],
      [45, 33],
      [45, 27],
      [33, 26],
      [24, 30],
    ],
    areaSqKm: 26.5,
    population: 463507,
    floodProne: false,
  },
  {
    code: 'P/N',
    name: t('Malad · Kandivali West'),
    region: 'Western Suburbs',
    zoneCode: 'Z4',
    centroid: { lat: 19.1866, lng: 72.848 },
    polygon: [
      [23, 30],
      [33, 26],
      [45, 27],
      [45, 20],
      [32, 18],
      [22, 22],
    ],
    areaSqKm: 32.6,
    population: 941366,
    floodProne: true,
  },
  {
    code: 'R/S',
    name: t('Kandivali East · Charkop'),
    region: 'Western Suburbs',
    zoneCode: 'Z5',
    centroid: { lat: 19.2094, lng: 72.8526 },
    polygon: [
      [22, 22],
      [32, 18],
      [45, 20],
      [45, 14],
      [31, 12],
      [22, 15],
    ],
    areaSqKm: 16.5,
    population: 691229,
    floodProne: false,
  },
  {
    code: 'R/C',
    name: t('Borivali · Gorai'),
    region: 'Western Suburbs',
    zoneCode: 'Z5',
    centroid: { lat: 19.2307, lng: 72.8567 },
    polygon: [
      [22, 15],
      [31, 12],
      [45, 14],
      [45, 8],
      [30, 6],
      [22, 9],
    ],
    areaSqKm: 26.6,
    population: 562162,
    floodProne: false,
  },
  {
    code: 'R/N',
    name: t('Dahisar · Mandapeshwar'),
    region: 'Western Suburbs',
    zoneCode: 'Z5',
    centroid: { lat: 19.2515, lng: 72.8593 },
    polygon: [
      [22, 9],
      [30, 6],
      [45, 8],
      [44, 2],
      [28, 1],
      [23, 4],
    ],
    areaSqKm: 12.5,
    population: 431368,
    floodProne: true,
  },

  // -------------------------------------------------------- Eastern Suburbs
  {
    code: 'L',
    name: t('Kurla · Chunabhatti'),
    region: 'Eastern Suburbs',
    zoneCode: 'Z6',
    centroid: { lat: 19.0728, lng: 72.8826 },
    polygon: [
      [52, 51],
      [64, 50],
      [67, 44],
      [60, 41],
      [53, 44],
    ],
    areaSqKm: 16.1,
    population: 902225,
    floodProne: true,
  },
  {
    code: 'M/W',
    name: t('Chembur · Tilak Nagar'),
    region: 'Eastern Suburbs',
    zoneCode: 'Z6',
    centroid: { lat: 19.0473, lng: 72.8974 },
    polygon: [
      [53, 44],
      [60, 41],
      [67, 44],
      [69, 38],
      [62, 34],
      [53, 37],
    ],
    areaSqKm: 18.2,
    population: 414050,
    floodProne: true,
  },
  {
    code: 'M/E',
    name: t('Govandi · Mankhurd · Deonar'),
    region: 'Eastern Suburbs',
    zoneCode: 'Z6',
    centroid: { lat: 19.0532, lng: 72.9265 },
    polygon: [
      [67, 44],
      [78, 42],
      [80, 34],
      [72, 30],
      [69, 38],
    ],
    areaSqKm: 32.5,
    population: 807720,
    floodProne: true,
  },
  {
    code: 'N',
    name: t('Ghatkopar · Vikhroli'),
    region: 'Eastern Suburbs',
    zoneCode: 'Z7',
    centroid: { lat: 19.0916, lng: 72.9084 },
    polygon: [
      [53, 37],
      [62, 34],
      [69, 38],
      [72, 30],
      [63, 26],
      [53, 29],
    ],
    areaSqKm: 25.9,
    population: 622853,
    floodProne: false,
  },
  {
    code: 'S',
    name: t('Bhandup · Kanjurmarg · Powai'),
    region: 'Eastern Suburbs',
    zoneCode: 'Z7',
    centroid: { lat: 19.1435, lng: 72.9351 },
    polygon: [
      [51, 29],
      [63, 26],
      [72, 30],
      [73, 20],
      [62, 16],
      [51, 20],
    ],
    areaSqKm: 63.9,
    population: 743783,
    floodProne: true,
  },
  {
    code: 'T',
    name: t('Mulund · Nahur'),
    region: 'Eastern Suburbs',
    zoneCode: 'Z7',
    centroid: { lat: 19.1726, lng: 72.9425 },
    polygon: [
      [51, 20],
      [62, 16],
      [73, 20],
      [72, 10],
      [60, 7],
      [51, 11],
    ],
    areaSqKm: 35.9,
    population: 341463,
    floodProne: false,
  },
]
}
let MUMBAI_WARD_GEOMETRY: WardGeometrySpec[] = build$MUMBAI_WARD_GEOMETRY()
registerLayer(() => {
  MUMBAI_WARD_GEOMETRY = build$MUMBAI_WARD_GEOMETRY()
})

function build$MUMBAI_ZONE_SPECS(): ZoneSpec[] {
  return [
  { code: 'Z1', name: t('Zone I - South Mumbai'), region: 'City' },
  { code: 'Z2', name: t('Zone II - Central City'), region: 'City' },
  { code: 'Z3', name: t('Zone III - Bandra to Andheri East'), region: 'Western Suburbs' },
  { code: 'Z4', name: t('Zone IV - Andheri West to Malad'), region: 'Western Suburbs' },
  { code: 'Z5', name: t('Zone V - Kandivali to Dahisar'), region: 'Western Suburbs' },
  { code: 'Z6', name: t('Zone VI - Kurla to Mankhurd'), region: 'Eastern Suburbs' },
  { code: 'Z7', name: t('Zone VII - Ghatkopar to Mulund'), region: 'Eastern Suburbs' },
]
}
let MUMBAI_ZONE_SPECS: ZoneSpec[] = build$MUMBAI_ZONE_SPECS()
registerLayer(() => {
  MUMBAI_ZONE_SPECS = build$MUMBAI_ZONE_SPECS()
})

/** Centroid of an illustrative ward polygon in normalised map space. */
export function polygonCentroid(polygon: Array<[number, number]>): [number, number] {
  const n = polygon.length
  if (n === 0) return [50, 50]
  let x = 0
  let y = 0
  for (const [px, py] of polygon) {
    x += px
    y += py
  }
  return [x / n, y / n]
}

/** Serialise a polygon for an SVG `points` attribute. */
export function polygonPoints(polygon: Array<[number, number]>): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ')
}

/** ---------------------------------------------------------------------
 * The active corporation's geography
 * ---------------------------------------------------------------------
 *
 * Brihanmumbai keeps the hand-authored geometry above - Mumbai's form is
 * specific enough to be worth drawing, and it is the deployment this build was
 * originally written for. Every other corporation's geometry is generated from
 * its own published administrative divisions and its real area, population and
 * physical form (see `geo-generator.ts`, which documents exactly which parts of
 * the result are real and which are schematic).
 *
 * These three exports are LIVE BINDINGS, rebuilt on every corporation switch.
 * ------------------------------------------------------------------- */

export let WARD_GEOMETRY: WardGeometrySpec[] = MUMBAI_WARD_GEOMETRY
export let ZONE_SPECS: ZoneSpec[] = MUMBAI_ZONE_SPECS
export let MAP_BACKDROP_FEATURES: MapBackdropFeature[] = MUMBAI_BACKDROP_FEATURES

registerLayer(() => {
  const corp = activeCorporation

  if (corp.id === 'bmc') {
    WARD_GEOMETRY = MUMBAI_WARD_GEOMETRY
    ZONE_SPECS = MUMBAI_ZONE_SPECS
    MAP_BACKDROP_FEATURES = MUMBAI_BACKDROP_FEATURES
    return
  }

  const generated = generateCityGeography({
    seed: corp.id,
    areaSqKm: corp.areaSqKm,
    population: corp.population2011,
    divisions: resolveDivisions(corp),
    zoneNames: corp.zoneNames && corp.zoneNames.length > 0 ? corp.zoneNames : null,
    formType: corp.form.type,
    waterBodies: corp.form.waterBodies,
    greenBelt: corp.form.greenBelt,
    latLng: corp.latLng,
  })

  // `resolveZoneCount` is the single source of truth the configuration quotes
  // in `administrativeUnits.zones`; assert the generator agreed with it rather
  // than letting the map and the interface disagree silently.
  const expectedZones = resolveZoneCount(corp)
  if (generated.zones.length !== expectedZones) {
    // eslint-disable-next-line no-console
    console.warn(
      `[geography] ${corp.shortName}: generated ${generated.zones.length} zones, configuration declares ${expectedZones}.`,
    )
  }

  WARD_GEOMETRY = generated.wards
  ZONE_SPECS = generated.zones
  MAP_BACKDROP_FEATURES = generated.backdrop
})
