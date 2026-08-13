import { TENANT_ID } from '@/config/municipality.config'
import type {
  ArbitrationDisputeType,
  ArbitrationMatter,
  ArbitrationStage,
  CaseStatus,
  CaseType,
  CorporationRole,
  CourtForum,
  LegalCase,
  LegalPosition,
  RtiApplication,
  RtiStatus,
} from '@/types/legal'
import { DEMO_NOW, det, isoDaysFromAnchor } from '@/utils/deterministic'
import { FINANCIAL_YEAR_START, WARDS } from './reference'
import { CORPORATION_SHORT_NAME, landmarkName, localityFor } from './naming'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/legal.data.ts
 *
 * The Law Department's own docket. See `src/types/legal.ts` for why this is
 * shaped differently from every other register in the platform: the
 * Corporation is usually the RESPONDENT here, not the initiating party.
 *
 * Two matters of record grounded this module rather than leaving it a plain
 * template: the Bombay High Court's 2019 quashal of the Coastal Road CRZ
 * clearance (stayed by the Supreme Court the same year, allowing works to
 * continue while the appeal was heard) and the Supreme Court's 2023 rejection
 * of the Corporation's review petition on the capital-value property tax
 * system, which required rework and refund of tax collected between 2010 and
 * 2012. Both are cited in this file's case templates below as the kind of
 * matter this register exists to carry - not reproduced as live case data,
 * which this demonstration environment does not hold.
 */

/* ==========================================================================
   Live bindings
   ========================================================================== */

export let LEGAL_CASES: LegalCase[] = []
export let RTI_APPLICATIONS: RtiApplication[] = []
export let ARBITRATION_MATTERS: ArbitrationMatter[] = []
export let LEGAL_POSITION: LegalPosition = {
  casesActive: 0,
  casesFiledYtd: 0,
  casesDisposedYtd: 0,
  favourableSharePct: 0,
  financialExposureCrore: 0,
  rtiPending: 0,
  rtiOverdue: 0,
  rtiSecondAppeals: 0,
  arbitrationActive: 0,
  arbitrationExposureCrore: 0,
  arbitrationOverdue: 0,
}

/* ==========================================================================
   Vocabulary
   ========================================================================== */

interface CaseSpec {
  subject: string
  summary: string
  caseType: CaseType
  court: CourtForum
  domain: string
  departmentId: string
}

function build$CASE_SPECS(): CaseSpec[] {
  return [
    {
      subject: t('Coastal Road Project - CRZ Clearance Challenge'),
      summary: t('Environmental clearance for the coastal protection works under the Coastal Regulation Zone notification, challenged by a residents’ and fishing-community association.'),
      caseType: 'writ-petition', court: 'bombay-high-court', domain: 'coastal', departmentId: 'dept-coastal',
    },
    {
      subject: t('Capital Value Property Tax System - Reassessment Appeal'),
      summary: t('Challenge to the capital-value basis of property tax assessment and the demand raised under it, carried through appeal.'),
      caseType: 'civil-appeal', court: 'supreme-court', domain: 'revenue', departmentId: 'dept-assessment',
    },
    {
      subject: t('Road Pothole Repair Compliance'),
      summary: t('Public interest petition seeking time-bound repair of road defects and periodic compliance reporting to the court.'),
      caseType: 'pil', court: 'bombay-high-court', domain: 'roads', departmentId: 'dept-roads',
    },
    {
      subject: t('Corporation Election Nomination Rejection'),
      summary: t('Challenge to the rejection of nomination papers filed for election to the Corporation, on grounds of procedural non-compliance.'),
      caseType: 'pil', court: 'bombay-high-court', domain: 'council', departmentId: 'dept-secretary',
    },
    {
      subject: t('Solid Waste Processing Facility - Environmental Compliance'),
      summary: t('Direction sought for closure or remediation of a solid waste processing facility on grounds of environmental non-compliance.'),
      caseType: 'writ-petition', court: 'ngt', domain: 'waste', departmentId: 'dept-solid-waste',
    },
    {
      subject: t('Slum Rehabilitation Scheme - Eviction Challenge'),
      summary: t('Challenge to eviction notices issued in connection with a rehousing scheme, pending demonstration of alternate accommodation.'),
      caseType: 'writ-petition', court: 'bombay-high-court', domain: 'housing', departmentId: 'dept-housing',
    },
    {
      subject: t('Contractor Blacklisting Order Challenge'),
      summary: t('Challenge to a debarment order issued against a contracting firm following delivery failure on a municipal contract.'),
      caseType: 'writ-petition', court: 'bombay-high-court', domain: 'procurement', departmentId: 'dept-procurement',
    },
    {
      subject: t('Trade Licence Refusal Appeal'),
      summary: t('Appeal against refusal to renew a trade licence on grounds of a hygiene inspection finding.'),
      caseType: 'civil-appeal', court: 'city-civil-court', domain: 'licensing', departmentId: 'dept-licence',
    },
    {
      subject: t('Property Tax Overcharge - Consumer Complaint'),
      summary: t('Consumer complaint alleging an overcharge in the annual property tax demand against the assessment actually applicable.'),
      caseType: 'consumer-complaint', court: 'consumer-forum', domain: 'revenue', departmentId: 'dept-assessment',
    },
    {
      subject: t('Structural Audit Demolition Notice Challenge'),
      summary: t('Challenge to a demolition order issued against a structure classified in the most hazardous dilapidation category.'),
      caseType: 'writ-petition', court: 'bombay-high-court', domain: 'buildings', departmentId: 'dept-building',
    },
    {
      subject: t('Municipal Service Seniority Dispute'),
      summary: t('Departmental seniority and promotion-eligibility dispute raised by a member of the municipal establishment.'),
      caseType: 'service-matter', court: 'city-civil-court', domain: 'workforce', departmentId: 'dept-personnel',
    },
    {
      subject: t('Road Widening - Land Acquisition Compensation'),
      summary: t('Dispute over the compensation payable for land acquired for a road-widening scheme under the applicable acquisition rules.'),
      caseType: 'land-acquisition-dispute', court: 'city-civil-court', domain: 'roads', departmentId: 'dept-roads',
    },
    {
      subject: t('Redevelopment Project Delay - Allottee Complaint'),
      summary: t('Complaint concerning delay in a redevelopment project executed on Corporation-facilitated land, naming the Corporation as a necessary party.'),
      caseType: 'consumer-complaint', court: 'maharera', domain: 'housing', departmentId: 'dept-housing',
    },
  ]
}
let CASE_SPECS: CaseSpec[] = build$CASE_SPECS()
registerLayer(() => {
  CASE_SPECS = build$CASE_SPECS()
})

function build$RTI_SUBJECT_CATEGORIES(): string[] {
  return [
    t('Property tax assessment records'),
    t('Building proposal file status'),
    t('Road contract tender documents'),
    t('Solid waste contractor payment details'),
    t('Encroachment action status'),
    t('Recruitment and promotion records'),
    t('Ward development fund utilisation'),
    t('Water supply connection records'),
    t('Council resolution implementation status'),
    t('Budget allocation and expenditure details'),
    t('Trade licence issue records'),
    t('Structural audit reports'),
  ]
}
let RTI_SUBJECT_CATEGORIES: string[] = build$RTI_SUBJECT_CATEGORIES()
registerLayer(() => {
  RTI_SUBJECT_CATEGORIES = build$RTI_SUBJECT_CATEGORIES()
})

interface ArbitrationSpec {
  disputeType: ArbitrationDisputeType
  departmentId: string
  contractKind: string
}

const ARBITRATION_SPECS: ArbitrationSpec[] = [
  { disputeType: 'payment-dispute', departmentId: 'dept-roads', contractKind: 'Road Resurfacing' },
  { disputeType: 'extension-of-time', departmentId: 'dept-stormwater', contractKind: 'Nallah Desilting' },
  { disputeType: 'liquidated-damages', departmentId: 'dept-hydraulic', contractKind: 'Water Distribution Network' },
  { disputeType: 'quality-dispute', departmentId: 'dept-solid-waste', contractKind: 'Waste Processing Facility' },
  { disputeType: 'termination', departmentId: 'dept-building', contractKind: 'School Building Construction' },
  { disputeType: 'payment-dispute', departmentId: 'dept-sewerage', contractKind: 'Sewage Treatment Upgrade' },
  { disputeType: 'extension-of-time', departmentId: 'dept-projects', contractKind: 'Bridge Reconstruction' },
]

/* ==========================================================================
   Rebuild
   ========================================================================== */

registerLayer(() => {
  const prefix = CORPORATION_SHORT_NAME.replace(/[^A-Za-z]/g, '').toUpperCase() || 'MC'
  const scale = CITY_SCALE

  /* --------------------------------------------------------------- Cases */

  const caseCount = scaledCount(36, scale.population, 8)
  LEGAL_CASES = Array.from({ length: caseCount }, (_, i) => {
    const r = det(`legalcase:${i}`)
    const spec = CASE_SPECS[i % CASE_SPECS.length]!
    const corporationRole: CorporationRole = r.weighted([
      ['respondent', 8], ['appellant', 2], ['petitioner', 1], ['intervenor', 1],
    ] as const)
    const status = r.weighted([
      ['pending-hearing', 5], ['interim-order', 3], ['stayed', 2],
      ['filed', 2], ['disposed-favourable', 3], ['disposed-adverse', 1], ['remanded', 1],
    ] as const) as CaseStatus
    const filedDaysAgo = r.int(30, 1650)
    const disposed = status === 'disposed-favourable' || status === 'disposed-adverse' || status === 'remanded'
    const wardIds = r.chance(0.5) ? r.sample(WARDS, r.int(1, 2)).map((w) => w.id) : []

    return {
      id: `lgc-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/LAW/${spec.court === 'supreme-court' ? 'SC' : spec.court === 'bombay-high-court' ? 'HC' : 'CC'}/${2020 + r.int(0, 6)}/${String(i + 41).padStart(4, '0')}`,
      caseType: spec.caseType,
      court: spec.court,
      corporationRole,
      subject: `${spec.subject}${i >= CASE_SPECS.length ? ` – ${landmarkName(`legalcase:${i}`, t('Matter'))}` : ''}`,
      summary: spec.summary,
      domain: spec.domain,
      wardIds,
      departmentId: spec.departmentId,
      opposingParty: r.pick([
        t('Resident welfare association'), t('Contracting firm'), t('Individual property owner'),
        t('Registered society'), t('Trade association'), t('State government department'),
      ]),
      filedAt: isoDaysFromAnchor(-filedDaysAgo),
      lastHearingAt: disposed ? undefined : isoDaysFromAnchor(-r.int(2, 90)),
      nextHearingAt: disposed ? undefined : isoDaysFromAnchor(r.int(3, 120)),
      status,
      financialExposureCrore: r.chance(0.62) ? scaled(r.int(2, 480), scale.budget, 0.1) : undefined,
      counselAssigned: r.pick([
        t('In-house - Law Department'), t('Panel Counsel - Civil'), t('Panel Counsel - Constitutional'), t('Senior Counsel Briefed'),
      ]),
      classification: 'confidential',
    }
  })

  /* ---------------------------------------------------------------- RTI */

  const rtiCount = scaledCount(140, scale.population, 18)
  RTI_APPLICATIONS = Array.from({ length: rtiCount }, (_, i) => {
    const r = det(`rti:${i}`)
    const daysAgo = r.int(1, 340)
    const status = r.weighted([
      ['responded', 9], ['pending', 3], ['first-appeal', 2], ['second-appeal', 1], ['closed', 6],
    ] as const) as RtiStatus
    const dueAt = isoDaysFromAnchor(-daysAgo + 30)
    const respondedDays = r.int(4, 55)
    const breached = status === 'pending' ? daysAgo > 30 : status !== 'responded' && status !== 'closed' ? true : respondedDays > 30

    return {
      id: `rti-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/RTI/${2025 + (daysAgo > 365 ? 0 : 1)}/${String(i + 118).padStart(4, '0')}`,
      subjectCategory: r.pick(RTI_SUBJECT_CATEGORIES),
      departmentId: CASE_SPECS[i % CASE_SPECS.length]!.departmentId,
      wardId: r.chance(0.4) ? r.pick(WARDS).id : undefined,
      receivedAt: isoDaysFromAnchor(-daysAgo),
      dueAt,
      status,
      respondedAt: status === 'responded' || status === 'closed' || status === 'first-appeal' || status === 'second-appeal'
        ? isoDaysFromAnchor(-daysAgo + respondedDays) : undefined,
      firstAppealFiledAt: status === 'first-appeal' || status === 'second-appeal' ? isoDaysFromAnchor(-daysAgo + respondedDays + r.int(2, 25)) : undefined,
      firstAppealDecidedAt: status === 'second-appeal' ? isoDaysFromAnchor(-daysAgo + respondedDays + r.int(30, 55)) : undefined,
      secondAppealFiledAt: status === 'second-appeal' ? isoDaysFromAnchor(-daysAgo + respondedDays + r.int(56, 90)) : undefined,
      breached,
      classification: 'internal',
    }
  })

  /* ---------------------------------------------------------- Arbitration */

  const arbCount = scaledCount(16, scale.budget, 4)
  ARBITRATION_MATTERS = Array.from({ length: arbCount }, (_, i) => {
    const r = det(`arbitration:${i}`)
    const spec = ARBITRATION_SPECS[i % ARBITRATION_SPECS.length]!
    const stage = r.weighted([
      ['notice-invoked', 2], ['tribunal-constituted', 3], ['pleadings', 3],
      ['hearings', 4], ['award-reserved', 1], ['award-passed', 3], ['award-challenged', 1],
    ] as const) as ArbitrationStage
    const invokedDaysAgo = r.int(60, 1100)
    const pleadingsClosed = stage === 'hearings' || stage === 'award-reserved' || stage === 'award-passed' || stage === 'award-challenged'
    const pleadingsClosedDaysAgo = pleadingsClosed ? r.int(30, Math.max(31, invokedDaysAgo - 60)) : undefined
    const extensionGranted = pleadingsClosed ? r.chance(0.35) : false
    const claimed = scaled(r.int(4, 220), scale.budget, 0.3)
    const status: ArbitrationMatter['status'] = stage === 'award-passed' ? 'awarded' : stage === 'award-challenged' ? 'award-challenged' : 'active'

    return {
      id: `arb-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/ARB/${2021 + r.int(0, 5)}/${String(i + 27).padStart(3, '0')}`,
      contractReference: `${prefix}/CNT/${2019 + r.int(0, 6)}/${String(r.int(11, 940)).padStart(4, '0')}`,
      contractorName: t(
        '{0} {1}',
        localityFor(`arb:${i}`),
        spec.contractKind.includes('Building') ? t('Builders Pvt. Ltd.') : t('Infrastructure Pvt. Ltd.'),
      ),
      disputeType: spec.disputeType,
      stage,
      departmentId: spec.departmentId,
      wardIds: r.chance(0.5) ? r.sample(WARDS, r.int(1, 2)).map((w) => w.id) : [],
      claimedCrore: claimed,
      counterClaimCrore: r.chance(0.3) ? Math.round(claimed * r.float(0.2, 0.6) * 10) / 10 : undefined,
      awardAmountCrore: stage === 'award-passed' || stage === 'award-challenged' ? Math.round(claimed * r.float(0.15, 0.7) * 10) / 10 : undefined,
      invokedAt: isoDaysFromAnchor(-invokedDaysAgo),
      pleadingsClosedAt: pleadingsClosedDaysAgo !== undefined ? isoDaysFromAnchor(-pleadingsClosedDaysAgo) : undefined,
      awardDueBy: pleadingsClosedDaysAgo !== undefined
        ? isoDaysFromAnchor(-pleadingsClosedDaysAgo + (extensionGranted ? 548 : 365))
        : undefined,
      extensionGranted,
      status,
      classification: 'confidential',
    }
  })

  /* --------------------------------------------------------------- Roll-up */

  const activeCases = LEGAL_CASES.filter((c) => !c.status.startsWith('disposed') && c.status !== 'remanded')
  const disposedCases = LEGAL_CASES.filter((c) => c.status.startsWith('disposed'))
  const favourable = LEGAL_CASES.filter((c) => c.status === 'disposed-favourable').length
  const ytdStart = FINANCIAL_YEAR_START

  // Deliberately a subset of `rtiPending`, not of every application ever
  // breached (which would also count first/second appeals whose original
  // response ran late but has since moved on) - the headline figure a PIO
  // needs is applications STILL awaiting a response past the statutory
  // deadline, not the full history of lateness.
  const rtiOverdue = RTI_APPLICATIONS.filter((a) => a.status === 'pending' && a.breached).length
  const rtiSecondAppeals = RTI_APPLICATIONS.filter((a) => a.status === 'second-appeal').length

  const arbActive = ARBITRATION_MATTERS.filter((a) => a.status === 'active')
  const arbOverdue = arbActive.filter(
    (a) => a.awardDueBy && new Date(a.awardDueBy).getTime() < DEMO_NOW.getTime() && !a.extensionGranted,
  ).length

  LEGAL_POSITION = {
    casesActive: activeCases.length,
    casesFiledYtd: LEGAL_CASES.filter((c) => c.filedAt >= ytdStart).length,
    casesDisposedYtd: disposedCases.filter((c) => c.filedAt >= ytdStart).length,
    favourableSharePct: disposedCases.length > 0 ? Math.round((favourable / disposedCases.length) * 1000) / 10 : 0,
    financialExposureCrore: Math.round(activeCases.reduce((s, c) => s + (c.financialExposureCrore ?? 0), 0) * 10) / 10,
    rtiPending: RTI_APPLICATIONS.filter((a) => a.status === 'pending').length,
    rtiOverdue,
    rtiSecondAppeals,
    arbitrationActive: arbActive.length,
    arbitrationExposureCrore: Math.round(arbActive.reduce((s, a) => s + a.claimedCrore, 0) * 10) / 10,
    arbitrationOverdue: arbOverdue,
  }
})
