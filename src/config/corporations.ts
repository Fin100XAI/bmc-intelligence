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
  /** Currently operational treatment capacity - distinct from capacity under construction (see `notableFacts`). */
  sewageTreatmentMLD: number | null
  solidWasteTPD: number | null
  roadLengthKm: number | null
  /** Public Health Department facility counts - see `sources` for the two disagreeing published breakdowns. */
  healthPostsCount: number | null
  dispensariesCount: number | null
  maternityHomesCount: number | null
  majorHospitalsCount: number | null
  municipalSchoolsCount: number | null
  municipalSchoolsEnrolment: number | null
  fireStationsCount: number | null
  /** All BMC-held open-space plots - gardens, playgrounds and recreation grounds combined. */
  gardenPlotsCount: number | null
  /** The subset of `gardenPlotsCount` that are gardens specifically. */
  gardensCount: number | null
  municipalMarketsCount: number | null
  publicToiletBlocksCount: number | null
  /** Most recent official tree census - BMC runs these periodically, not annually. */
  treeCensusCount: number | null
  treeCensusYear: number | null
  /** Grade I/IIA/IIB/III heritage-listed structures, compiled from BMC's ward-by-ward lists. */
  heritageStructuresCount: number | null
  heritagePrecinctsCount: number | null
  animalBirthControlCentresCount: number | null
  /** Share of city population in slum areas, Census of India 2011. */
  slumPopulationPct: number | null
  /**
   * Annual complaints logged via the Central/Centralised Complaint
   * Registration System - a published SUBSET (water, waste, sewage,
   * pollution, toilets only), not the platform's own total.
   */
  annualCivicComplaintsReported: number | null
  /** LED-converted streetlights in the western/eastern suburbs specifically - not a citywide total; none was found. */
  streetlightsLedConvertedSuburbs: number | null
  /** Establishment - sanctioned strength, filled and vacant, as published in recruitment-crisis reporting. */
  sanctionedPostsCount: number | null
  filledPostsCount: number | null
  vacantPostsCount: number | null
  /** Approximate, rounded figure from property-tax-hike reporting - no exact register total was published. */
  assessedPropertiesApprox: number | null
  /** Actual property tax revenue COLLECTED in the most recent closed financial year - distinct from `budgetCrore`, which is the total outlay including capital and borrowings. */
  propertyTaxRevenueCollectedCrore: number | null
  propertyTaxRevenueFinancialYear: string | null
  /** Budgeted total revenue INCOME estimate - distinct from `budgetCrore`. */
  revenueIncomeCroreEstimate: number | null
  /** Year the Development Plan 2034 was sanctioned by the State Government. */
  dp2034SanctionYear: number | null
  /** BMC Disaster Management Cell's Automatic Weather Station network - the confirmed operating baseline. */
  awsStationsCount: number | null
  /** Continuous Ambient Air Quality Monitoring Stations within Mumbai, across all operating agencies (MPCB/IITM-SAFAR/BMC). */
  caaqmsStationsCount: number | null
  pm25AnnualAverageUgm3: number | null
  pm25AsOfYear: number | null
  /** Vital statistics - each individually dated, since births and deaths data lag by different amounts. */
  annualDeathsRegistered: number | null
  annualDeathsAsOfYear: number | null
  annualBirthsRegistered: number | null
  annualBirthsAsOfYear: number | null
  /** General body's Standing Committee - BMC's budget/tender approval body. */
  standingCommitteeMembersCount: number | null
  /** Statutory ward committees grouping electoral wards for civic oversight - distinct from the 24 administrative wards. */
  wardCommitteesCount: number | null
  /** Mumbai Coastal Road Project (south leg, Phase 1) - the most reported figure; the northward extension is a separate, distinct project not included here. */
  coastalRoadCostCrore: number | null
  coastalRoadLengthKm: number | null
  coastalRoadPhase1OpenedYear: number | null
  /** BRIMSTOWAD - Brihanmumbai Storm Water Disposal System, the post-2005-flood drainage upgrade programme. */
  brimstowadCostCrore: number | null
  brimstowadPumpingStationsBuilt: number | null
  brimstowadPumpingStationsPlanned: number | null
  /** BMC's annual pre-monsoon "most dangerous" building list - fluctuates year to year, not a stable baseline. */
  dangerousC1BuildingsCount: number | null
  dangerousC1BuildingsYear: number | null
  /** Goregaon-Mulund Link Road - cost is a disputed range across sources; the higher, more common figure is carried with the range noted in `sources`. */
  gmlrCostCrore: number | null
  gmlrTunnelLengthKm: number | null
  /** Gargai Dam - new water-supply augmentation project, still in pre-construction clearance stages. */
  gargaiDamCostCrore: number | null
  gargaiDamYieldMLD: number | null
  /** Mumbai's registered vehicle population - published in BMC's own Environment Status Report, not a modelled figure. */
  vehiclePopulationCount: number | null
  vehiclePopulationAsOfYear: number | null
  /** Mumbai Traffic Police's official annual road-safety report (with Bloomberg Philanthropies BIGRS). */
  roadAccidentFatalities: number | null
  roadAccidentFatalitiesYear: number | null
  /** Best-available city-level encroachment-removal reference - a named campaign's totals, not an official annual aggregate (none is published). */
  pedestriansFirstFootpathsClearedKm: number | null
  /** Hindu cremation grounds (Shamshan-bhoomi) citywide - a headcount, not a capacity figure. */
  shamshanBhoomiCount: number | null
  /** Mumbai's coastline length. */
  coastlineLengthKm: number | null
  /** Mumbai's mangrove cover - see `sources` for a disagreeing academic estimate. */
  mangroveCoverSqKm: number | null
  /** Share of Mumbai Citizens' Forum / TISS survey respondents unaware their ward has a statutory Ward Committee. */
  civicWardCommitteeUnawarePct: number | null
  /** Share of the same survey's respondents wanting greater involvement in local decision-making. */
  civicWantsGreaterInvolvementPct: number | null
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
    sewageTreatmentMLD: 1226,
    solidWasteTPD: 6300,
    roadLengthKm: 2050,
    healthPostsCount: 212,
    dispensariesCount: 192,
    maternityHomesCount: 30,
    majorHospitalsCount: 5,
    municipalSchoolsCount: 1135,
    municipalSchoolsEnrolment: 293000,
    fireStationsCount: 54,
    gardenPlotsCount: 1068,
    gardensCount: 254,
    municipalMarketsCount: 136,
    publicToiletBlocksCount: 7646,
    treeCensusCount: 2975283,
    treeCensusYear: 2018,
    heritageStructuresCount: 1271,
    heritagePrecinctsCount: 44,
    animalBirthControlCentresCount: 8,
    slumPopulationPct: 41.8,
    annualCivicComplaintsReported: 115000,
    streetlightsLedConvertedSuburbs: 84754,
    sanctionedPostsCount: 145256,
    filledPostsCount: 89130,
    vacantPostsCount: 56126,
    assessedPropertiesApprox: 900000,
    propertyTaxRevenueCollectedCrore: 6172,
    propertyTaxRevenueFinancialYear: '2024-25',
    revenueIncomeCroreEstimate: 51510.94,
    dp2034SanctionYear: 2018,
    awsStationsCount: 60,
    caaqmsStationsCount: 28,
    pm25AnnualAverageUgm3: 36.1,
    pm25AsOfYear: 2024,
    annualDeathsRegistered: 95780,
    annualDeathsAsOfYear: 2025,
    annualBirthsRegistered: 120188,
    annualBirthsAsOfYear: 2020,
    standingCommitteeMembersCount: 26,
    wardCommitteesCount: 17,
    coastalRoadCostCrore: 13060,
    coastalRoadLengthKm: 29.2,
    coastalRoadPhase1OpenedYear: 2024,
    brimstowadCostCrore: 4000,
    brimstowadPumpingStationsBuilt: 6,
    brimstowadPumpingStationsPlanned: 8,
    dangerousC1BuildingsCount: 174,
    dangerousC1BuildingsYear: 2026,
    gmlrCostCrore: 14000,
    gmlrTunnelLengthKm: 6.65,
    gargaiDamCostCrore: 5396,
    gargaiDamYieldMLD: 440,
    vehiclePopulationCount: 5054907,
    vehiclePopulationAsOfYear: 2025,
    roadAccidentFatalities: 374,
    roadAccidentFatalitiesYear: 2023,
    pedestriansFirstFootpathsClearedKm: 68,
    shamshanBhoomiCount: 52,
    coastlineLengthKm: 150,
    mangroveCoverSqKm: 40,
    civicWardCommitteeUnawarePct: 70,
    civicWantsGreaterInvolvementPct: 88.7,
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
      // Chronic waterlogging spots, named repeatedly across years of monsoon
      // reporting rather than a single one-off report - see `sources`.
      floodProneAreas: [
        'Hindmata',
        'Sion',
        "King's Circle",
        'Kurla',
        'Milan Subway',
        'Andheri Subway',
        'Wadala',
        'Dadar',
        'Bandra',
      ],
    },
    operationalNotes: [],
    notableFacts: [
      'India\'s richest municipal corporation by annual budget — the FY 2026-27 outlay of ₹80,952.56 crore was up 8.77% on FY 2025-26\'s ₹74,427.41 crore.',
      'Governed under the Mumbai Municipal Corporation Act, 1888, which remains the operative statute.',
      'Seven sewage treatment plants with a combined design capacity of 2,464 MLD are under construction under the Mumbai Sewage Disposal Project (MSDP-II) - additional to the 1,226 MLD currently operational, most of which provides preliminary rather than full secondary treatment.',
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
      {
        field: 'sewageTreatmentMLD',
        url: 'https://citizenmatters.in/explainer-sewage-in-mumbai-treatment-disposal-30022',
        note: t('~1,226 MLD combined dry-weather capacity across 8 existing STPs (2022); most (Worli, Bandra, Malad) provide preliminary treatment only, not full secondary treatment. A separate 2024 MPCB-cited figure gives ~2,727 MLD constructed capacity at 53% utilisation — reported here as the more conservative, better-explained figure.'),
      },
      {
        field: 'healthPostsCount',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-news-bmc-pushes-ahead-with-civic-health-collaboration-model-outsourcing-dialysis-mri-ct-scan-blood-bank-services',
        note: t('\'operates 212 health posts, 192 dispensaries, 30 maternity homes, and five specialised hospitals, including four medical colleges\' (Aug 2025). An older MCGM RTI manual gives a disagreeing breakdown of 183 health posts / 175 dispensaries / 29 maternity homes / 4 medical college + 1 dental college + 16 general + 6 specialty hospitals — reported here as the more recent figure.'),
      },
      {
        field: 'municipalSchoolsCount',
        url: 'https://bmceducation.in/',
        note: t('BMC Education Department\'s own site states 1,135 schools, ~2.93 lakh students and 9,421 teachers across 8 mediums of instruction as current figures, undated.'),
      },
      {
        field: 'fireStationsCount',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-bmc-to-build-five-new-fire-stations-including-two-on-coastal-road',
        note: t('\'35 major and 19 small fire stations operating across the city\' (Feb 2025, 54 total); other reporting gives 34 major + 17 small (51 total). 5 more approved but not yet built as of this report.'),
      },
      {
        field: 'gardenPlotsCount',
        url: 'https://www.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/Related%20Links/List%20Of%20RG%20PG%20Garden%20Plots.pdf',
        note: t('Official MCGM list of Recreation Ground / Playground / Garden plots as on 18 September 2023: 1,068 plots total — 254 gardens, 319 playgrounds, 432 recreation grounds.'),
      },
      {
        field: 'municipalMarketsCount',
        url: 'https://www.asianage.com/mumbai/bmc-develop-markets-city-its-own-792',
        note: t('\'of the 136 municipal markets, 92 are in dilapidated condition\' (2019); 92 vegetable markets with 17,164 licensed vendors reported separately in 2022. No more recent citywide recount found.'),
      },
      {
        field: 'publicToiletBlocksCount',
        url: 'https://theprint.in/india/only-1-in-every-4-public-toilet-seats-in-mumbai-available-to-women-69-lack-water-says-ngo-report/2106222/',
        note: t('Praja Foundation RTI-based report (data as of Dec 2023, published May 2024): 7,646 toilet blocks across Mumbai\'s 24 wards; separately, 6,800 public toilets across the wider Mumbai Metropolitan Area, only 2,973 functional. One seat per 752 males and one per 1,820 females; 69% of community blocks lack water, 60% lack electricity.'),
      },
      {
        field: 'treeCensusCount',
        url: 'https://www.dnaindia.com/mumbai/report-mumbai-s-green-cover-is-worth-33-lakh-trees-2610255',
        note: t('2018 tree census: 29,75,283 trees (~4.2 lakh in Aarey), up from ~19 lakh in the 2008 census. A rounder \'33.7 lakh\' figure also circulates from the same census cycle. BMC\'s next census (ground-penetrating radar based) was reported starting early 2026.'),
      },
      {
        field: 'heritageStructuresCount',
        url: 'https://www.artdecomumbai.com/research/mumbai-heritage-list/',
        note: t('Third-party compilation of BMC\'s own ward-by-ward heritage lists (updated 2012-2019): 1,271 graded properties + 44 precincts (Grade I: 51, IIA: 282, IIB: 289, III: 606). An older, frequently-cited \'591 structures as of 2012\' figure appears to be a stale pre-consolidation count. No single official MCGM document giving the aggregate total was found.'),
      },
      {
        field: 'animalBirthControlCentresCount',
        url: 'https://theprint.in/india/over-90000-stray-dogs-in-mumbai-but-only-8-shelters-for-them-say-bmc-officials/2779991/',
        note: t('8 ABC centres against an estimated 90,000+ stray dogs, per BMC officials (Nov 2025). Separately, 4,03,374 dogs sterilised 1994–Dec 2023 (1,48,084 of those 2014–2023); a 45,000/year target with ₹23 crore allocated was reported for the current drive.'),
      },
      {
        field: 'slumPopulationPct',
        url: 'https://www.pressreader.com/india/hindustan-times-patiala/20200529/281960314963875',
        note: t('~41.3–41.84% of Mumbai\'s population in slum areas per Census of India 2011 provisional data, widely repeated in secondary reporting; the primary Census \'Primary Census Abstract for Slums\' table itself could not be located directly.'),
      },
      {
        field: 'annualCivicComplaintsReported',
        url: 'https://theprint.in/india/governance/only-1-of-mumbais-24-wards-gets-round-the-clock-water-supply-praja-foundation-report/2632552/',
        note: t('~1.15 lakh complaints via BMC\'s Central Complaint Registration System in 2024, a 70% increase since 2015 — per Praja Foundation\'s RTI-based \'Status of Civic Issues in Mumbai\' report (May 2025). Covers only water, waste, sewage, pollution and toilets; not a total across every complaint category.'),
      },
      {
        field: 'streetlightsLedConvertedSuburbs',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-bmcs-4-year-old-project-of-changing-streetlights-to-led-is-now-97-complete',
        note: t('84,754 streetlights converted to LED across the western and eastern suburbs, ~97% of that conversion project complete (30 Jan 2023). This is the suburban LED-conversion count only — no citywide total streetlight figure (including the island city) was found.'),
      },
      {
        field: 'sanctionedPostsCount',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-bmc-faces-massive-staff-shortage-state-to-address-crisis-with-new-civic-recruitments',
        note: t('\'BMC currently has a sanctioned strength of 1,45,256 posts across various departments. Of these, only 89,130 positions are filled, leaving 56,126 posts vacant\' (2 March 2026); recruitment for 9,295 posts under way.'),
      },
      {
        field: 'assessedPropertiesApprox',
        url: 'https://www.freepressjournal.in/mumbai',
        note: t('\'the recent property tax hike affects nearly 9 lakh properties in Mumbai\', of which ~3.6 lakh homes under 500 sq ft are tax-exempt (March 2025 property-tax-hike reporting). A rounded figure tied to that story, not a cited exact register total.'),
      },
      {
        field: 'propertyTaxRevenueCollectedCrore',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-news-bmc-achieves-995-of-property-tax-target-collects-record-6172-cr-for-fy-2024-25',
        note: t('₹6,172 crore collected, 99.5% of the ₹6,200 crore target, by 31 March 2025 — a record high, up ~30% from ₹4,856.38 crore in FY2023-24. A second outlet cites ₹6,198 crore for the same year (minor variant).'),
      },
      {
        field: 'revenueIncomeCroreEstimate',
        url: 'https://www.freepressjournal.in/business/bmc-tables-80952-crore-budget-for-2026-27-mega-infra-push-with-48164-crore-capex-coastal-road',
        note: t('Total revenue income budget estimate for FY2026-27: ₹51,510.94 crore, up 19.35% over FY2025-26\'s ₹43,159.40 crore; property tax target within that set at ₹7,000 crore. Distinct from `budgetCrore`, the total outlay including capital spend and borrowings.'),
      },
      {
        field: 'dp2034SanctionYear',
        url: 'https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Chief%20Engineer%20(Development%20Plan)/Docs/SANCTIONED%20DP2034/DCPR/DCPR%202034.pdf',
        note: t('Development Plan 2034 sanctioned by State Government Notification No. TPB-4317/629/CR-118/2017/DP/UD-11 on 8 May 2018, fully implemented from 13 November 2019. Its open-space-per-capita target is reported inconsistently across secondary sources (2.2–4 sq m/person) and a total reservations count could not be found published anywhere as a single figure, so neither is carried as a structured field here.'),
      },
      {
        field: 'form.floodProneAreas',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-monsoon-2025-bmc-chief-bhushan-gagrani-inspects-flood-prone-areas-after-hindmata-sion-wadala-hit-by-waterlogging',
        note: t('Hindmata, Sion, King\'s Circle, Kurla, Milan Subway, Andheri Subway, Wadala, Dadar and Bandra are named repeatedly across years of monsoon reporting as Mumbai\'s chronic waterlogging spots; Hindmata sits in a natural depression and floods almost every monsoon, Sion/King\'s Circle flooding is tied to Mithi River overflow.'),
      },
      {
        field: 'awsStationsCount',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-ahead-of-monsoons-bmc-to-set-up-60-automatic-weather-stations',
        note: t('60 Automatic Weather Stations operating, with a further 60 approved/added from 29 March 2023 (toward a planned 120). Current-day reporting still commonly describes the network loosely as \'more than 60\', so only the confirmed 60 baseline is carried here rather than the unconfirmed 120 target.'),
      },
      {
        field: 'caaqmsStationsCount',
        url: 'https://www.freepressjournal.in/mumbai/bmc-to-set-up-5-new-caaqms-stations-across-mumbai-for-real-time-air-quality-monitoring',
        note: t('28 Continuous Ambient Air Quality Monitoring Stations across Mumbai (MPCB 14 + IITM/SAFAR 9 + BMC 5), with 5 more BMC stations being added toward an eventual 33 (28 June 2026).'),
      },
      {
        field: 'pm25AnnualAverageUgm3',
        url: 'https://www.deccanherald.com',
        note: t('36.1 µg/m³ annual PM2.5 average for 2024 (\'Moderate\' category per IQAir\'s World Air Quality Report), up 2.6% on 2019; for comparison Delhi 107, Bengaluru 33.0, Chennai 29.5, national average 50.6 µg/m³. WHO guideline is 5 µg/m³.'),
      },
      {
        field: 'annualDeathsRegistered',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-records-sharp-decline-in-infant-neonatal-and-maternal-deaths-over-three-years',
        note: t('95,780 deaths registered in 2025 (provisional), up from 94,553 in 2022; the same report shows neonatal deaths falling 1,846→1,148, infant deaths 2,962→2,069, maternal deaths 92→74 over 2022–2025 (10 July 2026).'),
      },
      {
        field: 'annualBirthsRegistered',
        url: 'https://www.pressreader.com/india/hindustan-times-st-mumbai/20210616/281633898187517',
        note: t('120,188 births registered in 2020 — the lowest since 2015, a 23% drop on 2019\'s 148,898 — down a clear multi-year trend from 174,902 in 2015. No figure more recent than 2020 was found despite searching; reported here as a known-stale figure rather than extrapolated forward.'),
      },
      {
        field: 'standingCommitteeMembersCount',
        url: 'https://www.freepressjournal.in/mumbai/who-is-prabhakar-shinde-bjp-leader-elected-unopposed-as-bmc-standing-committee-chair-creates-civic-history',
        note: t('26 corporators sit on BMC\'s Standing Committee, elected annually by the general body — commonly described as the civic body\'s financial nerve centre, vetting budgets, tenders, contracts and major infrastructure spend. The Mumbai Municipal Corporation Act, 1888 ss.42-43 describe a 27-member committee including one ex-officio seat; this could not be independently verified against the primary Act text.'),
      },
      {
        field: 'wardCommitteesCount',
        url: 'https://citizenmatters.in/understanding-mumbais-municipal-corporation-30461',
        note: t('17 statutory Ward Committees group Mumbai\'s electoral wards for civic-service oversight (water supply, drainage, cleanliness, storm-water drains) — distinct from the 24 administrative ward offices (A–T). Mumbai has not constituted the Area Sabhas the same law also envisages.'),
      },
      {
        field: 'coastalRoadCostCrore',
        url: 'https://en.wikipedia.org/wiki/Coastal_Road_(Mumbai)',
        note: t('₹13,060 crore for the completed 10.58 km Phase 1 (Marine Drive–Worli) south leg — escalated from an original ₹12,721 crore estimate, "the most expensive project in BMC\'s history." The full 29.2 km project (Phase 1 + 2) is more honestly a ₹13,000–14,000 crore range across sources. The separate Versova–Dahisar–Bhayander "Coastal Road North" extension (~₹16,600–22,000 crore, still in early clearance) is a distinct project not included in this figure.'),
      },
      {
        field: 'coastalRoadPhase1OpenedYear',
        url: 'https://en.wikipedia.org/wiki/Coastal_Road_(Mumbai)',
        note: t('Phase 1 southbound (Marine Lines–Worli) opened 11 March 2024; the northbound bridge to the Bandra–Worli Sea Link was inaugurated 26 January 2025. Phase 2 (Worli/Bandra–Versova/Kandivali, 19.22 km) is under construction; BMC\'s stated full-completion target is May 2026 (a target, not a confirmed deadline — this project has slipped before).'),
      },
      {
        field: 'brimstowadCostCrore',
        url: 'https://www.asianage.com/metros/mumbai/310817/brimstowad-pumping-projects-fail-raising-questions-over-cost.html',
        note: t('Escalated to ~₹4,000 crore against an original 2005-era estimate of ₹1,200 crore — a 3x+ overrun over roughly 11 years. This is the last-published aggregate figure found (2017); no more recent total cost was located.'),
      },
      {
        field: 'brimstowadPumpingStationsBuilt',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-bmc-moves-forward-with-mogra-and-mahul-pumping-stations-after-19-years-of-delay-to-address-flooding',
        note: t('6 of 8 Chitale-Committee-recommended pumping stations completed and operational (Irla, Haji Ali, Love Grove, Cleveland Bunder, Britannia, Gazdar Bandh); the remaining two, Mogra and Mahul, are still not completed as of 2025, delayed by land/CRZ clearance — Mogra\'s site was found to overlap with the Coastal Road North alignment, requiring re-siting.'),
      },
      {
        field: 'dangerousC1BuildingsCount',
        url: 'https://www.freepressjournal.in/mumbai/mumbai-monsoon-preparedness-bmc-chief-ashwini-bhide-flags-174-dangerous-buildings-in-city-announces-10-per-cent-water-cut-from-may-15',
        note: t('174 C1-category ("most dangerous") buildings flagged in BMC\'s 2026 pre-monsoon list (23 MCGM-owned + 141 private + 10 government/MHADA-owned), released ~29 April 2026; 72 had been vacated by report date. This count fluctuates year to year rather than trending in one direction — 2024\'s list was 188, 2025\'s was 134 — so it should not be treated as a stable baseline.'),
      },
      {
        field: 'gmlrCostCrore',
        url: 'https://swarajyamag.com/infrastructure/rs-14000-crore-goregaonmulund-link-road-first-phase-from-dindoshi-to-sgnp-likely-to-open-by-may-2026',
        note: t('Most commonly cited total project cost is ₹14,000 crore, with the underground twin-tunnel component separately bid at ₹6,300–6,600 crore; one source gives a lower all-in total of ₹12,013 crore. Reported here as a ₹12,000–14,000 crore range given genuine disagreement across sources. Phase 1 flyover targeted to open May 2026; BMC\'s stated full-corridor completion target is 2028.'),
      },
      {
        field: 'gmlrTunnelLengthKm',
        url: 'https://swarajyamag.com/infrastructure/mumbai-bmc-to-begin-underground-twin-tunnel-excavation-for-goregaon-mulund-link-road-project-by-early-2026',
        note: t('6.65 km twin-tunnel system beneath Sanjay Gandhi National Park, depth 20–160 m; tunnel-boring machine imported from Japan, boring targeted to start early 2026.'),
      },
      {
        field: 'gargaiDamCostCrore',
        url: 'https://swarajyamag.com/news-brief/mumbais-water-crisis-bmc-proposes-rs-5396-crore-gargai-dam-to-add-440-million-litres-per-day-supply',
        note: t('₹5,396 crore sanctioned/proposed project estimate; a separate ₹3,000 crore construction tender was issued December 2025 — these are not directly comparable (full project cost vs. one construction tender) so both figures exist without being merged. Dam: 69 m height, 979.4 m length, on the Gargai River near Ogde village, Wada taluka, Palghar district, linked to Modak Sagar via a 1.6 km tunnel. BMC\'s stated completion target is 2029, a project with over a decade of prior delay pending clearances.'),
      },
      {
        field: 'gargaiDamYieldMLD',
        url: 'https://www.orfonline.org/expert-speak/rethinking-mumbai-s-gargai-dam-and-urban-water-futures',
        note: t('440 MLD additional yield once complete — one of three planned new sources (with Pinjal Dam and the Damanganga–Pinjal link) collectively targeted to add 2,891 MLD. Pinjal Dam has no independently citable standalone cost/status figure and is not carried as a separate field.'),
      },
      {
        field: 'vehiclePopulationCount',
        url: 'https://www.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Environment/Docs/Environment%20Status%20Report%20%202024-25%20(English).pdf',
        note: t('BMC\'s own Environment Status Report 2024-25: 50,54,907 registered vehicles as of March 2025, up from 47,59,976 (2024) and 45,37,211 (2023); ~2.94 lakh new registrations in the year (+6.2%). Two-wheelers 59.34%, cars/jeeps/station wagons 28.72%; by fuel, petrol 78.79%, diesel 11.15%, CNG 4.36 lakh, electric just 48,854.'),
      },
      {
        field: 'roadAccidentFatalities',
        url: 'https://www.deccanherald.com/india/maharashtra/hit-and-run-cases-38-of-all-fatal-crashes-on-mumbai-roads-in-2023-report-3418047',
        note: t('374 deaths in 351 crashes (2023), per Mumbai Traffic Police\'s official annual road-safety report with the Bloomberg Philanthropies Initiative for Global Road Safety (BIGRS) — a ~39-40% reduction versus 2015; 2022 was 365 deaths in 351 crashes. Two/three-wheeler occupants (48-49%) and pedestrians (~40%) are the largest victim categories; hit-and-run caused 38% of fatal crashes. A separately-reported 2024 figure of 1,108 deaths is attributed to a private company, not Mumbai Traffic Police, and could not be corroborated — not used here.'),
      },
      {
        field: 'pedestriansFirstFootpathsClearedKm',
        url: 'https://www.freepressjournal.in/mumbai/bmc-clears-68-km-of-footpaths-under-pedestrians-first-drive-443-encroachment-actions-taken',
        note: t('68 km of footpaths cleared and 443 total enforcement actions under BMC\'s "Pedestrians First" campaign (2025-26, ongoing) — the best-available city-level encroachment-removal reference found; BMC does not appear to publish a single official annual aggregate for structures removed or area reclaimed citywide, only ward-level and campaign-level figures like this one.'),
      },
      {
        field: 'shamshanBhoomiCount',
        url: 'https://www.prokerala.com/news/articles/a1542003.html',
        note: t('52 Hindu Shamshan-bhoomi (cremation grounds) citywide (June 2024 reporting); BMC separately runs 10 electric and 18 gas crematoria as a technology category within that estate, and piloted an eco-friendly enclosed-furnace system at 10 locations from 2020, each handling ~10-12 funerals a day. No official single citywide inventory document was found; this is the best-available count from contemporary reporting.'),
      },
      {
        field: 'coastlineLengthKm',
        url: 'https://journals.library.columbia.edu/index.php/consilience/article/view/12431',
        note: t('150 km of shoreline, per a 2025 academic study evaluating a decade of Mumbai mangrove restorations (Columbia University Consilience journal) — no official BMC or state figure was found for total coastline length.'),
      },
      {
        field: 'mangroveCoverSqKm',
        url: 'https://citizenmatters.in/mangrove-alliance-cop27-mumbai-environment-climate-change/',
        note: t('40 sq km of mangrove cover in Mumbai city, per the India State of Forest Report (Forest Survey of India), which also recorded 1.08 sq km lost — the highest loss of any area measured. A separate 2025 academic study (Columbia University Consilience journal) gives a materially higher estimate of 65 sq km with no stated measurement date; reported here as a genuine disagreement between a government forest survey and an academic estimate, not reconciled.'),
      },
      {
        field: 'civicWardCommitteeUnawarePct',
        url: 'https://www.mumbaicf.in/post/mumbai-speaks',
        note: t('"Mumbai Speaks" survey by Mumbai Citizens\' Forum with TISS (fieldwork Jan-Aug 2023, published 24 Dec 2025): 5,450 respondents across all 227 wards, 70% unaware their ward has a Prabhag Samiti / Ward Committee, 72% do not know BMC\'s budget, 75% unaware of the Local Area Development Fund, 35% do not know how to contact their corporator.'),
      },
      {
        field: 'civicWantsGreaterInvolvementPct',
        url: 'https://www.mumbaicf.in/post/mumbai-speaks',
        note: t('Same "Mumbai Speaks" survey: 88.7% of respondents want greater involvement in local decision-making; 47.6% had attempted resolving a local issue themselves, of whom only 57.4% reported success; 72.5% intended to vote in the upcoming BMC election. Area Sabha, Ward Committees, social media and citizen forums were the preferred participation channels.'),
      },
    ],
    confidence: 'high',
  },
  {
    id: 'pmc',
    name: 'Pune Municipal Corporation',
    shortName: 'PMC',
    marathiName: 'पुणे महानगरपालिका',
    city: 'Pune',
    district: 'Pune',
    division: 'Pune',
    establishedYear: 1950,
    grade: 'A',
    areaSqKm: 516.18,
    population2011: 3124458,
    electoralWards: 165,
    administrativeWards: 15,
    wardTerminology: 'Ward Office',
    zoneTerminology: 'Zone',
    zones: null,
    budgetCrore: 13995,
    budgetFinancialYear: '2026-27',
    website: 'https://www.pmc.gov.in/en',
    headquarters: 'Pune Municipal Corporation Main Building, Congress House Road, Shivajinagar, Pune 411005',
    latLng: {
      lat: 18.5236,
      lng: 73.8478,
    },
    waterSupplyMLD: 1450,
    sewageTreatmentMLD: 477,
    solidWasteTPD: null,
    roadLengthKm: null,
    healthPostsCount: null,
    dispensariesCount: null,
    maternityHomesCount: null,
    majorHospitalsCount: null,
    municipalSchoolsCount: null,
    municipalSchoolsEnrolment: null,
    fireStationsCount: null,
    gardenPlotsCount: null,
    gardensCount: null,
    municipalMarketsCount: null,
    publicToiletBlocksCount: null,
    treeCensusCount: null,
    treeCensusYear: null,
    heritageStructuresCount: null,
    heritagePrecinctsCount: null,
    animalBirthControlCentresCount: null,
    slumPopulationPct: null,
    annualCivicComplaintsReported: null,
    streetlightsLedConvertedSuburbs: null,
    sanctionedPostsCount: null,
    filledPostsCount: null,
    vacantPostsCount: null,
    assessedPropertiesApprox: 1250000,
    propertyTaxRevenueCollectedCrore: 2365.31,
    propertyTaxRevenueFinancialYear: '2024-25',
    revenueIncomeCroreEstimate: 15669,
    dp2034SanctionYear: null,
    awsStationsCount: null,
    caaqmsStationsCount: null,
    pm25AnnualAverageUgm3: null,
    pm25AsOfYear: null,
    annualDeathsRegistered: null,
    annualDeathsAsOfYear: null,
    annualBirthsRegistered: null,
    annualBirthsAsOfYear: null,
    standingCommitteeMembersCount: null,
    wardCommitteesCount: null,
    coastalRoadCostCrore: null,
    coastalRoadLengthKm: null,
    coastalRoadPhase1OpenedYear: null,
    brimstowadCostCrore: null,
    brimstowadPumpingStationsBuilt: null,
    brimstowadPumpingStationsPlanned: null,
    dangerousC1BuildingsCount: null,
    dangerousC1BuildingsYear: null,
    gmlrCostCrore: null,
    gmlrTunnelLengthKm: null,
    gargaiDamCostCrore: null,
    gargaiDamYieldMLD: null,
    vehiclePopulationCount: null,
    vehiclePopulationAsOfYear: null,
    roadAccidentFatalities: null,
    roadAccidentFatalitiesYear: null,
    pedestriansFirstFootpathsClearedKm: null,
    shamshanBhoomiCount: null,
    coastlineLengthKm: null,
    mangroveCoverSqKm: null,
    civicWardCommitteeUnawarePct: null,
    civicWantsGreaterInvolvementPct: null,
    divisions: [],
    divisionsVerified: false,
    divisionSourceUrl: null,
    zoneNames: null,
    localities: [
      'Shivajinagar',
      'Kothrud',
      'Hadapsar',
      'Aundh',
      'Kharadi',
      'Camp',
      'Deccan Gymkhana',
      'Baner',
      'Viman Nagar',
      'Katraj',
      'Yerwada',
      'Warje',
      'Sahakarnagar',
      'Bibwewadi',
    ],
    waterSources: ['Khadakwasla', 'Panshet', 'Varasgaon', 'Temghar'],
    form: {
      // Landlocked, at the confluence of the Mula and Mutha rivers - the
      // opposite city form to Mumbai's coastline, and the second, genuinely
      // different geography this platform's schematic ward-tessellation
      // generator has now actually been exercised against, not merely
      // asserted to handle. See `docs/architecture` on the ward-boundary
      // generator's untested-against-a-second-form gap this record closes.
      type: 'riverine',
      waterBodies: ['Mula River', 'Mutha River', 'Mula-Mutha River'],
      greenBelt: null,
      shape: null,
      floodProneAreas: ['Bopodi', 'Vishrantwadi', 'Mundhwa-Keshavnagar', 'Keshav Nagar-Kharadi Link Road'],
    },
    operationalNotes: [],
    notableFacts: [
      'The corporation\'s jurisdictional area nearly doubled twice in under a decade through village mergers: 250.56 km² → 331.56 km² after 11 villages merged in 2017 → 516.18 km² after a further 23 villages merged on 30 June 2021 - an unusually rapid expansion among Maharashtra\'s corporations.',
      'The January 2026 general election returned 165 corporators across 41 wards (40 four-member wards plus one five-member ward); BJP won 118 seats, and Manjusha Nagpure (BJP) was elected mayor.',
      'PMC moved to alternate-day water supply from June 2026 after storage in the Khadakwasla dam chain (Khadakwasla, Panshet, Varasgaon, Temghar) fell to roughly 5.87 TMC, about 3 TMC of it usable - a live operational constraint, not a historical one.',
      'Governed under the Bombay Provincial Municipal Corporations Act, 1949; constituted as a Municipal Corporation on 15 February 1950.',
    ],
    sources: [
      {
        field: 'establishedYear',
        url: 'https://en.wikipedia.org/wiki/Pune_Municipal_Corporation',
        note: t('Constituted 15 February 1950 under the Bombay Provincial Municipal Corporations Act, 1949.'),
      },
      {
        field: 'grade',
        url: 'https://mpcb.gov.in/sites/default/files/solid-waste/Municipal_Corporation03032020.pdf',
        note: t("MPCB official 'List of Municipal Corporation' classifies Pune Municipal Corporation as MC-CLASS A - the same official list BMC's own grade is sourced from."),
      },
      {
        field: 'areaSqKm',
        url: 'https://www.constructionworld.in/amp/Latest-Construction-News/pune-is-now-a-city-with-the-largest-geographical-area-in-india-/28024',
        note: t('516.18 km² as of 30 June 2021, after 23 villages were merged into PMC limits - up from 331.56 km² after an 11-village merger in 2017, and 250.56 km² before that. Corroborated by a separate report (leaveandlicense.com) giving the same 2021 figure and merger history.'),
      },
      {
        field: 'population2011',
        url: 'https://www.census2011.co.in/data/town/802814-pune-maharashtra.html',
        note: t('Census of India 2011: 3,124,458 within PMC limits at that time (1,603,675 male / 1,520,783 female). This predates both the 2017 and 2021 village mergers, so it materially understates the population of the corporation\'s current, larger jurisdiction - no citable official post-merger total was found, and none is estimated here in its place.'),
      },
      {
        field: 'electoralWards',
        url: 'https://en.wikipedia.org/wiki/2026_Pune_Municipal_Corporation_election',
        note: t('165 corporators elected January 2026 across 41 wards (40 four-member wards, one five-member ward) - up from 162 seats/41 wards at the 2017 election. BJP won 118 seats; Manjusha Nagpure (BJP) elected mayor.'),
      },
      {
        field: 'administrativeWards',
        url: 'https://mybharat.gov.in/Gov/Urban-Local-Body/pune-municipal-corporation/ward-zones',
        note: t("15 ward offices (e.g. Ghole Road, Hadapsar, Kasba Vishrambagwada, Kondhwa-Wanawadi, Kothrud, Nagar Road, Sahakarnagar, Tilak Road, Warje-Karvenagar, Yerwada), per a public-service aggregator rather than a page found directly on pmc.gov.in - carried at medium confidence, distinct from PCMC's 'Kshetriya Karyalaya' terminology which is a different, neighbouring corporation."),
      },
      {
        field: 'budgetCrore',
        url: 'https://www.mypunepulse.com/pune-%E2%82%B913995-crore-pmc-budget-presented-for-2026-27-water-supply-receives-highest-allocation-worth-%E2%82%B92077-crores/',
        note: t('₹13,995 crore budget presented by Commissioner Naval Kishore Ram for FY2026-27 (Water Supply ₹2,077 cr, Roads ₹1,866 cr, Solid Waste ₹1,390 cr highest allocations) - corroborated by punekarnews.in and thebridgechronicle.com. A separately reported ₹15,669 crore figure (freepressjournal.in) is a revenue-collection TARGET a joint committee was formed to meet, not the presented budget outlay - the two are not the same thing and are carried as separate fields here (see `revenueIncomeCroreEstimate`).'),
      },
      {
        field: 'waterSupplyMLD',
        url: 'https://www.freepressjournal.in/pune/residents-fear-hardship-as-pune-plans-alternate-day-water-supply-tankers-will-get-costlier',
        note: t("Typically 1,400-1,500 MLD delivered from the Khadakwasla dam chain (Khadakwasla, Panshet, Varasgaon, Temghar) against roughly 1,500 MLD estimated demand; most areas receive 4-6 hours of rotational supply a day. As of June 2026 PMC moved to alternate-day supply after chain storage fell to about 5.87 TMC (roughly 3 TMC usable) - reported as the midpoint of the cited range, not a single official figure."),
      },
      {
        field: 'sewageTreatmentMLD',
        url: 'https://numerical.co.in/numerons/collection/63213ae40df06bb81c4ca66c',
        note: t('Approximately 477 MLD treatment capacity against roughly 980 MLD generated, per secondary reporting (not a primary PMC source). A separate report on the Mundhwa STP alone cites a 550 MLD design capacity for that one plant, which does not obviously reconcile with the citywide 477 MLD figure - carried here as a genuine, unresolved discrepancy between non-primary sources, at lower confidence than the BMC sewage figure.'),
      },
      {
        field: 'propertyTaxRevenueCollectedCrore',
        url: 'https://www.freepressjournal.in/pune/pune-pmc-collects-236531-crore-in-property-tax-for-fy-2024-25-falls-short-of-284723-crore-target',
        note: t('₹2,365.31 crore collected in FY2024-25, short of a ₹2,847.23 crore target, up from ₹2,273 crore in FY2023-24 - from roughly 12.5 lakh assessed properties in the tax net. A partial-year FY2025-26 figure (₹1,556 crore as of 23 Aug 2025) exists but is not a full-year total and is not used here.'),
      },
      {
        field: 'waterSources',
        url: 'https://en.wikipedia.org/wiki/Khadakwasla_Dam',
        note: t('Bulk supply drawn from the Khadakwasla dam chain - Khadakwasla, Panshet, Varasgaon and Temghar dams - on the Mula-Mutha river system.'),
      },
      {
        field: 'form',
        url: 'https://en.wikipedia.org/wiki/Mula-Mutha_River',
        note: t('Pune sits at the confluence of the Mula and Mutha rivers, which join to continue as the Mula-Mutha, flowing east to join the Bhima - landlocked, with no coastline.'),
      },
    ],
    // Core geography, the 2026 election result and municipal finance are
    // well-sourced; several operational counts (roads, health facilities,
    // schools, standing committee size) returned no citable PMC-official
    // figure in this pass and are left null rather than estimated, and two
    // fields (solid waste tonnage, sewage treatment capacity) rest on
    // non-primary sources that do not fully agree with each other - together
    // that keeps this record at 'medium' rather than BMC's 'high'.
    confidence: 'medium',
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
