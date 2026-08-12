import type { IntelligenceDomain, Severity } from '@/types/common'
import type { AIResponse, AIUseCase } from '@/types/ai'
import type { User } from '@/types/organisation'
import type { MonsoonScenarioInput, MonsoonScenarioResult } from '@/types/city-domains'
import type { DecisionCase, Incident } from '@/types/operations'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * AI provider abstraction.
 *
 * The interface is the contract every present and future provider satisfies -
 * the local demonstration provider today, and an approved sovereign, on-premise
 * or hosted model behind a governed AI gateway later. No presentation component
 * ever contains AI logic; components consume `AIResponse` only.
 */

export interface AIRequestContext {
  /** The requesting principal - determines retrieval scope and permitted use. */
  user: User
  /** Ward scope in effect at the point of request. */
  wardIds?: string[]
  /** Department scope in effect at the point of request. */
  departmentIds?: string[]
  /** Domains the request concerns. */
  domains?: IntelligenceDomain[]
  /** Free-text question for query use cases. */
  question?: string
}

export interface ExecutiveBriefSection {
  id: string
  heading: string
  body: string
  bullets: string[]
  severity: Severity
  /** Evidence identifiers backing this section. */
  evidenceIds: string[]
  domains: IntelligenceDomain[]
}

export interface ExecutiveBrief {
  id: string
  title: string
  generatedAt: string
  generatedForRole: string
  scopeLabel: string
  sections: ExecutiveBriefSection[]
  confidence: AIResponse['confidence']
  dataFreshnessLabel: string
  modelId: string
  limitations: string[]
}

export interface RiskAnalysisResult {
  response: AIResponse
  ranked: Array<{
    id: string
    title: string
    severity: Severity
    confidence: AIResponse['confidence']
    driver: string
    wardIds: string[]
    domain: IntelligenceDomain
    evidenceIds: string[]
  }>
}

export interface MetricExplanation {
  response: AIResponse
  metricLabel: string
  computation: string
  inputs: Array<{ label: string; source: string; contribution: string }>
  lineageId: string
}

/** The provider contract. Implementations must never perform an action. */
export interface AIProvider {
  readonly id: string
  readonly displayName: string
  readonly modelId: string

  generateExecutiveBrief(ctx: AIRequestContext): Promise<ExecutiveBrief>
  analyseRisk(ctx: AIRequestContext, domain?: IntelligenceDomain): Promise<RiskAnalysisResult>
  explainMetric(ctx: AIRequestContext, metricId: string): Promise<MetricExplanation>
  answerMunicipalQuery(ctx: AIRequestContext, question: string): Promise<AIResponse>
  recommendActions(ctx: AIRequestContext, subject: string): Promise<AIResponse>
  summariseIncident(ctx: AIRequestContext, incident: Incident): Promise<AIResponse>
  generateDecisionOptions(ctx: AIRequestContext, decisionCase: DecisionCase): Promise<AIResponse>
  interpretScenario(
    ctx: AIRequestContext,
    inputs: MonsoonScenarioInput,
    result: MonsoonScenarioResult,
  ): Promise<AIResponse>
}

/**
 * Actions the AI layer is prohibited from performing, enforced at the gateway
 * before a request reaches any model. Presence of these intents in a request
 * results in a blocked request recorded against the AI governance record.
 */
function build$PROHIBITED_INTENTS(): ReadonlyArray<{ pattern: RegExp; label: string }> {
  return [
  { pattern: /\b(approve|sanction|release|authorise|authorize)\b.{0,40}\b(payment|expenditure|bill|invoice|fund)/i, label: t('Approve or sanction expenditure or payment') },
  { pattern: /\b(award|approve)\b.{0,30}\b(tender|contract|procurement)/i, label: t('Approve a procurement award') },
  { pattern: /\b(impose|levy|apply)\b.{0,30}\b(penalty|fine|recovery)/i, label: t('Impose a penalty or recovery') },
  { pattern: /\b(reject|deny|cancel)\b.{0,40}\b(eligibility|application|entitlement|citizen)/i, label: t('Reject citizen eligibility') },
  { pattern: /\b(issue|draft)\b.{0,30}\b(order|notice|circular)\b.{0,20}\b(final|official)/i, label: t('Issue an official order') },
  { pattern: /\b(amend|modify|update|correct)\b.{0,30}\b(official record|assessment record|register entry)/i, label: t('Amend an official record') },
  { pattern: /\b(fraud|corrupt|corruption|embezzl|guilty|culpable)\b/i, label: t('Characterise conduct as wrongdoing') },
]
}
export let PROHIBITED_INTENTS: ReadonlyArray<{ pattern: RegExp; label: string }> = build$PROHIBITED_INTENTS()
registerLayer(() => {
  PROHIBITED_INTENTS = build$PROHIBITED_INTENTS()
})

export interface GatewayDecision {
  permitted: boolean
  blockedReason?: string
  blockedIntent?: string
}

/**
 * Gateway policy check applied before any request reaches a provider.
 * This is the technical enforcement of the human-in-the-loop principle.
 */
export function evaluateGatewayPolicy(prompt: string): GatewayDecision {
  for (const intent of PROHIBITED_INTENTS) {
    if (intent.pattern.test(prompt)) {
      return {
        permitted: false,
        blockedIntent: intent.label,
        blockedReason:
          `This request was blocked before reaching any model. "${intent.label}" is reserved to human authority ` +
          'and cannot be performed, recommended as a completed act, or characterised by the AI layer. ' +
          'The platform can analyse, summarise and recommend for a named officer to decide.',
      }
    }
  }
  return { permitted: true }
}

/** Use cases that always require a recorded human review before action. */
export const HUMAN_REVIEW_REQUIRED: AIUseCase[] = [
  'action-recommendation',
  'decision-options',
  'anomaly-narrative',
]
