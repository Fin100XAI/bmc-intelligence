import type { DataClassification, IsoDateTime, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/civic-participation.ts
 *
 * Consultations, suggestions and public feedback the Corporation has
 * invited or received - engagement the administration ran, not a record of
 * who took part in it.
 *
 * The platform holds a submission COUNT against each engagement, never a
 * submission's text or the identity of who made it. A civic-participation
 * register that let an officer read what a named resident wrote would be
 * building exactly the citizen-profiling capability every other register in
 * this platform refuses to hold, and this one refuses it the same way.
 */

export type EngagementType =
  | 'public-consultation'
  | 'citizen-suggestion-scheme'
  | 'ward-sabha-feedback'
  | 'draft-policy-comment'
  | 'budget-consultation'

function build$ENGAGEMENT_TYPE_LABEL(): Record<EngagementType, string> {
  return {
  'public-consultation': t('Public Consultation'),
  'citizen-suggestion-scheme': t('Citizen Suggestion Scheme'),
  'ward-sabha-feedback': t('Ward Sabha Feedback'),
  'draft-policy-comment': t('Draft Policy - Public Comment'),
  'budget-consultation': t('Pre-Budget Consultation'),
}
}
export let ENGAGEMENT_TYPE_LABEL: Record<EngagementType, string> = build$ENGAGEMENT_TYPE_LABEL()
registerLayer(() => {
  ENGAGEMENT_TYPE_LABEL = build$ENGAGEMENT_TYPE_LABEL()
})

export type EngagementTheme = 'infrastructure' | 'environment' | 'planning' | 'health' | 'safety' | 'social-welfare' | 'finance' | 'other'

function build$ENGAGEMENT_THEME_LABEL(): Record<EngagementTheme, string> {
  return {
  infrastructure: t('Infrastructure & Services'),
  environment: t('Environment'),
  planning: t('Planning & Development'),
  health: t('Public Health'),
  safety: t('Safety & Enforcement'),
  'social-welfare': t('Social Welfare'),
  finance: t('Budget & Finance'),
  other: t('Other'),
}
}
export let ENGAGEMENT_THEME_LABEL: Record<EngagementTheme, string> = build$ENGAGEMENT_THEME_LABEL()
registerLayer(() => {
  ENGAGEMENT_THEME_LABEL = build$ENGAGEMENT_THEME_LABEL()
})

export type EngagementStatus = 'open' | 'under-review' | 'incorporated' | 'noted-not-incorporated' | 'closed'

function build$ENGAGEMENT_STATUS_LABEL(): Record<EngagementStatus, string> {
  return {
  open: t('Open for Submissions'),
  'under-review': t('Under Review'),
  incorporated: t('Incorporated into Decision'),
  'noted-not-incorporated': t('Noted - Not Incorporated'),
  closed: t('Closed'),
}
}
export let ENGAGEMENT_STATUS_LABEL: Record<EngagementStatus, string> = build$ENGAGEMENT_STATUS_LABEL()
registerLayer(() => {
  ENGAGEMENT_STATUS_LABEL = build$ENGAGEMENT_STATUS_LABEL()
})

export interface CivicEngagementRecord {
  id: string
  tenantId: TenantId
  reference: string
  type: EngagementType
  theme: EngagementTheme
  subject: string
  summary: string
  wardIds: string[]
  departmentId: string
  openedAt: IsoDateTime
  closesAt?: IsoDateTime
  /** Aggregate count of submissions received - never their content or authorship. */
  submissionsReceived: number
  status: EngagementStatus
  respondedAt?: IsoDateTime
  /** What the administration did with the feedback, in institutional terms. */
  outcomeNote?: string
  classification: DataClassification
}

export interface CivicParticipationPosition {
  consultationsActive: number
  consultationsClosed12m: number
  totalSubmissions12m: number
  incorporatedSharePct: number
  meanResponseDays: number
}
