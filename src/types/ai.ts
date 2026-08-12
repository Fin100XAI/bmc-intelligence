import type {
  ConfidenceLevel,
  DataClassification,
  IntelligenceDomain,
  IsoDateTime,
  NamedSeries,
  Severity,
  TenantId,
} from './common'
import type { RoleId } from './organisation'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/** ---------------------------------------------------------------------
 * Governed AI layer. AI analyses, recommends, forecasts, summarises,
 * detects, prioritises, simulates and explains. It never decides.
 * ------------------------------------------------------------------- */

export type AIUseCase =
  | 'executive-brief'
  | 'risk-analysis'
  | 'metric-explanation'
  | 'municipal-query'
  | 'action-recommendation'
  | 'incident-summary'
  | 'decision-options'
  | 'anomaly-narrative'
  | 'scenario-interpretation'

function build$AI_USE_CASE_LABEL(): Record<AIUseCase, string> {
  return {
  'executive-brief': t('Executive Brief'),
  'risk-analysis': t('Risk Analysis'),
  'metric-explanation': t('Metric Explanation'),
  'municipal-query': t('Municipal Query'),
  'action-recommendation': t('Action Recommendation'),
  'incident-summary': t('Incident Summary'),
  'decision-options': t('Decision Options'),
  'anomaly-narrative': t('Anomaly Narrative'),
  'scenario-interpretation': t('Scenario Interpretation'),
}
}
export let AI_USE_CASE_LABEL: Record<AIUseCase, string> = build$AI_USE_CASE_LABEL()
registerLayer(() => {
  AI_USE_CASE_LABEL = build$AI_USE_CASE_LABEL()
})

/** Distinguishes evidence-grounded output from general reasoning. */
export type GroundingMode = 'evidence-backed' | 'general-reasoning'

function build$GROUNDING_LABEL(): Record<GroundingMode, string> {
  return {
  'evidence-backed': t('Evidence-backed response'),
  'general-reasoning': t('General reasoning'),
}
}
export let GROUNDING_LABEL: Record<GroundingMode, string> = build$GROUNDING_LABEL()
registerLayer(() => {
  GROUNDING_LABEL = build$GROUNDING_LABEL()
})

export interface AICitation {
  id: string
  label: string
  /** Evidence, metric or record reference backing the statement. */
  reference: string
  sourceSystem: string
  observedAt: IsoDateTime
  evidenceId?: string
  classification: DataClassification
}

export interface AIRecommendationBlock {
  id: string
  title: string
  why: string
  evidenceRefs: string[]
  expectedImpact: string
  confidence: ConfidenceLevel
  dependencies: string[]
  risks: string[]
  humanOwnerRole: string
  departmentId: string
  /** Recommendations are never executed by the platform. */
  requiresHumanApproval: true
}

/**
 * What the retrieval layer understood a free-text question to be asking.
 *
 * This is stated to the operator rather than kept internal. An assistant that
 * silently answers a question adjacent to the one asked is worse than one that
 * declines: the operator has no way to notice. Publishing the resolved intent
 * and the entities it bound makes a misreading visible in one glance and gives
 * the operator a correction path.
 */
export type AIEntityKind =
  | 'ward'
  | 'zone'
  | 'department'
  | 'domain'
  | 'condition'
  | 'severity'
  | 'limit'
  | 'comparison'

export interface AIResolvedEntity {
  kind: AIEntityKind
  /** Platform identifier where the entity resolved to a record. */
  id?: string
  /** The label shown to the operator. */
  label: string
  /** The words in the question that produced this binding. */
  matchedText: string
}

export interface AIInterpretation {
  /** Stable identifier of the retrieval route that answered. */
  intentId: string
  intentLabel: string
  /** 0-100 strength of the intent match. Low values are stated, not hidden. */
  matchStrength: number
  /** The terms in the question that carried the match. */
  matchedTerms: string[]
  entities: AIResolvedEntity[]
  /** Set where the engine narrowed, widened or could not bind an entity. */
  note?: string
  /** Near-miss routes, offered so a misreading can be corrected in one click. */
  alternatives: Array<{ intentId: string; label: string; question: string }>
}

/**
 * A structured payload a renderer can draw. The AI layer computes the figures;
 * it never chooses colours, sizes or component names beyond the shape below,
 * so presentation stays entirely in the component layer.
 */
export type AIVisual =
  | {
      kind: 'metrics'
      id: string
      caption?: string
      items: Array<{
        label: string
        value: string
        support?: string
        tone?: 'default' | 'positive' | 'warn' | 'critical'
      }>
    }
  | {
      kind: 'ranked-bar'
      id: string
      caption: string
      unit: string
      /** Governs the colour ramp only - never the ordering, which is given. */
      higherIsBetter: boolean
      data: Array<{ label: string; value: number }>
    }
  | {
      kind: 'trend'
      id: string
      caption: string
      unit: string
      series: NamedSeries[]
    }
  | {
      kind: 'composition'
      id: string
      caption: string
      segments: Array<{ id: string; label: string; value: number; colour: string }>
    }
  | {
      kind: 'heatmap'
      id: string
      caption: string
      rows: Array<{ id: string; label: string }>
      columns: Array<{ id: string; label: string }>
      values: Record<string, Record<string, number>>
      higherIsBetter: boolean
    }

/** The canonical structure of every substantive Copilot answer. */
export interface AIResponse {
  id: string
  requestId: string
  useCase: AIUseCase
  /** Direct answer paragraph(s). */
  answer: string
  keyFindings: string[]
  evidence: AICitation[]
  confidence: ConfidenceLevel
  confidenceRationale: string
  recommendedActions: AIRecommendationBlock[]
  risksAndLimitations: string[]
  sources: string[]
  generatedAt: IsoDateTime
  dataFreshnessLabel: string
  grounding: GroundingMode
  modelId: string
  /** Structured payload for renderers that need tabular context. */
  supportingTable?: {
    caption: string
    columns: string[]
    rows: string[][]
  }
  /** Domains the answer touched, used for cross-domain badging. */
  domains: IntelligenceDomain[]
  /** How the question was read. Absent on responses raised without a question. */
  interpretation?: AIInterpretation
  /** Charts and metric groups computed alongside the prose. */
  visuals?: AIVisual[]
  /** Questions the retrieved position actually raises, not generic prompts. */
  followUps?: string[]
}

export interface AIRequestRecord {
  id: string
  tenantId: TenantId
  useCase: AIUseCase
  prompt: string
  promptTemplateId: string
  modelId: string
  provider: string
  requestedBy: string
  requestedByRole: RoleId
  requestedAt: IsoDateTime
  latencyMs: number
  confidence: ConfidenceLevel
  grounding: GroundingMode
  citationCount: number
  /** Human review posture for the produced output. */
  reviewStatus: 'not-required' | 'pending' | 'accepted' | 'modified' | 'rejected' | 'escalated'
  policyStatus: 'passed' | 'flagged' | 'blocked'
  policyNote?: string
  classification: DataClassification
  tokensIn: number
  tokensOut: number
  domains: IntelligenceDomain[]
}

export interface AIModel {
  id: string
  tenantId: TenantId
  name: string
  provider: string
  deployment: string
  environment: 'demonstration' | 'evaluation' | 'staging' | 'production'
  approvedUse: string[]
  restrictedUse: string[]
  riskClass: 'limited' | 'moderate' | 'high'
  ownerId: string
  version: string
  evaluationStatus: 'not-started' | 'in-progress' | 'passed' | 'failed' | 're-evaluation-due'
  lastEvaluatedAt: IsoDateTime
  status: 'active' | 'restricted' | 'retired' | 'pending-approval'
  /** Explicit note where the model is simulated in this environment. */
  notes: string
}

export interface PromptTemplate {
  id: string
  tenantId: TenantId
  useCase: AIUseCase
  title: string
  ownerId: string
  version: string
  approvalStatus: 'draft' | 'under-review' | 'approved' | 'withdrawn'
  riskClass: 'limited' | 'moderate' | 'high'
  lastModifiedAt: IsoDateTime
  /** Prompt body with variable placeholders - no secrets, ever. */
  body: string
  guardrails: string[]
  allowedRoles: RoleId[]
}

export type AIRiskCategory =
  | 'hallucination'
  | 'bias'
  | 'privacy'
  | 'data-leakage'
  | 'prompt-injection'
  | 'unsafe-recommendation'
  | 'excessive-automation'
  | 'model-drift'
  | 'explainability'
  | 'dependency'

function build$AI_RISK_LABEL(): Record<AIRiskCategory, string> {
  return {
  hallucination: t('Hallucination'),
  bias: t('Bias'),
  privacy: t('Privacy'),
  'data-leakage': t('Data Leakage'),
  'prompt-injection': t('Prompt Injection'),
  'unsafe-recommendation': t('Unsafe Recommendation'),
  'excessive-automation': t('Excessive Automation'),
  'model-drift': t('Model Drift'),
  explainability: t('Explainability'),
  dependency: t('Vendor / Model Dependency'),
}
}
export let AI_RISK_LABEL: Record<AIRiskCategory, string> = build$AI_RISK_LABEL()
registerLayer(() => {
  AI_RISK_LABEL = build$AI_RISK_LABEL()
})

export interface AIRiskEntry {
  id: string
  tenantId: TenantId
  category: AIRiskCategory
  description: string
  likelihood: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  inherentRating: Severity
  residualRating: Severity
  controls: string[]
  ownerId: string
  reviewDue: IsoDateTime
  status: 'open' | 'mitigated' | 'accepted' | 'monitoring'
}

export interface HumanOversightRecord {
  id: string
  tenantId: TenantId
  aiRequestId: string
  recommendationTitle: string
  useCase: AIUseCase
  submittedAt: IsoDateTime
  reviewerId?: string
  reviewedAt?: IsoDateTime
  outcome: 'pending' | 'accepted' | 'modified' | 'rejected' | 'escalated'
  modificationNote?: string
  domain: IntelligenceDomain
  severity: Severity
}

export interface AIIncident {
  id: string
  tenantId: TenantId
  reference: string
  title: string
  description: string
  category: AIRiskCategory
  severity: Severity
  detectedAt: IsoDateTime
  modelId: string
  status: 'detected' | 'triaged' | 'contained' | 'resolved' | 'reviewed'
  ownerId: string
  actionsTaken: string[]
  affectedRequests: number
}

/** Autonomous-looking workflows still require named human checkpoints. */
export interface AgentWorkflow {
  id: string
  tenantId: TenantId
  name: string
  description: string
  domain: IntelligenceDomain
  trigger: string
  steps: Array<{
    id: string
    name: string
    kind: 'retrieve' | 'analyse' | 'correlate' | 'recommend' | 'human-checkpoint' | 'notify'
    description: string
    /** Human checkpoints cannot be bypassed. */
    requiresHuman: boolean
  }>
  status: 'active' | 'paused' | 'draft'
  runsLast30d: number
  humanApprovalRate: number
  ownerId: string
  lastRunAt: IsoDateTime
}

/**
 * A controlled AI agent.
 *
 * Every agent operates strictly within the lifecycle below. An agent may draft
 * and analyse, but the transition to an approved action requires a named human
 * - no agent transitions itself to `approved-action`. The `reservedActs` field
 * records, for the reader, the government acts this agent is categorically
 * barred from performing regardless of confidence.
 */
export type AIAgentStage = 'draft' | 'ai-analysis' | 'human-review' | 'approved-action'

export interface AIAgent {
  id: string
  tenantId: TenantId
  name: string
  purpose: string
  domain: IntelligenceDomain
  /** The lifecycle stage this agent's current cycle sits at. */
  stage: AIAgentStage
  /** Whether the agent is enabled for use at all. */
  status: 'active' | 'paused' | 'draft'
  modelId: string
  ownerId: string
  autonomyLevel: 'advisory-only'
  runsLast30d: number
  humanApprovalRate: number
  /** Government acts this agent is categorically barred from performing. */
  reservedActs: string[]
  lastRunAt: IsoDateTime
}

/**
 * A model evaluation run.
 *
 * `AIModel.evaluationStatus` records only a verdict. This is the evidence
 * behind that verdict: a dated run of a named model version against the
 * evaluation dimensions, each scored against a published threshold, so an
 * evaluation status can be defended rather than merely asserted. An evaluation
 * that a governance board cannot inspect is not an evaluation.
 */
export type EvaluationDimensionId =
  | 'grounding'
  | 'accuracy'
  | 'refusal-discipline'
  | 'bias'
  | 'injection-resistance'
  | 'explainability'

export interface EvaluationDimensionResult {
  id: EvaluationDimensionId
  label: string
  /** Measured score, 0–100, higher is better. */
  score: number
  /** The published pass threshold for this dimension. */
  threshold: number
  passed: boolean
  detail: string
}

export interface AIEvaluation {
  id: string
  tenantId: TenantId
  modelId: string
  modelName: string
  modelVersion: string
  evaluatedAt: IsoDateTime
  reviewerId: string
  /** The overall verdict, matching the model's evaluationStatus vocabulary. */
  verdict: 'passed' | 'failed' | 're-evaluation-due'
  /** Number of held-out cases the run was scored over. */
  caseCount: number
  dimensions: EvaluationDimensionResult[]
  /** Composite of the dimension scores, 0–100. */
  compositeScore: number
  summary: string
}
