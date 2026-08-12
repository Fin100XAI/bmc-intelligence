import { TENANT_ID, activeCorporation, municipality } from '@/config/municipality.config'
import type { Severity } from '@/types/common'
import type { Ward } from '@/types/organisation'
import type {
  BudgetHead,
  BudgetLine,
  Contract,
  Contractor,
  Project,
  ProjectCategory,
  ProjectMilestone,
  ProjectStatus,
  PropertySegment,
  RevenueAnomaly,
  RevenueRecord,
  RevenueStream,
  RiskDriver,
  TenderStage,
} from '@/types/finance'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { DEPARTMENTS, WARDS, WARD_BY_ID, wardName } from './reference'
import { EVIDENCE_ITEMS } from './evidence.data'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Municipal finance - contractors, capital projects, contracts, budget lines,
 * revenue heads and property assessment.
 *
 * This is the money layer, and money is what gives a demonstration away
 * fastest. Every rupee magnitude below was written for Brihanmumbai's ₹74,427
 * crore outlay and is scaled to the active corporation's own published budget
 * through `CITY_SCALE.budget` (`./scale.ts`). Departmental allocations are read
 * from `DEPARTMENTS`, which `./reference.ts` has already scaled, so the budget
 * book can never disagree with the departmental one. Ratios - collection
 * efficiency, cost and schedule variance, risk scores, the published risk
 * weights - are scale-free and are left exactly as modelled.
 *
 * Collection LENGTHS scale as well: a corporation running a ₹463 crore budget
 * does not have 128 live capital works. Each collection carries a floor so
 * every table still renders a readable page for the smallest corporation.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/** ---------------------------------------------------------------------
 * Contractors
 * ------------------------------------------------------------------- */

/**
 * Constructed firm names. Each is a modelled label built from a state-wide
 * geographic feature or a common Marathi word plus a trade descriptor. None is
 * an empanelled contractor of any municipal corporation, and none carries a
 * city-specific place name that would read as the wrong city's supplier once
 * the corporation is switched.
 */
function build$CONTRACTOR_NAMES() {
  return [
  t('Sahyadri Infrastructure Works Pvt Ltd'),
  t('Godavari Civil Engineering Co.'),
  t('Deccan Urban Constructions Ltd'),
  t('Pravara Hydro Systems Pvt Ltd'),
  t('Satpuda Roadways & Paving Ltd'),
  t('Trimurti Environmental Services'),
  t('Manjra Drainage Contractors'),
  t('Sahakar Municipal Services Ltd'),
  t('Balaghat Structures Pvt Ltd'),
  t('Bhima Waterworks Engineering'),
  t('Panchganga Waste Systems Pvt Ltd'),
  t('Suvidha Sanitation Works Ltd'),
  t('Yashwant Bridge Engineers'),
  t('Pratap Utility Constructions'),
  t('Prabhat Facility Management Ltd'),
  t('Krishna Waterfront Engineering Pvt Ltd'),
  t('Panzara Pipeline Systems'),
  t('Girna Transport & Fleet Services'),
  t('Wardha Electrical Infrastructure'),
  t('Purna Health Infrastructure Ltd'),
  t('Tapi Green Spaces Pvt Ltd'),
  t('Wainganga Building Works'),
]
}
let CONTRACTOR_NAMES: ReturnType<typeof build$CONTRACTOR_NAMES> = build$CONTRACTOR_NAMES()
registerLayer(() => {
  CONTRACTOR_NAMES = build$CONTRACTOR_NAMES()
})

const ALL_CATEGORIES: ProjectCategory[] = [
  'roads',
  'stormwater',
  'water-supply',
  'sewerage',
  'health',
  'education',
  'solid-waste',
  'coastal',
  'buildings',
  'mobility',
  'environment',
]

/**
 * The prefix every municipal file reference carries. Corporations number their
 * own files under their own abbreviation, so this follows the active
 * corporation rather than being fixed to one registry.
 */
function referenceCode(): string {
  return activeCorporation.shortName.replace(/[^A-Za-z]/g, '').toUpperCase()
}

/**
 * The most active contracts any one supplier holds. This is a ceiling on a
 * count of live contracts, so it has to move with the size of the contract
 * book: telling a corporation with sixteen live contracts that one supplier
 * holds fourteen of them is a statement no procurement officer would believe.
 */
function maxActiveContracts(): number {
  return scaledCount(14, CITY_SCALE.budget, 4)
}

export let CONTRACTORS: Contractor[] = []
export let CONTRACTOR_BY_ID: Map<string, Contractor> = new Map()

function buildContractors(): Contractor[] {
  const code = referenceCode()
  const maxActive = maxActiveContracts()
  // The empanelled roster is a money-side collection: a smaller works
  // programme supports fewer empanelled firms. Floored at eight so the
  // contractor table is never a two-row page.
  const count = Math.min(CONTRACTOR_NAMES.length, scaledCount(CONTRACTOR_NAMES.length, CITY_SCALE.budget, 8))

  return CONTRACTOR_NAMES.slice(0, count).map((name, i) => {
    const r = det(`contractor:${i}`)
    const performanceIndex = r.int(42, 96)
    const activeContracts = r.int(2, maxActive)
    const riskFlags: string[] = []
    if (performanceIndex < 60) riskFlags.push(t('Delivery performance below empanelment expectation'))
    if (r.chance(0.3)) riskFlags.push(t('Repeated time extensions across active contracts'))
    if (r.chance(0.22)) riskFlags.push(t('Category concentration above departmental threshold'))
    if (r.chance(0.2)) riskFlags.push(t('Open inspection observations exceeding rectification window'))

    return {
      id: `ctr-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name,
      registrationRef: `${code}/EMP/${2019 + (i % 6)}/${String(1200 + i * 7)}`,
      category: r.sample(ALL_CATEGORIES, r.int(1, 3)),
      activeContracts,
      totalValueCrore: scaled(r.round(18, 640, 1), CITY_SCALE.budget, 0.05),
      performanceIndex,
      onTimeDeliveryPct: r.int(38, 97),
      openObservations: r.int(0, 12),
      riskFlags,
      state: performanceIndex >= 78 ? 'operational' : performanceIndex >= 62 ? 'degraded' : performanceIndex >= 50 ? 'at-risk' : 'review-required',
      empanelledSince: isoDaysFromAnchor(-r.int(400, 3200)),
    }
  })
}

export function contractorName(id: string | undefined): string {
  if (!id) return '-'
  return CONTRACTOR_BY_ID.get(id)?.name ?? id
}

/** ---------------------------------------------------------------------
 * Projects - with an explainable risk engine
 * ------------------------------------------------------------------- */

/**
 * Titles for the water-body works programme, expressed in the form of water
 * body the active corporation actually manages. `dept-coastal` is a seawall
 * and mangrove cell in Brihanmumbai and a river, lake or watershed cell inland
 * (`./reference.ts`), and its works programme has to follow: a mangrove
 * demarcation contract in a landlocked district is an obvious fabrication.
 */
function waterBodyProjectTitles(): string[] {
  switch (activeCorporation.form.type) {
    case 'coastal':
    case 'creek-side':
      return [
        t('Seawall reconstruction along protected shoreline'),
        t('Mangrove conservation and boundary demarcation'),
        t('Promenade strengthening works'),
        t('Coastal outfall protection works'),
      ]
    case 'riverine':
      return [
        t('Embankment reconstruction along the protected river reach'),
        t('Riverbank conservation and boundary demarcation'),
        t('Riverfront promenade strengthening works'),
        t('River outfall protection works'),
      ]
    case 'lakeside':
      return [
        t('Lake bund reconstruction and strengthening'),
        t('Catchment conservation and boundary demarcation'),
        t('Lakefront promenade strengthening works'),
        t('Lake outfall protection works'),
      ]
    default:
      return [
        t('Water body bund reconstruction and strengthening'),
        t('Catchment conservation and boundary demarcation'),
        t('Waterfront promenade strengthening works'),
        t('Water body outfall protection works'),
      ]
  }
}

function projectTitles(): Record<ProjectCategory, string[]> {
  return {
    roads: [
      t('Concretisation of arterial road network'),
      t('Reconstruction of junction and approach roads'),
      t('Resurfacing programme for internal roads'),
      t('Strengthening of flyover approach spans'),
      t('Footpath and pedestrian facility upgrade'),
    ],
    stormwater: [
      t('Augmentation of major nallah training walls'),
      t('Construction of storm water pumping station'),
      t('Widening and lining of minor nallah reach'),
      t('Replacement of undersized culverts'),
      t('Storm water drain network augmentation'),
    ],
    'water-supply': [
      t('Replacement of ageing distribution mains'),
      t('Construction of service reservoir'),
      t('District metered area implementation'),
      t('Trunk main rehabilitation'),
      t('Water treatment facility upgrade'),
    ],
    sewerage: [
      t('Sewage treatment facility upgrade'),
      t('Trunk sewer rehabilitation'),
      t('Sewerage pumping station modernisation'),
      t('Sewer network extension to unserved pockets'),
      t('Outfall improvement works'),
    ],
    health: [
      t('Upgrade of peripheral hospital critical care block'),
      t('Construction of maternity home'),
      t('Dispensary refurbishment programme'),
      t('Medical equipment modernisation'),
      t('Health post construction'),
    ],
    education: [
      t('Municipal school building reconstruction'),
      t('Digital classroom infrastructure programme'),
      t('School sanitation facility upgrade'),
      t('Structural strengthening of school buildings'),
    ],
    'solid-waste': [
      t('Construction of refuse transfer station'),
      t('Waste-to-compost facility development'),
      t('Bio-methanation plant construction'),
      t('Landfill scientific capping works'),
      t('Collection fleet modernisation'),
    ],
    coastal: waterBodyProjectTitles(),
    buildings: [
      t('Ward office building reconstruction'),
      t('Municipal staff quarters redevelopment'),
      t('Market building redevelopment'),
      t('Fire station facility construction'),
    ],
    mobility: [
      t('Junction improvement and signal modernisation'),
      t('Pedestrian subway construction'),
      t('Bus priority corridor infrastructure'),
      t('Multi-level parking facility'),
    ],
    environment: [
      t('Urban forest and open space development'),
      t('Air quality monitoring network expansion'),
      t('Lake rejuvenation works'),
      t('Noise barrier installation programme'),
    ],
  }
}

const CATEGORY_DEPARTMENT: Record<ProjectCategory, string> = {
  roads: 'dept-roads',
  stormwater: 'dept-stormwater',
  'water-supply': 'dept-hydraulic',
  sewerage: 'dept-sewerage',
  health: 'dept-hospitals',
  education: 'dept-building',
  'solid-waste': 'dept-solid-waste',
  coastal: 'dept-coastal',
  buildings: 'dept-building',
  mobility: 'dept-mobility',
  environment: 'dept-environment',
}

function build$MILESTONE_NAMES() {
  return [
  t('Work order and mobilisation'),
  t('Site clearance and utility diversion'),
  t('Substructure completion'),
  t('Main works - first stage'),
  t('Main works - second stage'),
  t('Testing and commissioning'),
  t('Handover and defect liability commencement'),
]
}
let MILESTONE_NAMES: ReturnType<typeof build$MILESTONE_NAMES> = build$MILESTONE_NAMES()
registerLayer(() => {
  MILESTONE_NAMES = build$MILESTONE_NAMES()
})

function severityFromScore(score: number): Severity {
  if (score >= 78) return 'critical'
  if (score >= 62) return 'high'
  if (score >= 42) return 'medium'
  return 'low'
}

/**
 * Project Risk Engine.
 *
 * Weights are declared here and published in the interface so that every
 * score is explainable. The engine surfaces risk; it never characterises
 * any party's conduct.
 *
 * The weights and the normalisation ceilings below are policy constants of the
 * engine, not city magnitudes, so they are identical for every corporation. A
 * tolerance that moved with the size of the corporation would make two scores
 * incomparable and would defeat the point of publishing them.
 */
const PROJECT_RISK_WEIGHTS = {
  scheduleVariance: 0.24,
  costVariance: 0.18,
  milestoneSlippage: 0.16,
  paymentProgressMismatch: 0.16,
  contractorHistory: 0.1,
  inspectionObservations: 0.09,
  citizenComplaints: 0.07,
} as const

function computeProjectRisk(input: {
  scheduleVariancePct: number
  costVariancePct: number
  slippedMilestones: number
  totalMilestones: number
  paymentLeadPct: number
  contractorPerformance: number
  openObservations: number
  complaints: number
}): { score: number; drivers: RiskDriver[] } {
  const norm = (v: number, max: number): number => Math.min(100, Math.max(0, (v / max) * 100))

  const raw = {
    scheduleVariance: norm(input.scheduleVariancePct, 60),
    costVariance: norm(input.costVariancePct, 40),
    milestoneSlippage: input.totalMilestones > 0 ? norm(input.slippedMilestones / input.totalMilestones, 0.6) : 0,
    paymentProgressMismatch: norm(input.paymentLeadPct, 30),
    contractorHistory: 100 - input.contractorPerformance,
    inspectionObservations: norm(input.openObservations, 10),
    citizenComplaints: norm(input.complaints, 40),
  }

  const explanations: Record<keyof typeof raw, (v: number) => string> = {
    scheduleVariance: (v) => t('Elapsed programme exceeds planned progress by {0} percentage points, normalising to {1}/100 against the 60-point tolerance ceiling.', input.scheduleVariancePct.toFixed(0), v.toFixed(0)),
    costVariance: (v) => t('Current cost stands {0}% above sanctioned, normalising to {1}/100 against the 40% ceiling.', input.costVariancePct.toFixed(1), v.toFixed(0)),
    milestoneSlippage: (v) => t('{0} of {1} milestones have slipped, normalising to {2}/100.', input.slippedMilestones, input.totalMilestones, v.toFixed(0)),
    paymentProgressMismatch: (v) => t('Financial progress leads physical progress by {0} percentage points, normalising to {1}/100. This is a control indicator, not a finding.', input.paymentLeadPct.toFixed(0), v.toFixed(0)),
    contractorHistory: (v) => t('Executing agency delivery index is {0}/100, contributing {1}/100 as an inverse driver.', input.contractorPerformance, v.toFixed(0)),
    inspectionObservations: (v) => t('{0} inspection observations remain open beyond their rectification window, normalising to {1}/100.', input.openObservations, v.toFixed(0)),
    citizenComplaints: (v) => t('{0} citizen complaints are linked to the work location, normalising to {1}/100.', input.complaints, v.toFixed(0)),
  }

  const labels: Record<keyof typeof raw, string> = {
    scheduleVariance: 'Schedule variance',
    costVariance: 'Cost variance',
    milestoneSlippage: 'Milestone slippage',
    paymentProgressMismatch: 'Payment / progress mismatch',
    contractorHistory: 'Executing agency delivery history',
    inspectionObservations: 'Unresolved inspection observations',
    citizenComplaints: 'Linked citizen complaints',
  }

  const drivers: RiskDriver[] = (Object.keys(raw) as Array<keyof typeof raw>).map((key) => {
    const rawScore = raw[key]
    const weight = PROJECT_RISK_WEIGHTS[key]
    const contribution = rawScore * weight
    return {
      id: key,
      label: labels[key],
      contribution: Math.round(contribution * 10) / 10,
      weight,
      rawScore: Math.round(rawScore),
      explanation: explanations[key](rawScore),
      severity: severityFromScore(rawScore),
    }
  })

  const score = Math.round(drivers.reduce((sum, d) => sum + d.contribution, 0))
  return { score: Math.min(100, Math.max(0, score)), drivers }
}

export let PROJECTS: Project[] = []
export let PROJECT_BY_ID: Map<string, Project> = new Map()

function buildProjects(): Project[] {
  const titles = projectTitles()
  const code = referenceCode()
  const financialYearRef = municipality.financialYear.replace(/[^0-9–]/g, '').slice(0, 4)
  // The capital programme is a money-side collection. Floored at 24 rather than
  // at the table minimum because the same array feeds the category and status
  // breakdowns, and eleven categories need enough works to read as a portfolio.
  const projectCount = scaledCount(128, CITY_SCALE.budget, 24)

  return Array.from({ length: projectCount }, (_, i) => {
    const seed = `project-${i}`
    const r = det(seed)
    const category = r.pick(ALL_CATEGORIES)
    const titlePool = titles[category]
    const baseTitle = r.pick(titlePool)
    const primaryWard = r.pick(WARDS)
    const extraWards = r.chance(0.28) ? r.sample(WARDS.filter((w) => w.id !== primaryWard.id), r.int(1, 2)).map((w) => w.id) : []
    const contractor = r.pick(CONTRACTORS)

    // Sanctioned cost is the first figure a commissioner checks, so it tracks
    // the corporation's own outlay rather than Brihanmumbai's. The floor is set
    // at ₹5 lakh - the smallest package a corporation would sanction as a work
    // in its own right - low enough that scaled-down costs still spread across
    // the table instead of piling up on the floor value.
    const sanctioned = scaled(r.round(2.4, 460, 1), CITY_SCALE.budget, 0.05)
    const costVariancePct = r.chance(0.42) ? r.round(0.5, 34, 1) : 0
    const current = Math.round(sanctioned * (1 + costVariancePct / 100) * 100) / 100
    const paidPct = r.int(8, 96)
    const paid = Math.round(current * (paidPct / 100) * 100) / 100

    const plannedStartDays = -r.int(90, 1080)
    const durationDays = r.int(240, 1080)
    const plannedEndDays = plannedStartDays + durationDays
    const elapsedPct = Math.min(
      100,
      Math.max(0, ((0 - plannedStartDays) / durationDays) * 100),
    )
    /**
     * Delivery pace against the phased plan, as a multiple of planned progress.
     *
     * This was `r.float(0.45, 1.12)` - a mean of 0.79, which put essentially
     * every project behind its plan and, because the contractor engine assesses
     * schedule on the MEAN pace across a supplier's projects, flagged 18 of 22
     * suppliers as behind schedule. A capital programme in which four fifths of
     * suppliers are behind is not a programme under management, and it left the
     * "carrying at least one indicator" filter with nothing to exclude.
     *
     * Centred on plan instead, with a real spread either side: most works track
     * their programme, a meaningful minority slip, and some run ahead. The bands
     * are explicit rather than a single range so the intended distribution is
     * legible and can be argued with.
     */
    const deliveryPace = r.weighted([
      [r.float(0.58, 0.82), 20], // materially behind programme
      [r.float(0.86, 0.97), 30], // slightly behind
      [r.float(0.98, 1.06), 34], // tracking the programme
      [r.float(1.07, 1.22), 16], // running ahead
    ])
    const completionPct = Math.min(100, Math.max(0, Math.round(elapsedPct * deliveryPace)))
    const plannedCompletionPct = Math.min(100, Math.round(elapsedPct))
    // Clamped at zero: a work running ahead of programme carries no adverse
    // schedule variance, it is not credited with a negative one.
    const scheduleVariancePct = Math.max(0, plannedCompletionPct - completionPct)

    const totalMilestones = r.int(4, 7)
    const milestones: ProjectMilestone[] = Array.from({ length: totalMilestones }, (_, m) => {
      const mr = det(`${seed}:ms:${m}`)
      const plannedOffset = plannedStartDays + Math.round((durationDays / totalMilestones) * (m + 1))
      const achieved = plannedOffset < 0 && completionPct > ((m + 1) / totalMilestones) * 100
      const slipped = plannedOffset < 0 && !achieved
      const slippageDays = slipped ? mr.int(8, 210) : 0
      return {
        id: `${seed}-ms-${m + 1}`,
        name: MILESTONE_NAMES[m] ?? t('Stage {0}', m + 1),
        plannedDate: isoDaysFromAnchor(plannedOffset),
        actualDate: achieved ? isoDaysFromAnchor(plannedOffset + mr.int(-12, 30)) : undefined,
        status: achieved ? 'achieved' : slipped ? 'slipped' : plannedOffset < 45 ? 'at-risk' : 'pending',
        slippageDays,
      }
    })

    const slipped = milestones.filter((m) => m.status === 'slipped').length
    const paymentLeadPct = Math.max(0, paidPct - completionPct)
    /**
     * Inspection observations still open BEYOND their rectification window.
     * A flat 0-9 put the average work permanently carrying four and a half
     * overdue findings, which is not a supervised programme. Skewed toward
     * zero instead: most works have none or one outstanding, and a minority
     * accumulate a backlog worth an officer's attention.
     */
    const openObservations = r.weighted([
      [0, 34],
      [r.int(1, 2), 30],
      [r.int(3, 5), 22],
      [r.int(6, 12), 14],
    ])
    // Observations and complaints are counted against one work location, not
    // across the city, and the engine normalises them against a fixed published
    // tolerance. Neither is a corporation-wide volume, so neither is scaled.
    const complaints = r.int(0, 34)

    const { score, drivers } = computeProjectRisk({
      scheduleVariancePct,
      costVariancePct,
      slippedMilestones: slipped,
      totalMilestones,
      paymentLeadPct,
      contractorPerformance: contractor.performanceIndex,
      openObservations,
      complaints,
    })

    let status: ProjectStatus
    if (completionPct >= 100) status = r.chance(0.5) ? 'completed' : 'closed'
    else if (plannedStartDays > 0) status = 'planned'
    else if (scheduleVariancePct > 18) status = 'delayed'
    else if (r.chance(0.06)) status = 'on-hold'
    else status = 'in-progress'

    return {
      id: `prj-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${code}/CAP/${financialYearRef}/${String(4100 + i)}`,
      name: `${baseTitle} - ${primaryWard.code}`,
      description: t('{0} covering {1}{2}, executed under the {3} works programme.', baseTitle, wardName(primaryWard.id), extraWards.length ? ` and ${extraWards.length} adjoining ward(s)` : '', DEPARTMENTS.find((d) => d.id === CATEGORY_DEPARTMENT[category])?.shortName ?? 'municipal'),
      wardIds: [primaryWard.id, ...extraWards],
      departmentId: CATEGORY_DEPARTMENT[category],
      category,
      contractorId: contractor.id,
      sanctionedCostCrore: sanctioned,
      currentCostCrore: current,
      paidCrore: paid,
      plannedStart: isoDaysFromAnchor(plannedStartDays),
      plannedEnd: isoDaysFromAnchor(plannedEndDays),
      actualStart: plannedStartDays < 0 ? isoDaysFromAnchor(plannedStartDays + r.int(0, 45)) : undefined,
      actualEnd: completionPct >= 100 ? isoDaysFromAnchor(plannedEndDays + r.int(-20, 120)) : undefined,
      completionPct,
      plannedCompletionPct,
      milestones,
      status,
      riskScore: score,
      riskDrivers: drivers,
      openIssues: r.int(0, 8),
      complaintsLinked: complaints,
      inspectionObservationsOpen: openObservations,
      lastInspectedAt: isoDaysFromAnchor(-r.int(1, 90)),
      classification: 'confidential',
      updatedAt: isoDaysFromAnchor(-r.int(0, 12)),
    }
  })
}

/** ---------------------------------------------------------------------
 * Contracts & procurement risk indicators
 * ------------------------------------------------------------------- */

const PROCUREMENT_RISK_WEIGHTS = {
  extensions: 0.26,
  variation: 0.24,
  deliveryDelay: 0.22,
  performance: 0.18,
  concentration: 0.1,
} as const

export let CONTRACTS: Contract[] = []
export let CONTRACT_BY_ID: Map<string, Contract> = new Map()

function buildContracts(): Contract[] {
  const code = referenceCode()
  const maxActive = maxActiveContracts()
  // Contract values derive from the sanctioned project cost, which is already
  // scaled, so only the length of the book is scaled here. Floored at 16 so the
  // procurement table and its six-stage breakdown both stay legible.
  const contractCount = scaledCount(72, CITY_SCALE.budget, 16)

  return Array.from({ length: contractCount }, (_, i) => {
    const seed = `contract-${i}`
    const r = det(seed)
    const project = r.pick(PROJECTS)
    const contractor = CONTRACTOR_BY_ID.get(project.contractorId) ?? r.pick(CONTRACTORS)
    const value = Math.round(project.sanctionedCostCrore * r.float(0.72, 1.05) * 100) / 100
    const paid = Math.round(value * r.float(0.1, 0.94) * 100) / 100
    const extensions = r.weighted([[0, 5], [1, 4], [2, 3], [3, 2], [4, 1]] as const)
    const variationPct = r.chance(0.5) ? r.round(0.6, 24, 1) : 0
    const awardDays = -r.int(120, 1400)
    const originalDurationDays = r.int(240, 900)
    const extensionDays = extensions * r.int(45, 150)
    const milestonesTotal = project.milestones.length
    const milestonesAchieved = project.milestones.filter((m) => m.status === 'achieved').length
    const deliveryDelayPct = milestonesTotal > 0 ? Math.max(0, ((milestonesTotal - milestonesAchieved) / milestonesTotal) * 100) : 0
    // Concentration is measured against the same ceiling the roster was drawn
    // against, so the indicator keeps meaning "at the limit" in every
    // corporation rather than in Brihanmumbai only.
    const concentration = Math.min(100, (contractor.activeContracts / maxActive) * 100)

    const rawIndicators = {
      extensions: Math.min(100, (extensions / 4) * 100),
      variation: Math.min(100, (variationPct / 24) * 100),
      deliveryDelay: deliveryDelayPct,
      performance: 100 - contractor.performanceIndex,
      concentration,
    }

    const labels: Record<keyof typeof rawIndicators, string> = {
      extensions: 'Repeated time extensions',
      variation: 'Contract variation magnitude',
      deliveryDelay: 'Milestone delivery delay',
      performance: 'Supplier performance deterioration',
      concentration: 'Category concentration',
    }

    const explanations: Record<keyof typeof rawIndicators, string> = {
      extensions: `${extensions} time extension(s) granted against an original programme of ${originalDurationDays} days. Repeated extension indicates delivery risk and possible planning optimism; it is not a finding of impropriety.`,
      variation: `Variations amount to ${variationPct.toFixed(1)}% of contract value. Variation within sanctioned limits is normal; magnitude is tracked as a delivery-risk indicator only.`,
      deliveryDelay: `${milestonesTotal - milestonesAchieved} of ${milestonesTotal} milestones remain outstanding at the reporting date.`,
      performance: `Supplier delivery index stands at ${contractor.performanceIndex}/100 across all active contracts.`,
      concentration: `The supplier holds ${contractor.activeContracts} active contracts. Concentration is a delivery-continuity exposure, independent of how any contract was awarded.`,
    }

    const riskIndicators: RiskDriver[] = (Object.keys(rawIndicators) as Array<keyof typeof rawIndicators>).map((key) => ({
      id: key,
      label: labels[key],
      contribution: Math.round(rawIndicators[key] * PROCUREMENT_RISK_WEIGHTS[key] * 10) / 10,
      weight: PROCUREMENT_RISK_WEIGHTS[key],
      rawScore: Math.round(rawIndicators[key]),
      explanation: explanations[key],
      severity: severityFromScore(rawIndicators[key]),
    }))

    const riskScore = Math.round(riskIndicators.reduce((s, d) => s + d.contribution, 0))
    const stage: TenderStage = r.weighted([
      ['awarded', 7],
      ['evaluation', 2],
      ['bidding', 2],
      ['published', 1],
      ['draft', 1],
      ['cancelled', 1],
    ] as const)

    return {
      id: `con-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${code}/CON/${String(7300 + i)}`,
      title: project.name.replace(/^([^-]+)/, (m) => m.trim()),
      tenderReference: `${code}/TEN/${String(5200 + i)}`,
      category: project.category,
      departmentId: project.departmentId,
      wardIds: project.wardIds,
      contractorId: contractor.id,
      valueCrore: value,
      paidCrore: paid,
      awardDate: isoDaysFromAnchor(awardDays),
      startDate: isoDaysFromAnchor(awardDays + 21),
      endDate: isoDaysFromAnchor(awardDays + 21 + originalDurationDays + extensionDays),
      originalEndDate: isoDaysFromAnchor(awardDays + 21 + originalDurationDays),
      extensions,
      variationValueCrore: Math.round(value * (variationPct / 100) * 100) / 100,
      variationPct,
      milestonesTotal,
      milestonesAchieved,
      performanceScore: contractor.performanceIndex,
      stage,
      projectId: project.id,
      riskIndicators,
      riskScore,
      classification: 'confidential',
    }
  })
}

/** ---------------------------------------------------------------------
 * Budget
 * ------------------------------------------------------------------- */

const BUDGET_HEADS: BudgetHead[] = ['revenue', 'capital', 'establishment', 'debt-service']

export let BUDGET_LINES: BudgetLine[] = []

/**
 * Budget lines are a decomposition of the departmental allocations rather than
 * a set of figures of their own, so they need no scaling here: `DEPARTMENTS`
 * carries the corporation's own allocation and everything below is a share of
 * it. That is deliberate - the budget book and the departmental register are
 * read side by side, and they must never disagree.
 */
function buildBudgetLines(): BudgetLine[] {
  return DEPARTMENTS.flatMap((dept) =>
    BUDGET_HEADS.map((head) => {
      const r = det(`budget:${dept.id}:${head}`)
      const share = head === 'capital' ? 0.42 : head === 'revenue' ? 0.3 : head === 'establishment' ? 0.22 : 0.06
      const approved = Math.round(dept.budgetCrore * share * 100) / 100
      const revised = Math.round(approved * r.float(0.9, 1.14) * 100) / 100
      // Roughly 31% of the year has elapsed at the reference date.
      const phasedTarget = revised * 0.31
      const actual = Math.round(phasedTarget * r.float(0.42, 1.35) * 100) / 100
      const committed = Math.round(revised * r.float(0.08, 0.34) * 100) / 100
      const utilisationPct = Math.round((actual / Math.max(revised, 0.01)) * 1000) / 10
      const variancePct = Math.round(((phasedTarget - actual) / Math.max(phasedTarget, 0.01)) * 1000) / 10
      const forecast = Math.round((actual / 0.31) * r.float(0.86, 1.06) * 100) / 100

      const state =
        Math.abs(variancePct) <= 12
          ? 'operational'
          : Math.abs(variancePct) <= 25
            ? 'degraded'
            : Math.abs(variancePct) <= 45
              ? 'at-risk'
              : 'review-required'

      return {
        id: `bl-${dept.id}-${head}`,
        tenantId: TENANT_ID,
        financialYear: municipality.financialYear,
        departmentId: dept.id,
        head,
        approvedCrore: approved,
        revisedCrore: revised,
        committedCrore: committed,
        actualCrore: actual,
        utilisationPct,
        variancePct,
        forecastYearEndCrore: forecast,
        state,
        riskNote:
          variancePct > 25
            ? t('Booked expenditure trails the phased plan materially; annual utilisation is at risk without re-phasing.')
            : variancePct < -25
              ? t('Expenditure is running ahead of the phased plan; commitment position requires verification.')
              : undefined,
      }
    }),
  )
}

/** ---------------------------------------------------------------------
 * Revenue & property
 * ------------------------------------------------------------------- */

const STREAMS: RevenueStream[] = [
  'property-tax',
  'water-charges',
  'development-charges',
  'licence-fees',
  'advertisement',
  'rentals',
  'octroi-compensation',
  'other',
]

/**
 * Annual target by revenue head, in INR crore. The base figures are
 * Brihanmumbai's own composition of receipts and are scaled to the active
 * corporation's outlay, which keeps each head's share of the budget - and
 * therefore the shape of the receipts pie every corporation is shown -
 * unchanged while the rupee figures follow the corporation actually being
 * rendered.
 */
function streamTargets(): Record<RevenueStream, number> {
  const base: Record<RevenueStream, number> = {
    'property-tax': 6200,
    'water-charges': 1850,
    'development-charges': 3400,
    'licence-fees': 420,
    advertisement: 310,
    rentals: 260,
    'octroi-compensation': 12400,
    other: 780,
  }
  const out = {} as Record<RevenueStream, number>
  for (const stream of STREAMS) {
    out[stream] = scaled(base[stream], CITY_SCALE.budget, 0.2)
  }
  return out
}

/**
 * Rupees per resident, relative to Brihanmumbai. Used where a figure is a RATE
 * against a quantity that is itself already corporation-scaled - a tax demand
 * per assessed property, for instance - so that applying the budget ratio to
 * the rate as well would scale the same quantity twice.
 */
function moneyPerResident(): number {
  return CITY_SCALE.budget / Math.max(CITY_SCALE.population, 1e-6)
}

export let REVENUE_RECORDS: RevenueRecord[] = []

function buildRevenueRecords(): RevenueRecord[] {
  const targets = streamTargets()
  // Ward property-tax targets distribute the corporation's own consolidated
  // property tax head across wards by population, rather than applying a
  // per-capita rate calibrated on Brihanmumbai: at Brihanmumbai's rate a small
  // corporation would be shown a property tax book several times the size of
  // its whole revenue budget.
  const wardPopulationTotal = WARDS.reduce((s, w) => s + w.population, 0) || 1

  return [
    // City-wide position by stream.
    ...STREAMS.map((stream) => {
      const r = det(`revenue:city:${stream}`)
      const target = targets[stream]
      const assessed = Math.round(target * r.float(1.0, 1.18) * 100) / 100
      const collected = Math.round(target * r.float(0.22, 0.44) * 100) / 100
      const arrears = Math.round(assessed * r.float(0.08, 0.31) * 100) / 100
      const efficiency = Math.round((collected / assessed) * 1000) / 10
      const targetVariance = Math.round(((collected - target * 0.31) / (target * 0.31)) * 1000) / 10
      return {
        id: `rev-city-${stream}`,
        tenantId: TENANT_ID,
        financialYear: municipality.financialYear,
        stream,
        assessedCrore: assessed,
        targetCrore: target,
        collectedCrore: collected,
        arrearsCrore: arrears,
        collectionEfficiencyPct: efficiency,
        targetVariancePct: targetVariance,
        forecastCrore: Math.round((collected / 0.31) * r.float(0.9, 1.05) * 100) / 100,
        state: targetVariance >= -5 ? 'operational' : targetVariance >= -18 ? 'degraded' : 'at-risk',
      } satisfies RevenueRecord
    }),
    // Ward-level property tax position.
    ...WARDS.map((ward) => {
      const r = det(`revenue:ward:${ward.id}`)
      const scale = (ward.population / wardPopulationTotal) * targets['property-tax']
      const target = Math.round(scale * r.float(0.7, 1.6) * 100) / 100
      const assessed = Math.round(target * r.float(1.02, 1.2) * 100) / 100
      const efficiencyBase = 34 + (ward.healthScore - 50) * 0.35
      const efficiency = Math.round(Math.min(72, Math.max(14, efficiencyBase + r.float(-9, 9))) * 10) / 10
      const collected = Math.round(assessed * (efficiency / 100) * 100) / 100
      const arrears = Math.round((assessed - collected) * r.float(0.4, 0.9) * 100) / 100
      const targetVariance = Math.round(((collected - target * 0.31) / (target * 0.31)) * 1000) / 10
      return {
        id: `rev-ward-${ward.id}`,
        tenantId: TENANT_ID,
        financialYear: municipality.financialYear,
        stream: 'property-tax' as const,
        wardId: ward.id,
        assessedCrore: assessed,
        targetCrore: target,
        collectedCrore: collected,
        arrearsCrore: arrears,
        collectionEfficiencyPct: efficiency,
        targetVariancePct: targetVariance,
        forecastCrore: Math.round((collected / 0.31) * r.float(0.88, 1.06) * 100) / 100,
        state: targetVariance >= -5 ? 'operational' : targetVariance >= -18 ? 'degraded' : targetVariance >= -32 ? 'at-risk' : 'review-required',
      } satisfies RevenueRecord
    }),
  ]
}

export let PROPERTY_SEGMENTS: PropertySegment[] = []

function buildPropertySegments(): PropertySegment[] {
  // The assessed demand per property is a rate, and rates track what a resident
  // is billed rather than what the corporation collects in total. Unit counts
  // already follow the corporation's households, so only the rate is scaled.
  const demandPerUnit = moneyPerResident()

  return WARDS.flatMap((ward) => {
    const segments: PropertySegment['segment'][] = ['residential', 'commercial', 'industrial', 'institutional', 'mixed']
    return segments.map((segment) => {
      const r = det(`propseg:${ward.id}:${segment}`)
      const share = segment === 'residential' ? 0.62 : segment === 'commercial' ? 0.19 : segment === 'mixed' ? 0.1 : segment === 'industrial' ? 0.05 : 0.04
      const units = Math.round((ward.households * share) / r.float(0.9, 1.5))
      const assessedValue = Math.round(units * r.float(0.0009, 0.006) * demandPerUnit * 100) / 100
      const efficiency = Math.round(r.float(22, 74) * 10) / 10
      const collected = Math.round(assessedValue * (efficiency / 100) * 100) / 100
      return {
        id: `pseg-${ward.id}-${segment}`,
        tenantId: TENANT_ID,
        wardId: ward.id,
        segment,
        assessedUnits: units,
        assessedValueCrore: assessedValue,
        collectedCrore: collected,
        arrearsCrore: Math.round((assessedValue - collected) * r.float(0.35, 0.85) * 100) / 100,
        collectionEfficiencyPct: efficiency,
        reassessmentDue: r.int(0, Math.max(1, Math.round(units * 0.06))),
      }
    })
  })
}

function build$ANOMALY_TITLES(): Array<{ title: string; description: string; disposition: RevenueAnomaly['disposition'] }> {
  return [
  {
    title: t('Capital value pattern inconsistent with locality comparables'),
    description:
      t('A cohort of assessments records capital values materially below comparable properties in the same locality and use class. Reconciliation is required to establish whether this reflects genuine property characteristics or a recording issue.'),
    disposition: 'reconciliation-required',
  },
  {
    title: t('Receipt volume outside the established seasonal band'),
    description:
      t('Receipt volume for the period sits outside the seasonal band established over the previous four years without an identified operational cause.'),
    disposition: 'unusual-pattern',
  },
  {
    title: t('Unmatched receipts pending assessment reconciliation'),
    description:
      t('Receipts recorded without a matched assessment reference have accumulated beyond the departmental tolerance for the period.'),
    disposition: 'reconciliation-required',
  },
  {
    title: t('Assessment revision cluster within a single locality'),
    description:
      t('A cluster of downward assessment revisions has been recorded in one locality within a short window. This warrants review of the underlying grounds recorded for each revision.'),
    disposition: 'investigation-candidate',
  },
  {
    title: t('Water charge realisation divergent from consumption record'),
    description:
      t('Realised water charges diverge from the metered consumption record for the zone beyond the normal reconciliation tolerance.'),
    disposition: 'anomaly',
  },
  {
    title: t('Licence fee renewal lapse concentration'),
    description:
      t('Renewal lapses are concentrated in one category within a single ward, suggesting either an operational cause or a data-capture gap.'),
    disposition: 'unusual-pattern',
  },
]
}
let ANOMALY_TITLES: Array<{ title: string; description: string; disposition: RevenueAnomaly['disposition'] }> = build$ANOMALY_TITLES()
registerLayer(() => {
  ANOMALY_TITLES = build$ANOMALY_TITLES()
})

export let REVENUE_ANOMALIES: RevenueAnomaly[] = []

function buildRevenueAnomalies(): RevenueAnomaly[] {
  // Detection volume follows the size of the receipts book. Floored at eight so
  // every template is represented and the reconciliation queue is never a
  // single card.
  const anomalyCount = scaledCount(24, CITY_SCALE.budget, 8)

  return Array.from({ length: anomalyCount }, (_, i) => {
    const r = det(`revanom:${i}`)
    const template = ANOMALY_TITLES[i % ANOMALY_TITLES.length] as (typeof ANOMALY_TITLES)[number]
    const ward = r.pick(WARDS)
    const evidenceIds = r
      .sample(
        EVIDENCE_ITEMS.filter((e) => e.kind === 'financial-record'),
        r.int(2, 3),
      )
      .map((e) => e.id)

    return {
      id: `ranm-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      title: `${template.title} - ${ward.code}`,
      description: template.description,
      disposition: template.disposition,
      stream: r.pick(STREAMS),
      wardId: ward.id,
      indicativeValueCrore: scaled(r.round(0.4, 38, 2), CITY_SCALE.budget, 0.02),
      detectedAt: isoDaysFromAnchor(-r.int(1, 90)),
      confidence: r.weighted([['low', 4], ['medium', 5], ['high', 1]] as const),
      severity: r.weighted([['low', 3], ['medium', 5], ['high', 2]] as const),
      evidenceIds,
      status: r.weighted([
        ['open', 5],
        ['under-review', 4],
        ['reconciled', 2],
        ['referred', 1],
        ['closed', 1],
      ] as const),
      ownerId: r.chance(0.7) ? 'off-head-dept-assessment' : undefined,
      interpretationNote:
        'This record identifies a statistical pattern requiring reconciliation. It does not assert error, irregularity or wrongdoing by any person or entity. An anomaly is not a finding.',
    }
  })
}

/** Aggregate helpers used by the finance intelligence surfaces. */
export function budgetTotals(): {
  approved: number
  revised: number
  actual: number
  committed: number
  utilisationPct: number
} {
  const approved = BUDGET_LINES.reduce((s, b) => s + b.approvedCrore, 0)
  const revised = BUDGET_LINES.reduce((s, b) => s + b.revisedCrore, 0)
  const actual = BUDGET_LINES.reduce((s, b) => s + b.actualCrore, 0)
  const committed = BUDGET_LINES.reduce((s, b) => s + b.committedCrore, 0)
  return {
    approved: Math.round(approved * 10) / 10,
    revised: Math.round(revised * 10) / 10,
    actual: Math.round(actual * 10) / 10,
    committed: Math.round(committed * 10) / 10,
    utilisationPct: Math.round((actual / revised) * 1000) / 10,
  }
}

export function revenueTotals(): {
  target: number
  collected: number
  arrears: number
  efficiencyPct: number
} {
  const cityRecords = REVENUE_RECORDS.filter((r) => !r.wardId)
  const target = cityRecords.reduce((s, r) => s + r.targetCrore, 0)
  const collected = cityRecords.reduce((s, r) => s + r.collectedCrore, 0)
  const arrears = cityRecords.reduce((s, r) => s + r.arrearsCrore, 0)
  const assessed = cityRecords.reduce((s, r) => s + r.assessedCrore, 0)
  return {
    target: Math.round(target),
    collected: Math.round(collected),
    arrears: Math.round(arrears),
    efficiencyPct: Math.round((collected / assessed) * 1000) / 10,
  }
}

export function wardProjects(wardId: string): Project[] {
  return PROJECTS.filter((p) => p.wardIds.includes(wardId))
}

export function wardRevenue(wardId: string): RevenueRecord | undefined {
  return REVENUE_RECORDS.find((r) => r.wardId === wardId)
}

export { PROJECT_RISK_WEIGHTS, PROCUREMENT_RISK_WEIGHTS, computeProjectRisk, severityFromScore }

/** Ward-attributable capital expenditure, used by ward intelligence. */
export function wardBudgetPosition(wardId: string): { allocatedCrore: number; spentCrore: number; utilisationPct: number } {
  const projects = wardProjects(wardId)
  const allocated = projects.reduce((s, p) => s + p.sanctionedCostCrore, 0)
  const spent = projects.reduce((s, p) => s + p.paidCrore, 0)
  return {
    allocatedCrore: Math.round(allocated * 10) / 10,
    spentCrore: Math.round(spent * 10) / 10,
    utilisationPct: allocated > 0 ? Math.round((spent / allocated) * 1000) / 10 : 0,
  }
}

/** Wards ordered by capital exposure - used by executive drilldowns. */
export let WARDS_BY_CAPITAL_EXPOSURE: Array<{ ward: Ward; exposure: number }> = []

export function projectsAtRisk(threshold = 60): Project[] {
  return PROJECTS.filter((p) => p.riskScore >= threshold && p.status !== 'completed' && p.status !== 'closed').sort(
    (a, b) => b.riskScore - a.riskScore,
  )
}

export function contractsAtRisk(threshold = 55): Contract[] {
  return CONTRACTS.filter((c) => c.riskScore >= threshold).sort((a, b) => b.riskScore - a.riskScore)
}

export function wardById(id: string) {
  return WARD_BY_ID.get(id)
}

/**
 * Rebuild order matters: projects draw from the contractor roster, contracts
 * draw from projects, and ward capital exposure is an aggregate over projects.
 * This is the same order the collections were declared in before the layer
 * became switchable.
 */
registerLayer(() => {
  CONTRACTORS = buildContractors()
  CONTRACTOR_BY_ID = new Map(CONTRACTORS.map((c) => [c.id, c]))

  PROJECTS = buildProjects()
  PROJECT_BY_ID = new Map(PROJECTS.map((p) => [p.id, p]))

  CONTRACTS = buildContracts()
  CONTRACT_BY_ID = new Map(CONTRACTS.map((c) => [c.id, c]))

  BUDGET_LINES = buildBudgetLines()
  REVENUE_RECORDS = buildRevenueRecords()
  PROPERTY_SEGMENTS = buildPropertySegments()
  REVENUE_ANOMALIES = buildRevenueAnomalies()

  WARDS_BY_CAPITAL_EXPOSURE = [...WARDS]
    .map((w) => ({ ward: w, exposure: wardBudgetPosition(w.id).allocatedCrore }))
    .sort((a, b) => b.exposure - a.exposure)
})
