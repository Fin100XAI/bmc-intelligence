import type { GeoPoint } from '@/types/common'
import { det } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/data/geo-generator.ts
 *
 * ILLUSTRATIVE CITY GEOMETRY GENERATOR
 *
 * Brihanmumbai's twenty-four ward polygons are hand-authored (see
 * `geography.ts`) because Mumbai's form - a narrow southern peninsula, two
 * suburban arms either side of a protected forest belt - is unmistakable and
 * worth drawing by hand. The platform now serves every municipal corporation
 * in Maharashtra, and hand-drawing twenty-eight more cities would produce
 * twenty-eight sets of invented boundaries carrying the same false authority.
 *
 * So this module generates them instead, and states plainly what they are:
 *
 *   - The ward COUNT and the ward NAMES are real - they come from the
 *     administrative divisions each corporation publishes.
 *   - The ward AREAS and POPULATIONS sum to the corporation's real published
 *     area and Census population; the split between wards is modelled.
 *   - The BOUNDARIES are a schematic tessellation. They are not surveyed, not
 *     derived from any GIS source, and are never presented as such. What they
 *     preserve is topology - which wards adjoin which, how many there are,
 *     where the water and the green belt sit relative to the built-up area -
 *     because that is what the spatial surfaces in this platform actually
 *     reason over.
 *
 * The construction is a bounded Voronoi tessellation: seed points are placed
 * by phyllotaxis inside a convex city outline, relaxed toward their cell
 * centroids (Lloyd's algorithm), then each cell is cut out of the outline by
 * half-plane clipping against every other seed. That yields cells which tile
 * the outline exactly, never overlap, and are close to equal-area before the
 * modelled density weighting is applied.
 *
 * Everything here is seeded through `det()`. The same corporation always
 * produces the same city.
 */

/** ---------------------------------------------------------------------
 * Geometry primitives - normalised 0-100 map space
 * ------------------------------------------------------------------- */

export type Point = [number, number]
export type Polygon = Point[]

/** Signed area via the shoelace formula. Positive for counter-clockwise. */
export function polygonArea(poly: Polygon): number {
  let sum = 0
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i] as Point
    const [x2, y2] = poly[(i + 1) % poly.length] as Point
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

/** Area-weighted centroid. Falls back to the vertex mean for degenerate input. */
export function polygonCentroidOf(poly: Polygon): Point {
  const n = poly.length
  if (n === 0) return [50, 50]
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = poly[i] as Point
    const [x2, y2] = poly[(i + 1) % n] as Point
    const cross = x1 * y2 - x2 * y1
    a += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }
  if (Math.abs(a) < 1e-9) {
    const mx = poly.reduce((s, p) => s + p[0], 0) / n
    const my = poly.reduce((s, p) => s + p[1], 0) / n
    return [mx, my]
  }
  a *= 0.5
  return [cx / (6 * a), cy / (6 * a)]
}

/**
 * Sutherland-Hodgman clip of `poly` against the half-plane `nx·x + ny·y <= d`.
 * Exact for the convex subjects this module produces.
 */
export function clipHalfPlane(poly: Polygon, nx: number, ny: number, d: number): Polygon {
  if (poly.length === 0) return []
  const out: Polygon = []
  const inside = (p: Point): boolean => nx * p[0] + ny * p[1] <= d + 1e-9
  const intersect = (a: Point, b: Point): Point => {
    const da = nx * a[0] + ny * a[1] - d
    const db = nx * b[0] + ny * b[1] - d
    const entry = da / (da - db)
    return [a[0] + (b[0] - a[0]) * entry, a[1] + (b[1] - a[1]) * entry]
  }

  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i] as Point
    const prev = poly[(i + poly.length - 1) % poly.length] as Point
    const curIn = inside(cur)
    const prevIn = inside(prev)
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (prevIn) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Polygon): Polygon {
  if (points.length < 3) return [...points]
  const pts = [...points].sort((p, q) => (p[0] === q[0] ? p[1] - q[1] : p[0] - q[0]))
  const cross = (o: Point, a: Point, b: Point): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower: Polygon = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as Point, lower[lower.length - 1] as Point, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: Polygon = []
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i] as Point
    while (upper.length >= 2 && cross(upper[upper.length - 2] as Point, upper[upper.length - 1] as Point, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/** Rounds a polygon's coordinates so the emitted SVG stays compact. */
function tidy(poly: Polygon): Polygon {
  return poly.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as Point)
}

/** ---------------------------------------------------------------------
 * City form
 * ------------------------------------------------------------------- */

export type CityFormType = 'coastal' | 'creek-side' | 'riverine' | 'lakeside' | 'inland' | 'hill'

export interface CityFormSpec {
  /** Stable seed - the corporation id. */
  seed: string
  areaSqKm: number
  population: number
  /** Real published administrative divisions, in the corporation's own order. */
  divisions: Array<{ name: string; note?: string | null }>
  /** Real published zone tier, where the corporation has one above its wards. */
  zoneNames: string[] | null
  formType: CityFormType
  /** Real named rivers, creeks, lakes or sea drawn behind the ward layer. */
  waterBodies: string[]
  /** Real named forest, hills or protected area, where the city has one. */
  greenBelt: string | null
  /** Approximate real-world centroid of the corporation area. */
  latLng: GeoPoint
}

export interface GeneratedWard {
  code: string
  name: string
  region: string
  zoneCode: string
  centroid: GeoPoint
  polygon: Polygon
  areaSqKm: number
  population: number
  floodProne: boolean
}

export interface GeneratedZone {
  code: string
  name: string
  region: string
}

export interface GeneratedBackdrop {
  id: string
  label: string
  kind: 'forest' | 'water' | 'creek' | 'river' | 'lake'
  polygon: Polygon
}

export interface GeneratedGeography {
  wards: GeneratedWard[]
  zones: GeneratedZone[]
  backdrop: GeneratedBackdrop[]
  outline: Polygon
}

const MAP_CENTRE: Point = [50, 50]

/**
 * A convex city outline. Convex by construction (hull of jittered radial
 * samples, then half-plane cuts for coast and creek) so the Voronoi clipping
 * below is exact and every cell stays a well-formed polygon.
 */
function buildOutline(spec: CityFormSpec): { outline: Polygon; coastX: number | null; creekX: number | null } {
  const r = det(`city-outline:${spec.seed}`)
  const samples: Polygon = []
  const rings = 18
  // Elongation: coastal and creek-side cities run north-south along the water;
  // inland cities are rounder.
  const stretchY = spec.formType === 'coastal' || spec.formType === 'creek-side' ? r.float(1.12, 1.3) : r.float(0.94, 1.08)

  for (let i = 0; i < rings; i += 1) {
    const theta = (i / rings) * Math.PI * 2
    const wobble = r.float(0.84, 1.06)
    const rx = 33 * wobble
    const ry = 33 * wobble * stretchY
    samples.push([MAP_CENTRE[0] + Math.cos(theta) * rx, MAP_CENTRE[1] + Math.sin(theta) * ry])
  }

  let outline = convexHull(samples)

  let coastX: number | null = null
  let creekX: number | null = null

  if (spec.formType === 'coastal') {
    coastX = r.round(19, 24, 1)
    // Keep the built-up area east of the shoreline: -x <= -coastX.
    outline = clipHalfPlane(outline, -1, 0, -coastX)
  }
  if (spec.formType === 'creek-side') {
    creekX = r.round(76, 81, 1)
    outline = clipHalfPlane(outline, 1, 0, creekX)
  }

  return { outline: tidy(outline), coastX, creekX }
}

/** Voronoi cell for `seeds[index]`, clipped to `outline`. */
function voronoiCell(outline: Polygon, seeds: Polygon, index: number): Polygon {
  const si = seeds[index] as Point
  let cell = outline
  for (let j = 0; j < seeds.length; j += 1) {
    if (j === index) continue
    const sj = seeds[j] as Point
    const nx = 2 * (sj[0] - si[0])
    const ny = 2 * (sj[1] - si[1])
    const d = sj[0] * sj[0] + sj[1] * sj[1] - (si[0] * si[0] + si[1] * si[1])
    cell = clipHalfPlane(cell, nx, ny, d)
    if (cell.length === 0) break
  }
  return cell
}

/**
 * Phyllotaxis placement inside the outline's bounding ellipse, then three
 * rounds of Lloyd relaxation so the resulting wards are close to equal-area
 * before density weighting.
 */
function placeSeeds(outline: Polygon, count: number, seed: string): Polygon {
  const r = det(`city-seeds:${seed}`)
  const centre = polygonCentroidOf(outline)
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2

  const GOLDEN = Math.PI * (3 - Math.sqrt(5))
  let seeds: Polygon = Array.from({ length: count }, (_, k) => {
    const radius = Math.sqrt((k + 0.5) / count) * 0.86
    const theta = k * GOLDEN + r.float(0, 0.6)
    return [
      centre[0] + Math.cos(theta) * radius * rx,
      centre[1] + Math.sin(theta) * radius * ry,
    ] as Point
  })

  for (let iteration = 0; iteration < 3; iteration += 1) {
    seeds = seeds.map((s, i) => {
      const cell = voronoiCell(outline, seeds, i)
      return cell.length >= 3 ? polygonCentroidOf(cell) : s
    })
  }

  return seeds
}

/** Compass band a point falls into, relative to the city centroid. */
function regionOf(point: Point, centre: Point, bands: 3 | 5): string {
  const dy = point[1] - centre[1]
  const dx = point[0] - centre[0]
  if (bands === 3) {
    if (dy < -8) return t('North')
    if (dy > 8) return t('South')
    return t('Central')
  }
  if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return t('Central')
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? t('North') : t('South')
  return dx < 0 ? t('West') : t('East')
}

/** Deterministic k-means over ward centroids, used to form the zone tier. */
function clusterIntoZones(centroids: Polygon, k: number, seed: string): number[] {
  if (k <= 1) return centroids.map(() => 0)
  const r = det(`city-zones:${seed}`)
  const centre = polygonCentroidOf(convexHull(centroids).length >= 3 ? convexHull(centroids) : centroids)

  // Seed the cluster centres evenly around the city so the partition is stable.
  let centres: Polygon = Array.from({ length: k }, (_, i) => {
    const theta = (i / k) * Math.PI * 2 + r.float(0, 0.4)
    return [centre[0] + Math.cos(theta) * 16, centre[1] + Math.sin(theta) * 18] as Point
  })

  let assignment: number[] = centroids.map(() => 0)
  for (let iteration = 0; iteration < 12; iteration += 1) {
    assignment = centroids.map((p) => {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centres.length; c += 1) {
        const cc = centres[c] as Point
        const dist = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      }
      return best
    })
    centres = centres.map((cc, c) => {
      const members = centroids.filter((_, i) => assignment[i] === c)
      if (members.length === 0) return cc
      return [
        members.reduce((s, p) => s + p[0], 0) / members.length,
        members.reduce((s, p) => s + p[1], 0) / members.length,
      ] as Point
    })
  }

  // An empty cluster would produce a zone holding no wards - a zone office with
  // no jurisdiction, which is not a thing. Rebalance by moving the ward furthest
  // from its own cluster's centre into the empty one, taken from whichever
  // cluster can afford to lose it.
  for (let c = 0; c < k; c += 1) {
    if (assignment.includes(c)) continue
    const counts = Array.from({ length: k }, (_, i) => assignment.filter((a) => a === i).length)
    let donorIndex = -1
    let worstFit = -1
    for (let i = 0; i < centroids.length; i += 1) {
      const owner = assignment[i] as number
      if ((counts[owner] ?? 0) <= 1) continue
      const cc = centres[owner] as Point
      const p = centroids[i] as Point
      const dist = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2
      if (dist > worstFit) {
        worstFit = dist
        donorIndex = i
      }
    }
    if (donorIndex >= 0) {
      assignment[donorIndex] = c
      centres[c] = centroids[donorIndex] as Point
    }
  }

  return assignment
}

/** ---------------------------------------------------------------------
 * Backdrop features - the real named water and green belt
 * ------------------------------------------------------------------- */

function buildBackdrop(
  spec: CityFormSpec,
  outline: Polygon,
  coastX: number | null,
  creekX: number | null,
): GeneratedBackdrop[] {
  const r = det(`city-backdrop:${spec.seed}`)
  const features: GeneratedBackdrop[] = []
  const centre = polygonCentroidOf(outline)
  const water = spec.waterBodies
  const nameAt = (i: number, fallback: string): string => water[i] ?? fallback

  if (coastX !== null) {
    // A wavy shoreline west of the built-up area.
    const edge: Polygon = []
    for (let y = 0; y <= 100; y += 10) {
      edge.push([coastX - 1.5 + r.float(-1.6, 1.6), y])
    }
    features.push({
      id: 'sea',
      label: nameAt(0, 'Arabian Sea'),
      kind: 'water',
      polygon: tidy([[0, 0], ...edge, [0, 100]]),
    })
  }

  if (creekX !== null) {
    const edge: Polygon = []
    for (let y = 0; y <= 100; y += 10) {
      edge.push([creekX + 1.5 + r.float(-1.4, 1.4), y])
    }
    features.push({
      id: 'creek',
      label: nameAt(0, 'Creek'),
      kind: 'creek',
      polygon: tidy([[100, 0], ...edge.slice().reverse(), [100, 100]]),
    })
  }

  if (spec.formType === 'riverine') {
    // A band crossing the whole city, entering and leaving the outline.
    const tilt = r.float(-0.55, 0.55)
    const width = r.float(2.6, 4.2)
    const yAt = (x: number): number => centre[1] + (x - centre[0]) * tilt + Math.sin(x / 13) * 3.4
    const top: Polygon = []
    const bottom: Polygon = []
    for (let x = -4; x <= 104; x += 8) {
      top.push([x, yAt(x) - width])
      bottom.push([x, yAt(x) + width])
    }
    features.push({
      id: 'river',
      label: nameAt(0, 'River'),
      kind: 'river',
      polygon: tidy([...top, ...bottom.reverse()]),
    })

    // A tributary joining it, where the corporation names a second river.
    if (water.length > 1) {
      const jx = centre[0] + r.float(-8, 8)
      const trib: Polygon = []
      const tribBack: Polygon = []
      for (let entry = 0; entry <= 1.0001; entry += 0.2) {
        const x = jx - entry * r.float(16, 26)
        const y = yAt(jx) - entry * r.float(24, 38)
        trib.push([x - 2, y])
        tribBack.push([x + 2, y])
      }
      features.push({
        id: 'river-tributary',
        label: nameAt(1, 'Tributary'),
        kind: 'river',
        polygon: tidy([...trib, ...tribBack.reverse()]),
      })
    }
  }

  if (spec.formType === 'lakeside' || (water.some((w) => /lake|talao|sagar|reservoir/i.test(w)) && spec.formType !== 'coastal')) {
    const lakeName = water.find((w) => /lake|talao|sagar|reservoir/i.test(w)) ?? nameAt(0, 'Lake')
    const lx = centre[0] + r.float(-17, 17)
    const ly = centre[1] + r.float(-17, 17)
    const lrx = r.float(5, 8.5)
    const lry = r.float(4, 7)
    const blob: Polygon = []
    for (let i = 0; i < 12; i += 1) {
      const theta = (i / 12) * Math.PI * 2
      const wob = r.float(0.82, 1.18)
      blob.push([lx + Math.cos(theta) * lrx * wob, ly + Math.sin(theta) * lry * wob])
    }
    features.push({ id: 'lake', label: lakeName, kind: 'lake', polygon: tidy(blob) })
  }

  if (spec.greenBelt) {
    // Green belts sit on a city edge, not through the middle of it.
    const theta = r.float(0, Math.PI * 2)
    const gx = centre[0] + Math.cos(theta) * r.float(26, 34)
    const gy = centre[1] + Math.sin(theta) * r.float(26, 36)
    const blob: Polygon = []
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2
      const wob = r.float(0.75, 1.25)
      blob.push([gx + Math.cos(a) * 11 * wob, gy + Math.sin(a) * 9 * wob])
    }
    features.push({ id: 'green-belt', label: spec.greenBelt, kind: 'forest', polygon: tidy(blob) })
  }

  return features
}

/** ---------------------------------------------------------------------
 * Ward codes
 * ------------------------------------------------------------------- */

const STOP_WORDS = new Set([
  'and', 'the', 'of', 'zone', 'ward', 'office', 'no', 'nagar',
  // Terms that appear in a published division's title rather than in its
  // identity. "Ward Committee 'A'" is ward A; leaving "Committee" in made the
  // initial of every Parbhani ward a C, so all three collapsed to C, C2, C3 and
  // the corporation's own A/B/C designation was lost entirely.
  'committee', 'samiti', 'karyalay', 'karyalaya', 'kshetriya', 'vibhagiya',
  'prabhag', 'divisional', 'zonal', 'kramank', 'kr', 'city',
])

/**
 * The designation the corporation itself gives a division, where its published
 * name carries one: the letter in `Ward 'A' - Kharghar` or `Ward Office 7 'H'`,
 * the number in `Zone Office No. 4`. That designation IS the corporation's own
 * shorthand, so it beats anything we could derive from the place name - and it
 * cannot collide, because the corporation does not issue the same letter twice.
 *
 * Deliberately anchored to a quote or an explicit ordinal marker rather than to
 * any bare capital, so `Aundh - Baner` is not read as ward A.
 */
function publishedDesignation(name: string): string | null {
  const quoted = /['"“”‘’]\s*([A-Za-z]{1,2})\s*['"“”‘’]/.exec(name)
  if (quoted) return (quoted[1] as string).toUpperCase()

  const parenthesised = /\(\s*([A-Za-z])\s*\)/.exec(name)
  if (parenthesised) return (parenthesised[1] as string).toUpperCase()

  const numbered = /\b(?:no\.?|kramank|kr\.?|samiti|office|zone|prabhag)\s*[-–]?\s*(\d{1,2})\b/i.exec(name)
  if (numbered) return numbered[1] as string

  const leadingNumber = /^\s*(\d{1,2})\b/.exec(name)
  if (leadingNumber) return leadingNumber[1] as string

  return null
}

/**
 * A short institutional shorthand for a division name - "Aundh-Baner" becomes
 * AB, "Ghole Road" becomes GR, "Panchavati" becomes PAN. Where the corporation
 * publishes its own designation for the division, that is used instead.
 * Collisions are resolved by appending the division's ordinal, never silently.
 */
function wardCodeFor(name: string, index: number, taken: Set<string>): string {
  const designation = publishedDesignation(name)

  const tokens = name
    // Quotes, brackets, ampersands and the punctuation around an ordinal are
    // typography, not identity. Without stripping them, Panvel's four lettered
    // ward offices came out as 'K, 'K2, 'K3 and 'P - a leading apostrophe on
    // every one, the published letter dropped, and three of the four sharing an
    // initial - and "Uttan, Rai & Murdha" produced the code UR&.
    .replace(/['"“”‘’().,&]/g, ' ')
    .split(/[\s\-–/·]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !STOP_WORDS.has(entry.toLowerCase()))
    // A bare ordinal carries no shorthand of its own; the designation above
    // already captured it where the corporation publishes one. Anything that
    // does not open with a letter is punctuation that survived the strip.
    .filter((entry) => /^[A-Za-z]/.test(entry))

  let code: string
  if (tokens.length >= 2) {
    code = tokens
      .slice(0, 3)
      .map((entry) => entry[0]?.toUpperCase() ?? '')
      .join('')
  } else if (tokens.length === 1) {
    code = (tokens[0] as string).slice(0, 3).toUpperCase()
  } else {
    code = ''
  }

  // A place name is the more useful label where the division has one; the
  // published designation carries the division on its own where it does not.
  if (code.length === 0) code = designation ?? `W${index + 1}`

  let candidate = code
  let suffix = 2
  while (taken.has(candidate)) {
    // Disambiguate with the corporation's own designation before falling back
    // to an ordinal we made up - `KHA` and `KHA-B` read as two real wards,
    // `KHA` and `KHA2` read as a numbering accident.
    candidate = suffix === 2 && designation ? `${code}-${designation}` : `${code}${suffix}`
    suffix += 1
  }
  taken.add(candidate)
  return candidate
}

/** ---------------------------------------------------------------------
 * The generator
 * ------------------------------------------------------------------- */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export function generateCityGeography(spec: CityFormSpec): GeneratedGeography {
  const wardCount = Math.max(3, spec.divisions.length)
  const { outline, coastX, creekX } = buildOutline(spec)
  const seeds = placeSeeds(outline, wardCount, spec.seed)
  const cells = seeds.map((_, i) => voronoiCell(outline, seeds, i))
  const centre = polygonCentroidOf(outline)

  // Order the cells the way an operator reads a map - north to south, then
  // west to east - and assign the corporation's published division names in
  // their own published order.
  const order = cells
    .map((cell, i) => ({ i, c: cell.length >= 3 ? polygonCentroidOf(cell) : (seeds[i] as Point) }))
    .sort((a, b) => (Math.abs(a.c[1] - b.c[1]) > 6 ? a.c[1] - b.c[1] : a.c[0] - b.c[0]))
    .map((e) => e.i)

  const backdrop = buildBackdrop(spec, outline, coastX, creekX)
  const waterFeatures = backdrop.filter((f) => f.kind !== 'forest')

  const totalArea = cells.reduce((s, c) => s + (c.length >= 3 ? polygonArea(c) : 0), 0) || 1

  // Zone tier: the corporation's published zones where it has them, otherwise
  // a modelled geographic grouping sized to the ward count.
  const publishedZones = spec.zoneNames && spec.zoneNames.length > 0 ? spec.zoneNames : null
  // A zone must hold at least a couple of wards to mean anything, so the tier is
  // capped at half the ward count however many zones are published. This mirrors
  // `resolveZoneCount` in `corporations.ts` exactly - the two must agree, or the
  // interface quotes a zone count the map does not draw.
  const desiredZones = publishedZones ? publishedZones.length : Math.max(2, Math.min(6, Math.round(wardCount / 4)))
  const zoneCount = Math.max(2, Math.min(desiredZones, Math.max(2, Math.floor(wardCount / 2))))
  const cellCentroids: Polygon = order.map((i) => {
    const cell = cells[i] as Polygon
    return cell.length >= 3 ? polygonCentroidOf(cell) : (seeds[i] as Point)
  })
  const clusters = clusterIntoZones(cellCentroids, zoneCount, spec.seed)

  // Zones are numbered north to south by their own centroid so Zone I is
  // always the northernmost - a map that numbers its zones at random is a map
  // no operator will trust.
  const zoneCentroidY = Array.from({ length: zoneCount }, (_, c) => {
    const members = cellCentroids.filter((_, i) => clusters[i] === c)
    if (members.length === 0) return Infinity
    return members.reduce((s, p) => s + p[1], 0) / members.length
  })
  const zoneRank = zoneCentroidY
    .map((y, c) => ({ y, c }))
    .sort((a, b) => a.y - b.y)
    .reduce<Record<number, number>>((acc, entry, rank) => {
      acc[entry.c] = rank
      return acc
    }, {})

  const zones: GeneratedZone[] = Array.from({ length: zoneCount }, (_, rank) => {
    const cluster = Number(Object.keys(zoneRank).find((k) => zoneRank[Number(k)] === rank) ?? rank)
    const members = cellCentroids.filter((_, i) => clusters[i] === cluster)
    const mid: Point =
      members.length > 0
        ? [
            members.reduce((s, p) => s + p[0], 0) / members.length,
            members.reduce((s, p) => s + p[1], 0) / members.length,
          ]
        : centre
    const compass = regionOf(mid, centre, 5)
    return {
      code: `Z${rank + 1}`,
      name: publishedZones
        ? (publishedZones[rank] as string)
        : t('Zone {0} - {1} {2}', ROMAN[rank] ?? rank + 1, compass, compass === 'Central' ? 'Core' : 'Division'),
      region: compass,
    }
  })

  const density = det(`ward-density:${spec.seed}`)
  const weights = order.map((_, k) => density.float(0.62, 1.55) * (1 + Math.cos(k) * 0.05))
  const weightedTotal = order.reduce((s, i, k) => {
    const cell = cells[i] as Polygon
    const area = cell.length >= 3 ? polygonArea(cell) : 0
    return s + area * (weights[k] as number)
  }, 0) || 1

  const taken = new Set<string>()
  const wards: GeneratedWard[] = order.map((cellIndex, k) => {
    const division = spec.divisions[k] ?? { name: t('Prabhag {0}', k + 1) }
    const cell = cells[cellIndex] as Polygon
    const poly = cell.length >= 3 ? tidy(cell) : tidy([outline[0] as Point, outline[1] as Point, outline[2] as Point])
    const mapCentroid = polygonCentroidOf(poly)
    const cellArea = polygonArea(poly)

    // Real-world centroid: the corporation's published coordinate, offset by
    // the ward's position in map space scaled to the corporation's real size.
    const cityRadiusKm = Math.sqrt(Math.max(spec.areaSqKm, 1) / Math.PI)
    const kmPerUnit = cityRadiusKm / 33
    const dLat = ((centre[1] - mapCentroid[1]) * kmPerUnit) / 111
    const cosLat = Math.max(0.2, Math.cos((spec.latLng.lat * Math.PI) / 180))
    const dLng = ((mapCentroid[0] - centre[0]) * kmPerUnit) / (111 * cosLat)

    // Flood exposure follows the water actually drawn on this city's map: a
    // ward within reach of the river, creek or shoreline carries the risk.
    const nearWater = waterFeatures.some((f) => {
      const fc = polygonCentroidOf(f.polygon)
      if (f.kind === 'water' || f.kind === 'creek') {
        return Math.abs(mapCentroid[0] - fc[0]) < 22
      }
      return Math.hypot(mapCentroid[0] - fc[0], mapCentroid[1] - fc[1]) < 22
    })
    const floodRng = det(`ward-flood:${spec.seed}:${division.name}`)
    const floodProne = nearWater ? floodRng.chance(0.72) : floodRng.chance(0.18)

    const share = (cellArea * (weights[k] as number)) / weightedTotal
    const areaShare = cellArea / totalArea

    return {
      code: wardCodeFor(division.name, k, taken),
      name: division.name,
      region: regionOf(mapCentroid, centre, 3),
      zoneCode: `Z${(zoneRank[clusters[k] as number] ?? 0) + 1}`,
      centroid: {
        lat: Math.round((spec.latLng.lat + dLat) * 10000) / 10000,
        lng: Math.round((spec.latLng.lng + dLng) * 10000) / 10000,
      },
      polygon: poly,
      areaSqKm: Math.max(0.4, Math.round(spec.areaSqKm * areaShare * 10) / 10),
      population: Math.max(1200, Math.round((spec.population * share) / 100) * 100),
      floodProne,
    }
  })

  return { wards, zones, backdrop, outline }
}
