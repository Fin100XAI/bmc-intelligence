import { ROUTES } from '@/config/navigation'
import { capabilityAreaHref } from '@/config/bmc/capability-map'
import { WEBSITE_CHECKED_ON, feedRecords, siteRecords, type PublicFeedRecord, type SiteFeed } from '@/config/bmc/systems-data'
import { t } from '@/i18n'

export type { SiteFeed } from '@/config/bmc/systems-data'

/**
 * src/config/bmc/roadmap.ts
 *
 * What the Capability Roadmap shows for Mumbai beyond the capability areas:
 * the data levels from public evidence to live integration, what public
 * evidence already proves, the public feeds the live areas run on, the
 * corporation's own portal section by section, and what has been added.
 * Feeds are read by hand on the dates given in the evidence registry;
 * automated pulling waits for the owning department's permission.
 */

export interface DataLevel {
  n: number
  name: string
  runsOn: string
  state: 'live' | 'pilot' | 'designed'
}

export function bmcDataLevels(): DataLevel[] {
  return [
    { n: 0, name: t('Public / open intelligence'), runsOn: t('BMC budget books, the disaster management feed, the roads and pothole dashboards, IMD, SAFAR and CPCB, CityFinance, public reporting and OpenStreetMap'), state: 'live' },
    { n: 1, name: t('Approved file intelligence'), runsOn: t('Excel, CSV or PDF extracts approved by the corporation'), state: 'pilot' },
    { n: 2, name: t('Single-department intelligence'), runsOn: t('One department\'s extract - e.g. the SWD works register or MARG complaints'), state: 'designed' },
    { n: 3, name: t('Controlled read-only integration'), runsOn: t('Read-only access to SAP S/4HANA, MARG, the property tax system and the disaster management feed'), state: 'designed' },
    { n: 4, name: t('Cross-department intelligence'), runsOn: t('Departmental data joined on property, asset, ward and location'), state: 'designed' },
    { n: 5, name: t('Near-real-time intelligence'), runsOn: t('Weather stations, pumping stations and field events as they happen'), state: 'designed' },
  ]
}

export interface ProvenItem {
  label: string
  to: string
}

/** What runs today on public evidence, before any corporation data is shared. */
export function bmcProvesNow(): ProvenItem[] {
  return [
    { label: t('Budget, reserves and committed liabilities, from the budget books'), to: capabilityAreaHref(2) },
    { label: t('Revenue streams beyond property tax'), to: capabilityAreaHref(3) },
    { label: t('Public works portfolio on a real map of Mumbai'), to: ROUTES.publicMoney },
    { label: t('Works that share ground and time (build, dig, rebuild)'), to: ROUTES.publicMoney },
    { label: t('Project milestones and the freshness of their public status'), to: ROUTES.publicMoney },
    { label: t('Lake storage across the season, and the water cut'), to: capabilityAreaHref(4) },
    { label: t('Treatment capacity being built against sewage generated'), to: capabilityAreaHref(5) },
    { label: t('Flooding spots, pumping stations and the two still pending'), to: capabilityAreaHref(6) },
    { label: t('Rain-gauge network and monsoon rainfall'), to: capabilityAreaHref(7) },
    { label: t('Waste handled daily, and the dependence on Kanjurmarg'), to: capabilityAreaHref(8) },
    { label: t('Pothole complaints and road concretisation'), to: capabilityAreaHref(9) },
    { label: t('Source contradictions and evidence gaps'), to: ROUTES.evidenceRegistry },
  ]
}

export interface PublicFeed extends PublicFeedRecord {}

export function bmcPublicFeeds(): PublicFeed[] {
  return feedRecords()
}

export interface SiteSection {
  section: string
  publishes: string
  feed: SiteFeed
  covered: Array<{ label: string; to: string }>
  /** What the platform adds above it, or still needs. */
  intelligence: string
}

/** Where the platform already covers each portal section, matched on the section's leading words. */
function coveredFor(section: string): Array<{ label: string; to: string }> {
  const rules: Array<[string, Array<{ label: string; to: string }>]> = [
    ['About BMC', [{ label: t('Data & Resources'), to: ROUTES.dataResources }, { label: t('Ward Intelligence'), to: ROUTES.wards }]],
    ['Important projects', [{ label: t('Public Money & Investment'), to: ROUTES.publicMoney }]],
    ['Maps', [{ label: t('Public Money & Investment'), to: ROUTES.publicMoney }, { label: t('City Command Map'), to: ROUTES.cityCommandMap }]],
    ['Proactive disclosure', [{ label: t('Evidence Registry'), to: ROUTES.evidenceRegistry }, { label: t('Budget Intelligence'), to: ROUTES.budget }]],
    ['For citizens', [{ label: t('Environment Intelligence'), to: ROUTES.environment }]],
    ['Apply', [{ label: t('Grievance Resolution'), to: ROUTES.resolutionIntelligence }]],
    ['Login', [{ label: t('Revenue Intelligence'), to: ROUTES.revenue }]],
    ['For partners', [{ label: t('Procurement Intelligence'), to: ROUTES.procurement }]],
    ['Disaster Management', [{ label: t('Monsoon Intelligence'), to: ROUTES.monsoon }, { label: t('Area 6'), to: capabilityAreaHref(6) }]],
  ]
  return rules.find(([prefix]) => section.startsWith(prefix))?.[1] ?? []
}

/** portal.mcgm.gov.in, section by section. */
export function bmcWebsiteMap(): SiteSection[] {
  return siteRecords().map((r) => ({ ...r, covered: coveredFor(r.section) }))
}

export function websiteCheckedOn(): string {
  return WEBSITE_CHECKED_ON
}

export interface RoadmapUpdate {
  date: string
  title: string
  detail: string
  to: string
}

/** What has been added, newest first. */
export function bmcRoadmapUpdates(): RoadmapUpdate[] {
  return [
    { date: '2026-10-11', title: t('Evidence registry on verified public sources'), detail: t('Every source the platform reads for Mumbai, with the exact text each figure was read from and when. Budget figures are read from the corporation\'s own budget books.'), to: ROUTES.evidenceRegistry },
    { date: '2026-10-11', title: t('Public works on a real map'), detail: t('Twenty-five publicly identified works - the Coastal Road, GMLR, the seven treatment plants, Gargai, Manori and more - with their published cost, status and location.'), to: ROUTES.publicMoney },
    { date: '2026-10-11', title: t('Capability map'), detail: t('Eighteen capability areas, the existing BMC or state system behind each, the decision the platform adds, and where it stands.'), to: ROUTES.systemsMap },
    { date: '2026-10-11', title: t('The portal, mapped'), detail: t('portal.mcgm.gov.in section by section: what it publishes, whether its data can be read, and where the platform covers it.'), to: ROUTES.capabilityRoadmap },
    { date: '2026-10-11', title: t('Contradictions kept, not hidden'), detail: t('Where two sources disagree - ward count, flooding spots, property-tax collection, Deonar - both are kept and a case is raised to settle the authoritative value.'), to: ROUTES.evidenceRegistry },
  ]
}
