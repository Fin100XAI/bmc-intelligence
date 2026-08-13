import { TENANT_ID } from '@/config/municipality.config'
import type {
  CivicEngagementRecord,
  CivicParticipationPosition,
  EngagementStatus,
  EngagementTheme,
  EngagementType,
} from '@/types/civic-participation'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CORPORATION_SHORT_NAME } from './naming'
import { CITY_SCALE, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/civic-participation.data.ts
 *
 * Consultations, suggestions and public feedback the Corporation has run.
 * Aggregate submission counts only - see the type module for why.
 */

export let CIVIC_ENGAGEMENTS: CivicEngagementRecord[] = []
export let CIVIC_PARTICIPATION_POSITION: CivicParticipationPosition = {
  consultationsActive: 0,
  consultationsClosed12m: 0,
  totalSubmissions12m: 0,
  incorporatedSharePct: 0,
  meanResponseDays: 0,
}

interface EngagementSpec {
  subject: string
  summary: string
  type: EngagementType
  theme: EngagementTheme
  departmentId: string
}

function build$ENGAGEMENT_SPECS(): EngagementSpec[] {
  return [
    { subject: t('Draft Ward Infrastructure Priority List'), summary: t('Public comment invited on the proposed ranking of ward infrastructure works for the coming financial year.'), type: 'ward-sabha-feedback', theme: 'infrastructure', departmentId: 'dept-roads' },
    { subject: t('Pre-Budget Citizen Consultation'), summary: t('Suggestions invited on budget priorities ahead of the annual estimates.'), type: 'budget-consultation', theme: 'finance', departmentId: 'dept-finance' },
    { subject: t('Draft Solid Waste Segregation Bye-Law'), summary: t('Public comment invited on proposed amendments to source-segregation requirements.'), type: 'draft-policy-comment', theme: 'environment', departmentId: 'dept-solid-waste' },
    { subject: t('Garden & Open Space Improvement Suggestions'), summary: t('Ongoing citizen suggestion scheme for garden and open-space improvement proposals.'), type: 'citizen-suggestion-scheme', theme: 'environment', departmentId: 'dept-gardens' },
    { subject: t('Draft Street Vendor Zone Demarcation'), summary: t('Public consultation on proposed vending-zone boundaries under the Street Vendors Act.'), type: 'public-consultation', theme: 'planning', departmentId: 'dept-licence' },
    { subject: t('Accessibility Audit Public Feedback'), summary: t('Feedback invited on accessibility barriers at municipal facilities ahead of the next audit cycle.'), type: 'public-consultation', theme: 'social-welfare', departmentId: 'dept-health' },
    { subject: t('Draft Development Plan Amendment - Reservation Review'), summary: t('Statutory public comment period on a proposed Development Plan reservation amendment.'), type: 'draft-policy-comment', theme: 'planning', departmentId: 'dept-planning' },
    { subject: t('Road Safety Suggestion Scheme'), summary: t('Ongoing suggestion scheme for junction and school-zone road-safety improvements.'), type: 'citizen-suggestion-scheme', theme: 'safety', departmentId: 'dept-roads' },
  ]
}
let ENGAGEMENT_SPECS: EngagementSpec[] = build$ENGAGEMENT_SPECS()
registerLayer(() => {
  ENGAGEMENT_SPECS = build$ENGAGEMENT_SPECS()
})

registerLayer(() => {
  const prefix = CORPORATION_SHORT_NAME.replace(/[^A-Za-z]/g, '').toUpperCase() || 'MC'
  const scale = CITY_SCALE

  const count = scaledCount(30, scale.population, 10)
  CIVIC_ENGAGEMENTS = Array.from({ length: count }, (_, i) => {
    const r = det(`civicpart:${i}`)
    const spec = ENGAGEMENT_SPECS[i % ENGAGEMENT_SPECS.length]!
    const openedDaysAgo = r.int(5, 400)
    const status = r.weighted([
      ['open', 3], ['under-review', 3], ['incorporated', 4], ['noted-not-incorporated', 2], ['closed', 2],
    ] as const) as EngagementStatus
    const closed = status !== 'open'
    const submissions = scaledCount(r.int(40, 3200), scale.population, 15)
    const respondDays = r.int(10, 90)

    return {
      id: `cve-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      reference: `${prefix}/ENGAGE/${2025 + (openedDaysAgo > 365 ? 0 : 1)}/${String(i + 41).padStart(4, '0')}`,
      type: spec.type,
      theme: spec.theme,
      subject: spec.subject,
      summary: spec.summary,
      wardIds: r.chance(0.4) ? r.sample(WARDS, r.int(1, 3)).map((w) => w.id) : [],
      departmentId: spec.departmentId,
      openedAt: isoDaysFromAnchor(-openedDaysAgo),
      closesAt: !closed ? isoDaysFromAnchor(r.int(3, 45)) : isoDaysFromAnchor(-openedDaysAgo + r.int(14, 60)),
      submissionsReceived: submissions,
      status,
      respondedAt: status === 'incorporated' || status === 'noted-not-incorporated' || status === 'closed'
        ? isoDaysFromAnchor(-openedDaysAgo + respondDays) : undefined,
      outcomeNote: status === 'incorporated'
        ? t('Feedback themes reflected in the revised proposal placed before the competent authority.')
        : status === 'noted-not-incorporated'
          ? t('Feedback recorded on file; the proposal proceeded on statutory or technical grounds unchanged.')
          : undefined,
      classification: 'public',
    }
  })

  const yearStart = isoDaysFromAnchor(-365)
  const recent = CIVIC_ENGAGEMENTS.filter((e) => e.openedAt >= yearStart)
  const decided = CIVIC_ENGAGEMENTS.filter((e) => e.status === 'incorporated' || e.status === 'noted-not-incorporated')
  const incorporated = CIVIC_ENGAGEMENTS.filter((e) => e.status === 'incorporated')
  const respondedRows = CIVIC_ENGAGEMENTS.filter((e) => e.respondedAt)

  CIVIC_PARTICIPATION_POSITION = {
    consultationsActive: CIVIC_ENGAGEMENTS.filter((e) => e.status === 'open' || e.status === 'under-review').length,
    consultationsClosed12m: recent.filter((e) => e.status !== 'open').length,
    totalSubmissions12m: recent.reduce((s, e) => s + e.submissionsReceived, 0),
    incorporatedSharePct: decided.length > 0 ? Math.round((incorporated.length / decided.length) * 1000) / 10 : 0,
    meanResponseDays: respondedRows.length
      ? Math.round(respondedRows.reduce((s, e) => {
          const opened = new Date(e.openedAt).getTime()
          const responded = new Date(e.respondedAt!).getTime()
          return s + Math.max(0, (responded - opened) / 86_400_000)
        }, 0) / respondedRows.length)
      : 0,
  }
})
