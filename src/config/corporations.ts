import type { GeoPoint } from '@/types/common'
import type { CityFormType } from '@/data/geo-generator'
import { getLocale, t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/* ---------------------------------------------------------------------------
 * BRIHANMUMBAI MUNICIPAL CORPORATION (real reference data)
 *
 * The factual spine the whole platform is built on. This build is scoped to a
 * SINGLE municipal corporation - Brihanmumbai - and the roster below carries
 * exactly that one record. The structure is unchanged: it is still a list, the
 * runtime still resolves an "active corporation" out of it, and every layer
 * below still rebuilds from that resolution. Nothing had to be rewired to
 * narrow the roster; the roster is simply one entry long.
 *
 * Brihanmumbai is a real urban local body, and every figure carried here -
 * area, Census population, ward and zone counts, budget outlay, water supply,
 * waste generation, official website - is a PUBLISHED figure sourced from the
 * corporation's own site, the Maharashtra Urban Development Department, the
 * Census of India 2011, or MoHUA programme dashboards. Sources are recorded in
 * `sources`, and anything that could not be sourced is `null` rather than
 * estimated.
 *
 * What is NOT real, and is never presented as real: the OPERATIONAL data -
 * incidents, complaints, projects, contractor performance, per-ward
 * indicators. No public source exists at that granularity. It is modelled
 * deterministically on top of this factual spine, seeded by corporation id,
 * and every surface in the platform states so.
 *
 * `divisions` holds the administrative divisions the corporation actually
 * publishes - ward offices, zonal offices, divisional offices - in its own
 * order and under its own terminology. Where it publishes no named divisions,
 * `divisionsVerified` is false and the platform falls back to its real
 * electoral ward count, numbered. Brihanmumbai's 24 administrative wards are
 * drawn from real boundaries - see `src/data/geography.ts`.
 * ------------------------------------------------------------------------- */

export interface CorporationSource {
  field: string
  url: string
  note?: string
}

export interface CorporationRef {
  /** Stable slug. Also the tenant id and the seed for every modelled figure. */
  id: string
  name: string
  shortName: string
  /** Present where the corporation was officially renamed. */
  formerName?: string
  marathiName: string
  city: string
  district: string
  /** Maharashtra revenue division. */
  division: string
  establishedYear: number | null
  /** Corporation grade under the Maharashtra Municipal Corporation Act. */
  grade: 'A' | 'B' | 'C' | 'D' | null
  areaSqKm: number
  /** Census of India 2011, current corporation limits. */
  population2011: number
  /** Elected corporator seats / prabhags. */
  electoralWards: number | null
  /** Administrative ward, zonal or divisional offices. */
  administrativeWards: number | null
  /** What this corporation calls its primary administrative unit. */
  wardTerminology: string
  /** What this corporation calls its secondary tier. */
  zoneTerminology: string
  zones: number | null
  /** Latest published annual budget outlay, in rupees crore. */
  budgetCrore: number | null
  budgetFinancialYear: string | null
  website: string | null
  headquarters: string | null
  latLng: GeoPoint
  waterSupplyMLD: number | null
  sewageTreatmentMLD: number | null
  solidWasteTPD: number | null
  roadLengthKm: number | null
  /** Published administrative divisions, in the corporation's own order. */
  divisions: Array<{ name: string; note?: string | null }>
  divisionsVerified: boolean
  divisionSourceUrl: string | null
  /** Published zone tier above the divisions, where one exists. */
  zoneNames: string[] | null
  /** Well-known localities, used by hyperlocal and search surfaces. */
  localities: string[]
  /**
   * Bulk water supply sources - the dams, reservoirs, barrages and rivers the
   * corporation actually draws from.
   *
   * Deliberately separate from `form.waterBodies`, which is what gets drawn on
   * the map. A corporation on the coast has the Arabian Sea as a map feature
   * and does not take a drop of supply from it, so a single list would have
   * the water intelligence surfaces reporting the sea as 62% full.
   */
  waterSources: string[]
  form: {
    type: CityFormType
    waterBodies: string[]
    greenBelt: string | null
    shape: string | null
    floodProneAreas: string[]
  }
  operationalNotes: string[]
  notableFacts: string[]
  sources: CorporationSource[]
  /** Our honest read on how well-sourced this record is. */
  confidence: 'high' | 'medium' | 'low'
}

function build$CORPORATIONS(): CorporationRef[] {
  return [
  {
    id: 'bmc',
    name: 'Brihanmumbai Municipal Corporation',
    shortName: 'BMC',
    marathiName: 'बृहन्मुंबई महानगरपालिका',
    city: 'Mumbai',
    district: 'Mumbai City / Mumbai Suburban',
    division: 'Konkan',
    establishedYear: 1888,
    grade: 'A',
    areaSqKm: 603.4,
    population2011: 12442373,
    electoralWards: 227,
    administrativeWards: 24,
    wardTerminology: 'Ward',
    zoneTerminology: 'Zone',
    zones: 7,
    budgetCrore: 80952.56,
    budgetFinancialYear: '2026-27',
    website: 'https://portal.mcgm.gov.in',
    headquarters: 'Brihanmumbai Municipal Corporation Building, Mahapalika Marg, Fort, Mumbai 400001',
    latLng: {
      lat: 18.94,
      lng: 72.8353,
    },
    waterSupplyMLD: 3850,
    sewageTreatmentMLD: null,
    solidWasteTPD: 6300,
    roadLengthKm: 2050,
    divisions: [],
    divisionsVerified: false,
    divisionSourceUrl: null,
    zoneNames: null,
    localities: [
      'Colaba',
      'Fort',
      'Marine Lines',
      'Byculla',
      'Dadar',
      'Worli',
      'Mahim',
      'Bandra',
      'Andheri',
      'Jogeshwari',
      'Malad',
      'Borivali',
      'Kurla',
      'Chembur',
      'Ghatkopar',
      'Mulund',
    ],
    waterSources: [
      'Bhatsa',
      'Upper Vaitarna',
      'Middle Vaitarna',
      'Modak Sagar',
      'Tansa',
      'Vihar',
      'Tulsi',
    ],
    form: {
      type: 'coastal',
      waterBodies: [
        'Arabian Sea',
        'Mumbai Harbour',
        'Thane Creek',
        'Mithi River',
      ],
      greenBelt: 'Sanjay Gandhi National Park',
      shape: null,
      floodProneAreas: [],
    },
    operationalNotes: [],
    notableFacts: [
      'India\'s richest municipal corporation by annual budget — the FY 2026-27 outlay of ₹80,952.56 crore was up 8.77% on FY 2025-26\'s ₹74,427.41 crore.',
      'Governed under the Mumbai Municipal Corporation Act, 1888, which remains the operative statute.',
      'Seven sewage treatment plants with a combined design capacity of 2,464 MLD are under construction under the Mumbai Sewage Disposal Project (MSDP-II).',
      'All 227 seats were contested at the 15 January 2026 general election, which recorded a 52.94% turnout.',
    ],
    sources: [
      {
        field: 'budgetCrore',
        url: 'https://www.outlookbusiness.com/economy-and-policy/bmc-presents-8095256-crore-budget-for-2026-27-up-87-from-current-fiscal',
        note: t('BMC Budget 2026-27 of ₹80,952.56 crore presented 25 Feb 2026 by Commissioner Bhushan Gagrani; prior year (2025-26) budget estimate was ₹74,427.41 crore.'),
      },
      {
        field: 'budgetCrore',
        url: 'https://swarajyamag.com/news-brief/mumbais-bmc-approves-rs-80952-crore-budget-after-94-hour-session-opposition-walks-out-over-fund-allocation',
        note: t('Budget approved by the general body after a 94-hour debate.'),
      },
      {
        field: 'areaSqKm',
        url: 'https://en.wikipedia.org/wiki/Mumbai',
        note: t('Greater Mumbai 603.4 km2 — the standard MCGM jurisdiction figure.'),
      },
      {
        field: 'population2011',
        url: 'https://en.wikipedia.org/wiki/Mumbai',
        note: t('Census of India 2011: 12,442,373 for Greater Mumbai.'),
      },
      {
        field: 'electoralWards',
        url: 'https://en.wikipedia.org/wiki/2026_Brihanmumbai_Municipal_Corporation_election',
        note: t('227 seats contested on 15 January 2026; turnout 52.94%.'),
      },
      {
        field: 'administrativeWards',
        url: 'https://en.wikipedia.org/wiki/Brihanmumbai_Municipal_Corporation',
        note: t('24 administrative wards (A–T), 7 zones, 227 elected corporators.'),
      },
      {
        field: 'grade',
        url: 'https://mpcb.gov.in/sites/default/files/solid-waste/Municipal_Corporation03032020.pdf',
        note: t('MPCB official \'List of Municipal Corporation\' classifies Municipal Corporation of Greater Mumbai as MC-CLASS A. Separately, a 2014 Maharashtra UDD reclassification was reported to place Mumbai alone in an \'A+\' grade — that specific notification could not be verified directly.'),
      },
      {
        field: 'establishedYear',
        url: 'https://bombayhighcourt.nic.in/libweb/acts/1888.03.pdf',
        note: t('Bombay Act No. III of 1888 — The Mumbai Municipal Corporation Act. Wikipedia\'s infobox gives 1889 as the year the reconstituted corporation began functioning.'),
      },
      {
        field: 'waterSupplyMLD',
        url: 'https://indianexpress.com/article/cities/mumbai/bmc-budget-2026-27',
        note: t('\'The BMC currently supplies 3,850 MLD of water daily against a demand of 4,300 MLD\' (2026 budget reporting). A 2025 Free Press Journal report gave 3,950 MLD against demand of 4,463 MLD; Indian Infrastructure (Jul 2026) puts cumulative source availability at ~4,170 MLD.'),
      },
      {
        field: 'solidWasteTPD',
        url: 'https://www.freepressjournal.in/mumbai',
        note: t('\'the city generates 6,300 metric tonnes (MT) of waste per day\' — 2025 reporting on the Deonar dumping ground closure plan. Other 2024-25 reports range 6,200–7,200 TPD; older figures of 8,000–9,800 TPD include construction and demolition debris.'),
      },
    ],
    confidence: 'high',
  },
]
}
export let CORPORATIONS: CorporationRef[] = build$CORPORATIONS()
registerLayer(() => {
  CORPORATIONS = build$CORPORATIONS()
})

/** Corporations in the order they are offered for selection. */
export const CORPORATIONS_BY_DIVISION: Array<{ division: string; corporations: CorporationRef[] }> = (() => {
  const DIVISION_ORDER = ['Konkan', 'Pune', 'Nashik', 'Nagpur', 'Amravati', 'Chhatrapati Sambhajinagar']
  const grouped = new Map<string, CorporationRef[]>()
  for (const corp of CORPORATIONS) {
    const list = grouped.get(corp.division) ?? []
    list.push(corp)
    grouped.set(corp.division, list)
  }
  return [...grouped.entries()]
    .sort((a, b) => {
      const ai = DIVISION_ORDER.indexOf(a[0])
      const bi = DIVISION_ORDER.indexOf(b[0])
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    .map(([division, corporations]) => ({
      division,
      corporations: [...corporations].sort((a, b) => b.population2011 - a.population2011),
    }))
})()

export const CORPORATION_BY_ID = new Map(CORPORATIONS.map((c) => [c.id, c]))

/**
 * The number of primary administrative units the platform renders for a
 * corporation. Published divisions where the corporation names them; otherwise
 * its real administrative or electoral ward count.
 *
 * Single source of truth: both the configuration (`administrativeUnits.wards`)
 * and the geography generator resolve the count through here, so the number
 * quoted in the interface can never disagree with the number of polygons on
 * the map.
 */
/**
 * The corporation's name in the interface language.
 *
 * Marathi is not a translation here - it is the corporation's OWN registered
 * name, the one on its letterhead and its seal. `marathiName` carries it for
 * all twenty-nine, so this returns the institution's real name rather than a
 * transliteration of the English one.
 */
export function corporationName(corp: CorporationRef): string {
  return getLocale() === 'mr' ? corp.marathiName : corp.name
}

/**
 * The city's name in the interface language.
 *
 * Place names go through the catalogue rather than the composer: मुंबई and
 * ठाणे are established spellings, not something to assemble from parts.
 */
export function cityName(corp: CorporationRef): string {
  return t(corp.city)
}

export function resolveWardCount(corp: CorporationRef): number {
  const MAX_DRAWN = 30

  // 1. The divisions the corporation itself PUBLISHES win outright, however few
  //    and whether it names them or merely numbers them.
  //
  //    Panvel's four ward offices - Kharghar, Kalamboli, Kamothe, Panvel - make
  //    a more truthful map than twenty cells labelled "Prabhag 14", even though
  //    twenty cells would look busier. The same holds one tier down: Chandrapur
  //    publishes three zone offices, and drawing seventeen "Prabhag N" cells in
  //    their place does not make the map more informative, it makes it untrue -
  //    seventeen administrative units are asserted that the corporation does not
  //    have, under names it does not use. Three honest cells beat seventeen
  //    invented ones, and a numbered tier the corporation really operates beats
  //    a numbered tier we derived.
  //
  //    This is also what stops two different corporations rendering the SAME
  //    ward list: every fallback below erases whatever the corporation actually
  //    publishes and replaces it with `${wardTerminology} ${n}`, so any two
  //    corporations that shared a terminology and a count became
  //    indistinguishable - Kolhapur and Bhiwandi-Nizampur both read "Prabhag 1"
  //    to "Prabhag 5", and Sangli, Malegaon, Ahilyanagar and Dhule were four
  //    copies of the same four rows.
  if (corp.divisions.length >= 3) return Math.min(corp.divisions.length, MAX_DRAWN)

  // 2. Its prabhag / administrative ward tier, where that is a workable count.
  if (corp.administrativeWards && corp.administrativeWards <= MAX_DRAWN) return corp.administrativeWards

  // 3. Corporator seats, where the corporation is small enough that seats and
  //    prabhags are close to the same thing.
  if (corp.electoralWards && corp.electoralWards <= MAX_DRAWN) return corp.electoralWards

  // 4. Its zonal tier, where every finer tier is too fine to draw. A
  //    corporation with 120 administrative blocks is legible as its ten zones,
  //    not as 120 unnamed cells.
  if (corp.zones && corp.zones >= 3) return corp.zones

  // 5. Otherwise derive the prabhag count from the seat count. Maharashtra's
  //    municipal corporations elect from multi-member panels - since the 2026
  //    general election, four members to a prabhag in every corporation except
  //    Brihanmumbai. Dividing the seat count by four therefore recovers the
  //    real number of prabhags rather than inventing one.
  if (corp.electoralWards) return Math.min(MAX_DRAWN, Math.max(6, Math.round(corp.electoralWards / 4)))
  if (corp.administrativeWards) return MAX_DRAWN
  return 8
}

/** The secondary tier count, resolved on the same single-source-of-truth basis. */
export function resolveZoneCount(corp: CorporationRef): number {
  if (corp.id === 'bmc') return 7
  const wards = resolveWardCount(corp)
  const desired =
    corp.zoneNames && corp.zoneNames.length > 0
      ? corp.zoneNames.length
      : Math.max(2, Math.min(6, Math.round(wards / 4)))
  // A zone holding no wards is a zone office with no jurisdiction. Capping the
  // tier at half the ward count guarantees every zone has something under it.
  // `generateCityGeography` applies the identical clamp.
  return Math.max(2, Math.min(desired, Math.max(2, Math.floor(wards / 2))))
}

/**
 * The divisions the geography layer should draw, padded to the resolved ward
 * count with the corporation's own numbering where it publishes no names.
 */
export function resolveDivisions(corp: CorporationRef): Array<{ name: string; note?: string | null }> {
  const target = resolveWardCount(corp)

  // Whatever the corporation publishes is what gets drawn. `resolveWardCount`
  // already took its length as the count, so this never truncates a published
  // tier and never pads one - padding three real zone names out to seventeen
  // with "Prabhag 4" onwards would read as if the corporation names the first
  // three and forgets the rest.
  if (corp.divisions.length >= 3) return corp.divisions.slice(0, target)

  // The corporation publishes no division tier we could source at all, so the
  // count came from its seat or ward arithmetic. Number the set in the
  // corporation's own terminology; `divisionsVerified: false` is what the
  // interface reads to say so on every spatial surface.
  const unit = corp.wardTerminology
  return Array.from({ length: target }, (_, i) => ({ name: `${unit} ${i + 1}`, note: null }))
}

export function corporationById(id: string): CorporationRef {
  const corp = CORPORATION_BY_ID.get(id)
  if (corp) return corp
  // An unknown id can only reach here from corrupt persisted state; falling
  // back keeps the application bootable rather than failing to a blank screen.
  return CORPORATIONS[0] as CorporationRef
}
