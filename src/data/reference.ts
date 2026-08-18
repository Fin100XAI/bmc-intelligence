import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type { Department, Officer, Ward, Zone } from '@/types/organisation'
import type { OperationalState, Trend } from '@/types/common'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARD_GEOMETRY, ZONE_SPECS } from './geography'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Reference master data - wards, zones, departments and officers.
 *
 * Ward names, ward counts and zone names come from the active corporation's
 * own published administrative divisions (`src/config/corporations.ts`).
 * Departmental staff counts and budgets are Brihanmumbai-scale constants
 * scaled to the active corporation (`./scale.ts`). Officer names, health
 * scores and trends are modelled demonstration data seeded by corporation id.
 * No municipal system is contacted.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/** ---------------------------------------------------------------------
 * Departments
 * ------------------------------------------------------------------- */

interface DepartmentSpec {
  id: string
  name: string
  shortName: string
  domain: Department['domain']
  staffCount: number
  budgetCrore: number
  description: string
  /** Which corporation dimension this department's size tracks. */
  scaleBy: 'population' | 'area' | 'budget'
}

/**
 * The water-body department every corporation has, under the name that
 * corporation would actually use. A landlocked corporation does not run a
 * "Coastal Zone & Reclamation Cell", but it does run a river or lake
 * conservation cell - and the identifier stays `dept-coastal` so every
 * downstream reference to it keeps resolving.
 */
function waterBodyDepartment(): Pick<DepartmentSpec, 'name' | 'shortName' | 'description'> {
  const form = activeCorporation.form
  const named = form.waterBodies[0] ?? t('municipal water bodies')
  switch (form.type) {
    case 'coastal':
    case 'creek-side':
      return {
        name: t('Coastal Zone & Reclamation Cell'),
        shortName: t('Coastal'),
        description: t('Coastal protection, mangrove conservation, seawalls and shoreline management.'),
      }
    case 'riverine':
      return {
        name: t('River Rejuvenation & Embankment Cell'),
        shortName: t('River Cell'),
        description: t('Riverfront protection, embankment integrity, effluent interception and {0} rejuvenation.', named),
      }
    case 'lakeside':
      return {
        name: t('Lake Conservation & Water Bodies Cell'),
        shortName: t('Lakes'),
        description: t('Lake conservation, catchment protection, desilting and {0} water quality.', named),
      }
    default:
      return {
        name: t('Water Bodies & Watershed Cell'),
        shortName: t('Watershed'),
        description: t('Watershed protection, tank and reservoir conservation, and catchment water quality.'),
      }
  }
}

function departmentSpecs(): DepartmentSpec[] {
  const water = waterBodyDepartment()
  return [
    { id: 'dept-hydraulic', name: t('Hydraulic Engineering Department'), shortName: t('Hydraulic'), domain: 'water', staffCount: 6420, budgetCrore: 4310, description: t('Bulk water supply, distribution networks, service reservoirs and water quality assurance.'), scaleBy: 'population' },
    { id: 'dept-sewerage', name: t('Sewerage Operations Department'), shortName: t('Sewerage'), domain: 'sewerage', staffCount: 3180, budgetCrore: 2680, description: t('Sewerage collection, pumping, treatment facilities and effluent compliance.'), scaleBy: 'population' },
    { id: 'dept-stormwater', name: t('Storm Water Drains Department'), shortName: t('SWD'), domain: 'stormwater', staffCount: 2240, budgetCrore: 2150, description: t('Nallahs, closed drains, culverts, pumping stations and pre-monsoon desilting.'), scaleBy: 'area' },
    { id: 'dept-solid-waste', name: t('Solid Waste Management Department'), shortName: t('SWM'), domain: 'waste', staffCount: 28400, budgetCrore: 4620, description: t('Collection, transportation, transfer stations, processing and disposal facilities.'), scaleBy: 'population' },
    { id: 'dept-roads', name: t('Roads & Traffic Department'), shortName: t('Roads'), domain: 'roads', staffCount: 3960, budgetCrore: 5240, description: t('Road construction, resurfacing, defect rectification, bridges and flyovers.'), scaleBy: 'area' },
    { id: 'dept-health', name: t('Public Health Department'), shortName: t('Public Health'), domain: 'health', staffCount: 12780, budgetCrore: 3890, description: t('Disease surveillance, vector control, sanitation inspection and health programmes.'), scaleBy: 'population' },
    { id: 'dept-hospitals', name: t('Medical Education & Major Hospitals'), shortName: t('Hospitals'), domain: 'hospitals', staffCount: 21340, budgetCrore: 4180, description: t('Major, peripheral and speciality hospitals, dispensaries and medical colleges.'), scaleBy: 'population' },
    // The obligatory services below sit outside the corporation's engineering
    // and finance establishment but are no less its duty: each is assigned to
    // municipalities by the Twelfth Schedule and by the Maharashtra Municipal
    // Corporation Act, 1949. Education carries the largest establishment of
    // any of them - a corporation is among the largest school operators in
    // its own city.
    { id: 'dept-education', name: t('Education Department'), shortName: t('Education'), domain: 'education', staffCount: 18600, budgetCrore: 3240, description: t('Municipal primary and secondary schools, teaching establishment, mid-day meals and school infrastructure.'), scaleBy: 'population' },
    { id: 'dept-housing', name: t('Slum Improvement & Housing Cell'), shortName: t('Housing'), domain: 'housing', staffCount: 1420, budgetCrore: 1860, description: t('Basic service delivery to informal settlements, rehousing schemes and transit accommodation.'), scaleBy: 'population' },
    { id: 'dept-electrical', name: t('Electrical & Street Lighting Department'), shortName: t('Street Lighting'), domain: 'street-lighting', staffCount: 1980, budgetCrore: 1120, description: t('Street lighting circuits, LED conversion, energy accounting and fault rectification.'), scaleBy: 'area' },
    { id: 'dept-licence', name: t('Licence Department'), shortName: t('Licence'), domain: 'licensing', staffCount: 1240, budgetCrore: 210, description: t('Shop and establishment, eating house, lodging and trade licensing, and enforcement against unlicensed premises.'), scaleBy: 'population' },
    { id: 'dept-registration', name: t('Vital Statistics & Registration Department'), shortName: t('Registration'), domain: 'registration', staffCount: 860, budgetCrore: 140, description: t('Statutory registration of births and deaths, certificate issue and vital statistics reporting.'), scaleBy: 'population' },
    { id: 'dept-gardens', name: t('Gardens Department & Tree Authority'), shortName: t('Gardens'), domain: 'gardens', staffCount: 2380, budgetCrore: 620, description: t('Gardens, playgrounds and recreation grounds, the tree census, felling permissions and compensatory planting.'), scaleBy: 'area' },
    { id: 'dept-secretary', name: t('Municipal Secretary\'s Office'), shortName: t('Secretary'), domain: 'council', staffCount: 340, budgetCrore: 120, description: t('Secretariat to the Corporation in session and its committees, resolution record and the deliberative calendar.'), scaleBy: 'budget' },
    { id: 'dept-legal', name: t('Law Department'), shortName: t('Law'), domain: 'legal', staffCount: 210, budgetCrore: 85, description: t('Conducts every court matter, RTI second-appeal defence and contractor arbitration the Corporation is party to.'), scaleBy: 'budget' },
    { id: 'dept-fire', name: t('{0} Fire Brigade', t(activeCorporation.city)), shortName: t('Fire Brigade'), domain: 'emergency', staffCount: 3120, budgetCrore: 890, description: t('Fire prevention, rescue operations, emergency response and fire safety audits.'), scaleBy: 'population' },
    { id: 'dept-disaster', name: t('Disaster Management Cell'), shortName: t('Disaster Mgmt'), domain: 'disaster', staffCount: 640, budgetCrore: 320, description: t('Emergency operations centre, monsoon preparedness and multi-agency coordination.'), scaleBy: 'area' },
    { id: 'dept-assessment', name: t('Assessment & Collection Department'), shortName: t('A&C'), domain: 'property', staffCount: 2860, budgetCrore: 410, description: t('Property assessment, capital-value determination, billing and tax collection.'), scaleBy: 'budget' },
    { id: 'dept-finance', name: t('Finance & Accounts Department'), shortName: t('Finance'), domain: 'budget', staffCount: 1740, budgetCrore: 380, description: t('Budget preparation, expenditure control, treasury operations and financial reporting.'), scaleBy: 'budget' },
    { id: 'dept-procurement', name: t('Central Purchase & Contracts Department'), shortName: t('Procurement'), domain: 'procurement', staffCount: 920, budgetCrore: 190, description: t('Tendering, contract award, vendor empanelment and contract administration.'), scaleBy: 'budget' },
    { id: 'dept-projects', name: t('Project Management Department'), shortName: t('Projects'), domain: 'projects', staffCount: 1480, budgetCrore: 640, description: t('Capital project delivery oversight, milestone governance and quality assurance.'), scaleBy: 'budget' },
    { id: 'dept-building', name: t('Development Plan & Building Proposals'), shortName: t('Building Proposals'), domain: 'buildings', staffCount: 2110, budgetCrore: 420, description: t('Development control, building permissions, structural audits and dilapidation.'), scaleBy: 'area' },
    { id: 'dept-environment', name: t('Environment Department'), shortName: t('Environment'), domain: 'environment', staffCount: 680, budgetCrore: 520, description: t('Air and noise quality, climate action, tree authority and environmental compliance.'), scaleBy: 'area' },
    { id: 'dept-coastal', name: water.name, shortName: water.shortName, domain: 'coastal', staffCount: 340, budgetCrore: 1180, description: water.description, scaleBy: 'area' },
    { id: 'dept-planning', name: t('Urban Planning & Development Plan Cell'), shortName: t('Planning'), domain: 'planning', staffCount: 560, budgetCrore: 290, description: t('Development plan implementation, land use, growth corridors and capital planning.'), scaleBy: 'area' },
    { id: 'dept-mobility', name: t('Traffic & Transportation Cell'), shortName: t('Mobility'), domain: 'mobility', staffCount: 780, budgetCrore: 1340, description: t('Traffic management coordination, junction improvement and mobility infrastructure.'), scaleBy: 'population' },
    { id: 'dept-estates', name: t('Estates & Municipal Assets Department'), shortName: t('Estates'), domain: 'assets', staffCount: 1240, budgetCrore: 470, description: t('Municipal property register, asset condition, leases and facility management.'), scaleBy: 'area' },
    { id: 'dept-personnel', name: t('Personnel & Workforce Department'), shortName: t('Personnel'), domain: 'workforce', staffCount: 1080, budgetCrore: 260, description: t('Establishment, cadre strength, deployment planning and workforce welfare.'), scaleBy: 'population' },
    { id: 'dept-it', name: t('Information Technology Department'), shortName: t('IT'), domain: 'platform', staffCount: 620, budgetCrore: 740, description: t('Municipal digital infrastructure, application platforms, data services and cyber security.'), scaleBy: 'budget' },
    { id: 'dept-security', name: t('Information Security Office'), shortName: t('InfoSec'), domain: 'security', staffCount: 140, budgetCrore: 180, description: t('Security posture, identity governance, access policy and security incident response.'), scaleBy: 'budget' },
    { id: 'dept-ai-governance', name: t('AI Governance Office'), shortName: t('AI Governance'), domain: 'ai-governance', staffCount: 60, budgetCrore: 95, description: t('Model approval, prompt governance, AI risk register and human oversight assurance.'), scaleBy: 'budget' },
    { id: 'dept-commissioner', name: t('Municipal Commissioner\'s Office'), shortName: t('Commissioner'), domain: 'executive', staffCount: 210, budgetCrore: 160, description: t('Executive command, inter-departmental coordination and corporation-wide decisions.'), scaleBy: 'budget' },
  ]
}

/** ---------------------------------------------------------------------
 * Officers
 * ------------------------------------------------------------------- */

/**
 * Officer names, written in the language the interface is running in.
 *
 * These are Marathi names either way — an officer of a Maharashtra municipal
 * corporation is not called Aditya Deshmukh in English and something else in
 * Marathi. What changes is the script they are set in, and a Marathi screen
 * that renders every heading in Devanagari and then the officer's own name in
 * Latin reads as a half-finished translation.
 *
 * Built as functions rather than module constants so the translation happens
 * on each layer rebuild rather than freezing at import, and written as literal
 * `t()` calls so the catalogue audit can see and gate them.
 */
function officerFirstNames(): string[] {
  return [
    t('Aditya'), t('Meera'), t('Rajesh'), t('Sunita'), t('Prakash'), t('Kavita'),
    t('Nilesh'), t('Anjali'), t('Sandeep'), t('Rupali'), t('Vikram'), t('Deepa'),
    t('Mahesh'), t('Shweta'), t('Girish'), t('Manisha'), t('Tushar'), t('Vaishali'),
    t('Ashok'), t('Neha'), t('Ramesh'), t('Pallavi'), t('Yogesh'), t('Smita'),
    t('Kiran'), t('Aarti'), t('Sameer'), t('Jyoti'), t('Dattatray'), t('Sneha'),
    t('Milind'), t('Rohini'),
  ]
}

function officerLastNames(): string[] {
  return [
    t('Deshmukh'), t('Kulkarni'), t('Patil'), t('Joshi'), t('Shinde'), t('Gaikwad'),
    t('Sawant'), t('More'), t('Pawar'), t('Bhosale'), t('Jadhav'), t('Naik'),
    t('Rane'), t('Salvi'), t('Chavan'), t('Thakur'), t('Kadam'), t('Mhatre'),
    t('Wagh'), t('Bhosle'), t('Nikam'), t('Tambe'), t('Solanki'), t('Parab'),
  ]
}

function officerName(seed: string): string {
  const r = det(`officer-name:${seed}`)
  /* The seed picks the same person in both languages: `r.pick` indexes into
     two arrays of unchanged length, so switching language renames nobody. */
  return `${r.pick(officerFirstNames())} ${r.pick(officerLastNames())}`
}

/** ---------------------------------------------------------------------
 * Builders
 * ------------------------------------------------------------------- */

function stateFromScore(score: number): OperationalState {
  if (score >= 78) return 'operational'
  if (score >= 64) return 'degraded'
  if (score >= 50) return 'at-risk'
  return 'critical'
}

function buildTrend(seed: string, polarity: Trend['polarity']): Trend {
  const r = det(`trend:${seed}`)
  const change = r.round(-6.5, 6.5, 1)
  return {
    direction: change > 0.4 ? 'up' : change < -0.4 ? 'down' : 'flat',
    changePct: change,
    polarity,
    comparisonLabel: 'vs previous 30 days',
  }
}

export function wardIdFromCode(code: string): string {
  return `ward-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/** The domain slug used in officer email addresses. Never a real mail domain. */
function mailDomain(): string {
  return `demo.${activeCorporation.id}.local`
}

/** ---------------------------------------------------------------------
 * Live bindings
 * ------------------------------------------------------------------- */

export let DEPARTMENTS: Department[] = []
export let ZONES: Zone[] = []
export let WARDS: Ward[] = []
export let WARD_BY_ID: Map<string, Ward> = new Map()
export let DEPARTMENT_BY_ID: Map<string, Department> = new Map()
export let ZONE_BY_ID: Map<string, Zone> = new Map()
export let OFFICERS: Officer[] = []
export let OFFICER_BY_ID: Map<string, Officer> = new Map()
/** Ward identifiers grouped by region - used by comparison and map filters. */
export let WARDS_BY_REGION: Record<string, Ward[]> = {}
/** Departments exposed in filter surfaces, ordered by institutional weight. */
export let DEPARTMENTS_ORDERED: Department[] = []
/** The corporation-wide reference financial year opening date. */
export let FINANCIAL_YEAR_START: string = isoDaysFromAnchor(-114)

export function wardName(id: string): string {
  const ward = WARD_BY_ID.get(id)
  return ward ? `${ward.code} - ${ward.name.split(' · ')[0]}` : id
}

export function wardShortName(id: string): string {
  const ward = WARD_BY_ID.get(id)
  return ward ? ward.code : id
}

export function departmentName(id: string): string {
  return DEPARTMENT_BY_ID.get(id)?.shortName ?? id
}

export function officerDisplayName(id: string | undefined): string {
  if (!id) return t('Unassigned')
  return OFFICER_BY_ID.get(id)?.name ?? id
}

export function officerDesignation(id: string | undefined): string {
  if (!id) return '-'
  return OFFICER_BY_ID.get(id)?.designation ?? '-'
}

registerLayer(() => {
  const corp = activeCorporation
  const scale = CITY_SCALE
  const unit = corp.wardTerminology
  const tier = corp.zoneTerminology
  const code = corp.shortName.replace(/[^A-Za-z]/g, '').toUpperCase()
  const domain = mailDomain()

  DEPARTMENTS = departmentSpecs().map((spec) => {
    const r = det(`dept:${spec.id}`)
    const score = r.int(58, 92)
    const ratio = spec.scaleBy === 'population' ? scale.population : spec.scaleBy === 'area' ? scale.area : scale.budget
    return {
      id: spec.id,
      tenantId: TENANT_ID,
      name: spec.name,
      shortName: spec.shortName,
      domain: spec.domain,
      headOfficerId: `off-head-${spec.id}`,
      staffCount: scaledCount(spec.staffCount, scale.population, 12),
      budgetCrore: scaled(spec.budgetCrore, ratio, 0.5),
      state: stateFromScore(score),
      description: spec.description,
    }
  })

  ZONES = ZONE_SPECS.map((spec) => ({
    id: spec.code.toLowerCase(),
    tenantId: TENANT_ID,
    name: spec.name,
    code: spec.code,
    wardIds: WARD_GEOMETRY.filter((w) => w.zoneCode === spec.code).map((w) => wardIdFromCode(w.code)),
    officerId: `off-zone-${spec.code.toLowerCase()}`,
  }))

  WARDS = WARD_GEOMETRY.map((spec) => {
    const id = wardIdFromCode(spec.code)
    const r = det(`ward:${id}`)

    // Health is modelled from structural pressures rather than pure noise so the
    // resulting picture is internally coherent across every domain view.
    const densityPressure = Math.min(1, spec.population / Math.max(spec.areaSqKm, 0.1) / 45_000)
    const floodPressure = spec.floodProne ? 0.24 : 0.04
    const base = 88 - densityPressure * 26 - floodPressure * 42 + r.float(-7, 7)
    const healthScore = Math.round(Math.min(94, Math.max(38, base)))
    const riskScore = Math.round(Math.min(96, Math.max(8, 100 - healthScore + r.float(-9, 9))))

    return {
      id,
      tenantId: TENANT_ID,
      code: spec.code,
      name: spec.name,
      zoneId: spec.zoneCode.toLowerCase(),
      region: spec.region,
      population: spec.population,
      areaSqKm: spec.areaSqKm,
      households: Math.round(spec.population / r.float(4.1, 4.9)),
      centroid: spec.centroid,
      polygon: spec.polygon,
      wardOfficerId: `off-ward-${id}`,
      healthScore,
      riskScore,
      healthTrend: buildTrend(`ward-health:${id}`, 'positive'),
      state: stateFromScore(healthScore),
      floodProne: spec.floodProne,
      waterloggingSpots: spec.floodProne ? r.int(4, 14) : r.int(0, 4),
    }
  })

  WARD_BY_ID = new Map(WARDS.map((w) => [w.id, w]))
  DEPARTMENT_BY_ID = new Map(DEPARTMENTS.map((d) => [d.id, d]))
  ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]))

  /** Officers: one department head, one zone deputy and one officer per ward. */
  OFFICERS = [
    ...DEPARTMENTS.map((dept, i) => ({
      id: `off-head-${dept.id}`,
      tenantId: TENANT_ID,
      name: officerName(`head-${dept.id}`),
      designation: t('Head - {0}', dept.shortName),
      departmentId: dept.id,
      email: `head.${dept.shortName.toLowerCase().replace(/[^a-z]/g, '')}@${domain}`,
      phoneMasked: `+91 ••••• ${String(2200 + i).slice(-4)}`,
      employeeCode: `${code}-H${String(1000 + i)}`,
    })),
    ...ZONES.map((zone, i) => ({
      id: `off-zone-${zone.id}`,
      tenantId: TENANT_ID,
      name: officerName(`zone-${zone.id}`),
      designation: t('Deputy Municipal Commissioner - {0} {1}', tier, zone.code),
      departmentId: 'dept-commissioner',
      email: `dmc.${zone.code.toLowerCase()}@${domain}`,
      phoneMasked: `+91 ••••• ${String(3300 + i).slice(-4)}`,
      employeeCode: `${code}-Z${String(2000 + i)}`,
    })),
    ...WARDS.map((ward, i) => ({
      id: `off-ward-${ward.id}`,
      tenantId: TENANT_ID,
      name: officerName(`ward-${ward.id}`),
      designation: t('{0} Officer - {1}', unit, ward.code),
      departmentId: 'dept-commissioner',
      wardId: ward.id,
      email: `wo.${ward.code.toLowerCase().replace(/[^a-z0-9]/g, '')}@${domain}`,
      phoneMasked: `+91 ••••• ${String(4400 + i).slice(-4)}`,
      employeeCode: `${code}-W${String(3000 + i)}`,
    })),
  ]

  OFFICER_BY_ID = new Map(OFFICERS.map((o) => [o.id, o]))

  // Regions are whatever the active corporation's geography actually produced -
  // Brihanmumbai's City / Western Suburbs / Eastern Suburbs, or the compass
  // bands a generated city is divided into. Never a fixed Mumbai triple.
  WARDS_BY_REGION = WARDS.reduce<Record<string, Ward[]>>((acc, ward) => {
    ;(acc[ward.region] ??= []).push(ward)
    return acc
  }, {})

  DEPARTMENTS_ORDERED = [...DEPARTMENTS].sort((a, b) => b.budgetCrore - a.budgetCrore)
  FINANCIAL_YEAR_START = isoDaysFromAnchor(-114)
})
