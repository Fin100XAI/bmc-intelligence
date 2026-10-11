/**
 * src/domains/public-money/model.ts
 *
 * Public money and project portfolio - see
 * `docs/architecture/08-decision-intelligence.md` §4.
 *
 * The money concepts are deliberately separate fields. A budget allocation, a
 * project cost, a sanctioned cost, a tender value, a contract value and actual
 * expenditure are different accounting facts; they are never summed across
 * kinds, and a project carries only the ones a source actually states.
 */

export type Sector =
  | 'water'
  | 'sewerage'
  | 'drainage'
  | 'flood'
  | 'roads'
  | 'transport'
  | 'waste'
  | 'housing'
  | 'water-body'
  | 'other'

/** How precisely a project's location is known (spec §94). */
export type GeoLevel = 'EXACT_ASSET' | 'CORRIDOR' | 'LOCALITY' | 'WARD' | 'CITY' | 'UNKNOWN'

export type MoneyKind =
  | 'budgetAllocation'
  | 'projectCost'
  | 'sanctionedCost'
  | 'tenderValue'
  | 'contractValue'
  | 'actualExpenditure'

export interface MoneyFact {
  /** Rupees crore. */
  crore: number
  evidenceId: string
}

/** A published status, with the date it was published - status age matters. */
export interface PublishedStatus {
  text: string
  /** ISO date the status was published by its source. */
  asOf: string
  evidenceId: string
}

export interface PublicProject {
  id: string
  name: string
  sector: Sector
  scheme: string
  agency: string
  /** Where the work stands, as the newest source says. Completed works raise no coordination or milestone case. */
  phase?: 'proposed' | 'sanctioned' | 'tendering' | 'ongoing' | 'completed'
  money: Partial<Record<MoneyKind, MoneyFact>>
  status: PublishedStatus | null
  /** Physical progress, percent, where a source states it. */
  progressPct?: { value: number; evidenceId: string }
  scheduledCompletion?: { date: string; evidenceId: string }
  revisedCompletion?: { date: string; evidenceId: string }
  /** Implementation window used by the coordination engine (ISO dates). */
  window?: { start: string; end: string; basis: 'published' | 'inferred-from-status' }
  location: {
    level: GeoLevel
    /** As published - a road, canal stretch, locality or "city-wide". */
    description: string
    /** Named corridors and localities the project touches, for overlap detection. */
    corridors: string[]
    localities: string[]
    /** Representative point; absent when the level is CITY or UNKNOWN. */
    point?: { lat: number; lon: number; geocodedName: string }
    /** For corridor-level projects, a polyline along the corridor. */
    line?: Array<[number, number]>
  }
  /** Departments that must be consulted before excavation or handover. */
  departments: string[]
  /** Critical infrastructure: water source, treatment, trunk sewer, flood defence. */
  critical: boolean
  /** Rough count of residents served or exposed, where published. */
  serviceExposure?: { people: number; evidenceId: string }
  evidenceIds: string[]
  lastVerified: string
}

export interface BudgetLine {
  id: string
  label: string
  crore: number
  /** e.g. "FY 2026-27". */
  period: string
  kind: 'opening-balance' | 'receipts-expected' | 'receipts-total' | 'expenditure-estimate' | 'revenue-collected'
  evidenceId: string
}

/** The largest money fact a project carries, for materiality - never a sum across kinds. */
export function headlineMoney(project: PublicProject): { kind: MoneyKind; fact: MoneyFact } | null {
  const order: MoneyKind[] = ['contractValue', 'sanctionedCost', 'projectCost', 'tenderValue', 'budgetAllocation', 'actualExpenditure']
  for (const kind of order) {
    const fact = project.money[kind]
    if (fact) return { kind, fact }
  }
  return null
}

/** A scheme an evidenced need could potentially draw on - "potential eligibility, verify". */
export interface SchemeMatch {
  name: string
  url: string
  /** Why the need could fit - stated as a possibility. */
  fit: string
  /** Documents a proposal typically needs; to be confirmed against current guidelines. */
  documents: string[]
}

/** An evidenced municipal need and the schemes it might draw on (spec §85). */
export interface FundingNeed {
  id: string
  need: string
  context: string
  evidenceIds: string[]
  projectIds: string[]
  department: string
  critical: boolean
  schemes: SchemeMatch[]
  /** What is not yet known. */
  missing: string[]
}
