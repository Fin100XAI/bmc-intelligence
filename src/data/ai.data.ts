import { TENANT_ID, activeCorporation, municipality } from '@/config/municipality.config'
import type { IntelligenceDomain, Severity } from '@/types/common'
import type {
  AgentWorkflow,
  AIAgent,
  AIEvaluation,
  AIIncident,
  AIModel,
  AIRequestRecord,
  AIRiskCategory,
  AIRiskEntry,
  AIUseCase,
  EvaluationDimensionId,
  HumanOversightRecord,
  PromptTemplate,
} from '@/types/ai'
import { det, isoDaysFromAnchor, isoFromAnchor } from '@/utils/deterministic'
import { DEMO_USERS } from '@/auth/demo-users'
import { CITY_NAME, localityFor } from './naming'
import { WARDS, wardName } from './reference'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * The governed AI layer: model registry, prompt registry, request log, risk
 * register, human oversight, incidents, agents and evaluations.
 *
 * The governance apparatus itself - the models, the guardrails, the risk
 * categories, the evaluation dimensions - is a property of the platform and
 * reads the same for every deployment. What officers actually ASKED is not.
 * The request log is the most-read surface in this module, and a logged prompt
 * naming a ward or a locality in another city is the most visible way a
 * deployment can look borrowed. Every place name in a prompt therefore comes
 * from the active corporation's own divisions and localities, and every figure
 * from its own scale (`./naming.ts`, `./scale.ts`).
 *
 * Every corporation-dependent export below is a LIVE BINDING, rebuilt on a
 * corporation switch. No external model endpoint is contacted anywhere in this
 * build and no credential material exists in the application bundle.
 */

/** ---------------------------------------------------------------------
 * Model registry
 *
 * Every model is declared as a demonstration simulation.
 * ------------------------------------------------------------------- */

function modelRegistry(): AIModel[] {
  return [
    {
      id: 'model-municipal-analysis-v1',
      tenantId: TENANT_ID,
      name: t('Municipal Analysis Model'),
      provider: 'Local demonstration provider',
      deployment: 'MockMunicipalAIProvider (in-application)',
      environment: 'demonstration',
      approvedUse: [
        t('Summarising structured BMC intelligence'),
        t('Explaining derived metrics against their published computation'),
        t('Answering municipal queries grounded in platform evidence'),
      ],
      restrictedUse: [
        t('Any determination affecting an individual citizen'),
        t('Any expenditure, payment or procurement decision'),
        t('Any characterisation of conduct by a person or organisation'),
        t('Generation of content presented as an official municipal record'),
      ],
      riskClass: 'moderate',
      ownerId: 'user-ai-governance',
      version: '1.4.2',
      evaluationStatus: 'passed',
      lastEvaluatedAt: isoDaysFromAnchor(-22),
      status: 'active',
      notes:
        t('Deterministic demonstration provider producing structured responses from platform evidence. Replacing this with an approved production model requires completion of the model evaluation and AI governance approval workflow.'),
    },
    {
      id: 'model-flood-risk-v2',
      tenantId: TENANT_ID,
      name: t('Urban Flood Risk Model'),
      provider: 'BMC Intelligence Core',
      deployment: 'Deterministic rule model (in-application)',
      environment: 'demonstration',
      approvedUse: [
        t('Modelling waterlogging likelihood under stated rainfall and tide conditions'),
        t('Scenario recalculation for preparedness planning'),
      ],
      restrictedUse: [
        t('Public flood warning issuance'),
        t('Any use represented as a meteorological forecast'),
        t('Evacuation determination without human assessment'),
      ],
      riskClass: 'high',
      ownerId: 'user-disaster',
      version: '2.1.0',
      evaluationStatus: 'in-progress',
      lastEvaluatedAt: isoDaysFromAnchor(-9),
      status: 'restricted',
      notes:
        t('Rule-based model with published inputs and weights. Outputs are always labelled as simulation, never as forecast. Evaluation against historical season data is in progress.'),
    },
    {
      id: 'model-decision-analysis-v1',
      tenantId: TENANT_ID,
      name: t('Decision Options Analysis Model'),
      provider: 'BMC Intelligence Core',
      deployment: 'Deterministic comparison engine (in-application)',
      environment: 'demonstration',
      approvedUse: [
        t('Comparing declared decision alternatives against published criteria'),
        t('Producing an advisory ordering for consideration by the competent authority'),
      ],
      restrictedUse: [
        t('Selecting an alternative without human decision'),
        t('Any recommendation implying a binding institutional position'),
      ],
      riskClass: 'high',
      ownerId: 'user-ai-governance',
      version: '1.0.6',
      evaluationStatus: 're-evaluation-due',
      lastEvaluatedAt: isoDaysFromAnchor(-118),
      status: 'active',
      notes:
        t('Produces an advisory comparison only. Every decision case requires a named human decision with a recorded rationale before it can progress.'),
    },
    {
      id: 'model-anomaly-detection-v3',
      tenantId: TENANT_ID,
      name: t('Financial Anomaly Detection Model'),
      provider: 'BMC Intelligence Core',
      deployment: 'Statistical comparison engine (in-application)',
      environment: 'demonstration',
      approvedUse: [
        t('Identifying patterns requiring reconciliation against cohort comparables'),
        t('Prioritising reconciliation workload'),
      ],
      restrictedUse: [
        t('Any characterisation of a pattern as fraud, irregularity or wrongdoing'),
        t('Any action against an assessee without human adjudication'),
        t('Publication of individual assessment outcomes'),
      ],
      riskClass: 'high',
      ownerId: 'user-finance',
      version: '3.0.1',
      evaluationStatus: 'passed',
      lastEvaluatedAt: isoDaysFromAnchor(-34),
      status: 'restricted',
      notes:
        t('Outputs are always framed as anomalies requiring reconciliation. The model is technically incapable of producing a finding of wrongdoing and its outputs must never be described as such.'),
    },
    {
      id: 'model-text-summary-v1',
      tenantId: TENANT_ID,
      name: t('Operational Summary Model'),
      provider: 'Local demonstration provider',
      deployment: 'MockMunicipalAIProvider (in-application)',
      environment: 'demonstration',
      approvedUse: [t('Summarising incident timelines'), t('Producing executive brief sections from structured data')],
      restrictedUse: [t('Generating official correspondence'), t('Producing content for external publication without review')],
      riskClass: 'limited',
      ownerId: 'user-ai-governance',
      version: '1.2.0',
      evaluationStatus: 'passed',
      lastEvaluatedAt: isoDaysFromAnchor(-51),
      status: 'active',
      notes: t('Summarisation is performed strictly over structured platform records; no free-form generation is permitted.'),
    },
    {
      id: 'model-sovereign-llm-candidate',
      tenantId: TENANT_ID,
      name: t('Sovereign LLM Candidate (evaluation)'),
      provider: 'Pending selection',
      deployment: 'Not deployed',
      environment: 'evaluation',
      approvedUse: [],
      restrictedUse: [t('All production use pending evaluation and approval')],
      riskClass: 'high',
      ownerId: 'user-ai-governance',
      version: '-',
      evaluationStatus: 'not-started',
      lastEvaluatedAt: isoDaysFromAnchor(-1),
      status: 'pending-approval',
      notes:
        t('Placeholder registry entry for a future sovereign or approved model. No provider has been selected and no endpoint is configured. Deployment requires hosting determination, evaluation, privacy review and AI governance approval.'),
    },
  ]
}

/** ---------------------------------------------------------------------
 * Prompt registry
 * ------------------------------------------------------------------- */

function promptRegistry(): PromptTemplate[] {
  return [
    {
      id: 'prm-exec-brief',
      tenantId: TENANT_ID,
      useCase: 'executive-brief',
      title: t('Daily executive brief composition'),
      ownerId: 'user-ai-governance',
      version: '2.3',
      approvalStatus: 'approved',
      riskClass: 'moderate',
      lastModifiedAt: isoDaysFromAnchor(-14),
      body: t('Compose a municipal executive brief for {{role}} covering {{scope}} at {{generatedAt}}.\nUse only the structured records supplied in {{evidenceSet}}.\nState confidence explicitly for every assertion.\nWhere a figure is modelled rather than observed, say so.\nDo not characterise the conduct of any person or organisation.\nDo not present any recommendation as a decision.'),
      guardrails: [
        t('Refuse to answer where the supplied evidence set is empty'),
        t('Never assert a figure not present in the supplied records'),
        t('Always state confidence and data freshness'),
        t('Never characterise conduct or attribute blame'),
      ],
      allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'department-head', 'analyst'],
    },
    {
      id: 'prm-risk-analysis',
      tenantId: TENANT_ID,
      useCase: 'risk-analysis',
      title: t('Operational risk analysis'),
      ownerId: 'user-ai-governance',
      version: '1.8',
      approvalStatus: 'approved',
      riskClass: 'moderate',
      lastModifiedAt: isoDaysFromAnchor(-28),
      body: t('Analyse operational risk for {{domain}} within {{scope}}.\nRank by modelled severity and confidence using only {{evidenceSet}}.\nFor each risk, state the driver, the evidence reference and the residual uncertainty.\nCorrelation must never be described as causation.'),
      guardrails: [
        t('Rank strictly by the supplied severity and confidence fields'),
        t('Never infer causation from correlation'),
        t('Cite an evidence reference for every ranked item'),
      ],
      allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'department-head', 'chief-engineer', 'disaster-management-officer', 'analyst', 'ward-officer', 'health-officer', 'finance-officer'],
    },
    {
      id: 'prm-metric-explain',
      tenantId: TENANT_ID,
      useCase: 'metric-explanation',
      title: t('Derived metric explanation'),
      ownerId: 'user-ai-governance',
      version: '1.4',
      approvalStatus: 'approved',
      riskClass: 'limited',
      lastModifiedAt: isoDaysFromAnchor(-46),
      body: t('Explain how {{metricId}} is computed, using its published lineage {{lineage}} and weights {{weights}}.\nState every input, its source system and its contribution.\nDo not speculate about causes outside the supplied lineage.'),
      guardrails: [t('Explain only from the published lineage'), t('Never speculate beyond the declared inputs')],
      allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'department-head', 'chief-engineer', 'finance-officer', 'analyst', 'auditor', 'ward-officer', 'health-officer', 'disaster-management-officer', 'operator', 'ai-governance-officer', 'security-administrator'],
    },
    {
      id: 'prm-municipal-query',
      tenantId: TENANT_ID,
      useCase: 'municipal-query',
      title: t('Governed municipal query'),
      ownerId: 'user-ai-governance',
      version: '3.1',
      approvalStatus: 'approved',
      riskClass: 'moderate',
      lastModifiedAt: isoDaysFromAnchor(-6),
      body: t('Answer the municipal question {{question}} for {{role}} operating within {{scope}}.\nRetrieve only records the principal is authorised to read.\nStructure the answer as: Answer, Key Findings, Evidence, Confidence, Recommended Actions, Risks and Limitations, Sources.\nIf the platform holds no evidence for the question, say so plainly rather than reasoning generally.'),
      guardrails: [
        t('Retrieve strictly within the principal access scope'),
        t('Mark responses as general reasoning where evidence is unavailable'),
        t('Never fabricate a record reference'),
        t('Never issue an instruction - only recommendations for human decision'),
      ],
      allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'ward-officer', 'department-head', 'chief-engineer', 'finance-officer', 'disaster-management-officer', 'health-officer', 'analyst', 'operator', 'auditor', 'ai-governance-officer'],
    },
    {
      id: 'prm-recommendation',
      tenantId: TENANT_ID,
      useCase: 'action-recommendation',
      title: t('Explainable action recommendation'),
      ownerId: 'user-ai-governance',
      version: '2.0',
      approvalStatus: 'approved',
      riskClass: 'high',
      lastModifiedAt: isoDaysFromAnchor(-19),
      body: t('Recommend operational actions for {{context}} using {{evidenceSet}}.\nFor each recommendation state: Why, Evidence, Expected impact, Confidence, Dependencies, Risks and the accountable human role.\nEvery recommendation must be marked as requiring human approval.\nNever recommend an action reserved to human authority.'),
      guardrails: [
        t('Every recommendation must name an accountable human role'),
        t('Never recommend expenditure approval, payment sanction, penalty or procurement award'),
        t('Always state dependencies and risks alongside expected impact'),
      ],
      allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'deputy-commissioner', 'department-head', 'chief-engineer', 'disaster-management-officer', 'ward-officer', 'health-officer', 'finance-officer'],
    },
    {
      id: 'prm-incident-summary',
      tenantId: TENANT_ID,
      useCase: 'incident-summary',
      title: t('Incident situation summary'),
      ownerId: 'user-disaster',
      version: '1.6',
      approvalStatus: 'approved',
      riskClass: 'moderate',
      lastModifiedAt: isoDaysFromAnchor(-11),
      body: t('Summarise incident {{incidentId}} from its timeline {{timeline}} and deployed resources {{teams}}.\nState the current status, the population affected estimate and the outstanding requirement.\nDo not speculate about cause.'),
      guardrails: [t('Summarise only from the recorded timeline'), t('Never speculate about incident cause'), t('Label population figures as estimates')],
      allowedRoles: ['municipal-commissioner', 'disaster-management-officer', 'operator', 'ward-officer', 'department-head', 'additional-commissioner'],
    },
    {
      id: 'prm-decision-options',
      tenantId: TENANT_ID,
      useCase: 'decision-options',
      title: t('Decision alternative comparison'),
      ownerId: 'user-ai-governance',
      version: '1.2',
      approvalStatus: 'under-review',
      riskClass: 'high',
      lastModifiedAt: isoDaysFromAnchor(-3),
      body: t('Compare the declared alternatives {{alternatives}} for decision case {{caseId}} against cost, time to effect, benefit and dependency risk.\nProduce an advisory ordering with the basis stated for each position.\nState explicitly that the decision rests with the competent authority.'),
      guardrails: [
        t('Compare only declared alternatives - never invent one'),
        t('Always state that authority rests with the competent officer'),
        t('Never express a preference as a conclusion'),
      ],
      allowedRoles: ['municipal-commissioner', 'additional-commissioner', 'department-head', 'chief-engineer', 'finance-officer', 'ai-governance-officer'],
    },
    {
      id: 'prm-anomaly-narrative',
      tenantId: TENANT_ID,
      useCase: 'anomaly-narrative',
      title: t('Financial anomaly narrative'),
      ownerId: 'user-finance',
      version: '2.2',
      approvalStatus: 'approved',
      riskClass: 'high',
      lastModifiedAt: isoDaysFromAnchor(-38),
      body: t('Describe the statistical basis of anomaly {{anomalyId}} against its cohort comparables.\nState what the pattern is and what it is not.\nThe words fraud, irregularity, corruption and wrongdoing must not appear in the output.'),
      guardrails: [
        t('Prohibited vocabulary is enforced at the gateway'),
        t('Every output must state that an anomaly is not a finding'),
        t('Never name an individual or organisation'),
      ],
      allowedRoles: ['municipal-commissioner', 'finance-officer', 'auditor'],
    },
    {
      id: 'prm-scenario',
      tenantId: TENANT_ID,
      useCase: 'scenario-interpretation',
      title: t('Scenario result interpretation'),
      ownerId: 'user-disaster',
      version: '1.1',
      approvalStatus: 'approved',
      riskClass: 'moderate',
      lastModifiedAt: isoDaysFromAnchor(-16),
      body: t('Interpret scenario result {{scenarioResult}} produced from inputs {{inputs}}.\nState that the output is a simulation and not a forecast.\nIdentify which wards move most and why, referencing the model drivers.'),
      guardrails: [
        t('Always label output as simulation, never forecast'),
        t('Explain movement only through declared model drivers'),
        t('Never state a probability the model does not produce'),
      ],
      allowedRoles: ['municipal-commissioner', 'disaster-management-officer', 'department-head', 'chief-engineer', 'operator', 'analyst', 'ward-officer', 'additional-commissioner', 'deputy-commissioner'],
    },
  ]
}

/** ---------------------------------------------------------------------
 * AI request record
 * ------------------------------------------------------------------- */

const USE_CASES: AIUseCase[] = [
  'executive-brief',
  'risk-analysis',
  'metric-explanation',
  'municipal-query',
  'action-recommendation',
  'incident-summary',
  'decision-options',
  'anomaly-narrative',
  'scenario-interpretation',
]

/** One of the active corporation's own divisions, named as an officer would. */
function promptWard(seed: string): string {
  if (WARDS.length === 0) return CITY_NAME
  return wardName(det(`ai-prompt-ward:${seed}`).pick(WARDS).id)
}

/**
 * The compound rainfall scenario this corporation actually runs.
 *
 * A high-tide scenario is meaningful only where the corporation has a
 * shoreline or a tidal creek. Asking a landlocked corporation's disaster cell
 * to interpret a tide result is the kind of borrowed detail that tells an
 * officer the platform was built for somewhere else.
 */
function rainfallScenarioLabel(): string {
  switch (activeCorporation.form.type) {
    case 'coastal':
    case 'creek-side':
      return t('heavy rainfall coinciding with high tide')
    case 'riverine':
      return t('heavy rainfall with a rising river level')
    case 'lakeside':
      return t('heavy rainfall with the lake at spill level')
    case 'hill':
      return t('heavy rainfall on saturated slopes')
    default:
      return t('sustained heavy rainfall')
  }
}

/**
 * The prompts officers put to the platform, as they appear in the AI request
 * log and, through it, on every human-oversight record.
 *
 * These are rebuilt per corporation rather than held as literals. Ward names
 * come from the corporation's own published divisions, localities from its own
 * published localities, and the one money figure from its own budget scale, so
 * the log reads as this corporation's own traffic rather than as another
 * city's transcript.
 */
function samplePrompts(): Record<AIUseCase, string[]> {
  const city = CITY_NAME
  const unit = municipality.terminology.primaryUnitSingular
  const units = municipality.terminology.primaryUnitPlural.toLowerCase()
  const augmentationCrore = scaled(180, CITY_SCALE.budget)

  return {
    'executive-brief': [
      t('Generate the daily executive brief for {0}.', city),
      t('Summarise the {0} position ahead of the morning review.', city),
      t('Brief me on the corporation position across all {0} {1}.', CITY_SCALE.wardCount, units),
    ],
    'risk-analysis': [
      t('What are {0}\'s five highest operational risks today?', city),
      t('Which {0} require immediate attention?', units),
      t('Analyse infrastructure risk across flood-prone {0}.', units),
      t('Assess the operational risk position for {0} {1}.', unit, promptWard('risk')),
    ],
    'metric-explanation': [
      t('Explain how the monsoon readiness score is computed.'),
      t('How is the {0} operational health index derived?', unit.toLowerCase()),
      t('Explain the water supply reliability metric for {0} {1}.', unit, promptWard('metric')),
    ],
    'municipal-query': [
      t('Which citizen services are deteriorating in {0}?', city),
      t('Summarise major project delays.'),
      t('What requires my attention today?'),
      t('Why are complaints increasing in {0} {1}?', unit, promptWard('complaints')),
      t('What is the water supply position in {0}?', localityFor('ai-prompt-water')),
    ],
    'action-recommendation': [
      t('Recommend actions for the drainage capacity shortfall in {0} {1}.', unit, promptWard('drainage')),
      t('What should be prioritised for pre-monsoon works across {0}?', city),
      t('Recommend a response to the recurring waterlogging reports from {0}.', localityFor('ai-prompt-waterlogging')),
    ],
    'incident-summary': [
      t('Summarise the current active incidents across {0}.', city),
      t('Produce a situation summary for the {0} waterlogging incident.', localityFor('ai-prompt-incident')),
    ],
    'decision-options': [
      t('Compare the alternatives for dewatering resource allocation in {0} {1}.', unit, promptWard('dewatering')),
      t('Assess options for the ₹{0} crore storm water augmentation delay.', augmentationCrore),
    ],
    'anomaly-narrative': [
      t('Describe the basis of the assessment pattern anomaly in {0} {1}.', unit, promptWard('assessment')),
      t('Identify unusual collection patterns across {0}.', city),
    ],
    'scenario-interpretation': [
      t('Interpret the {0} scenario result.', rainfallScenarioLabel()),
      t('Which {0} move most under the extreme scenario?', units),
    ],
  }
}

/** ---------------------------------------------------------------------
 * AI risk register
 * ------------------------------------------------------------------- */

function build$RISK_SPECS(): Array<{
  category: AIRiskCategory
  description: string
  likelihood: AIRiskEntry['likelihood']
  impact: AIRiskEntry['impact']
  controls: string[]
  ownerId: string
}> {
  return [
  {
    category: 'hallucination',
    description: t('A response asserts a municipal figure, record or event that does not exist in the platform data.'),
    likelihood: 'medium',
    impact: 'high',
    controls: [
      t('Responses are constructed from retrieved structured records only'),
      t('Every substantive claim carries an evidence citation'),
      t('Responses lacking evidence are explicitly labelled as general reasoning'),
      t('Citation references are validated against the evidence store before display'),
    ],
    ownerId: 'user-ai-governance',
  },
  {
    category: 'bias',
    description: t('Systematic under-representation of particular wards or communities in prioritisation outputs.'),
    likelihood: 'medium',
    impact: 'high',
    controls: [
      t('Prioritisation weights are published and reviewable'),
      t('Ward-level distribution of recommendations is monitored'),
      t('Human decision is required before any prioritisation takes effect'),
    ],
    ownerId: 'user-ai-governance',
  },
  {
    category: 'privacy',
    description: t('Personal data reaching the AI layer through an inadequately minimised source.'),
    likelihood: 'low',
    impact: 'high',
    controls: [
      t('Minimisation is applied at the connector boundary, before ingestion'),
      t('Health data is aggregated at source; no individual record is transmitted'),
      t('Grievance identity fields are dropped at ingestion'),
      t('Dataset register records minimisation applied per source'),
    ],
    ownerId: 'user-security',
  },
  {
    category: 'data-leakage',
    description: t('A response surfaces information above the requesting principal\'s classification ceiling.'),
    likelihood: 'low',
    impact: 'high',
    controls: [
      t('Retrieval is scoped by the permission engine before generation'),
      t('Classification is enforced on every citation'),
      t('Denied access is recorded as an audit event'),
    ],
    ownerId: 'user-security',
  },
  {
    category: 'prompt-injection',
    description: t('Instructions embedded in ingested content attempt to alter model behaviour.'),
    likelihood: 'medium',
    impact: 'medium',
    controls: [
      t('Retrieved content is treated as data, never as instruction'),
      t('Prompt templates are versioned, approved and immutable at runtime'),
      t('Free-text fields are sanitised before ingestion'),
    ],
    ownerId: 'user-security',
  },
  {
    category: 'unsafe-recommendation',
    description: t('A recommendation proposes an action that is unsafe, unlawful or reserved to human authority.'),
    likelihood: 'low',
    impact: 'high',
    controls: [
      t('High-impact action classes are blocked at the gateway'),
      t('Every recommendation names an accountable human role'),
      t('Human approval is required before any recommendation is actioned'),
    ],
    ownerId: 'user-ai-governance',
  },
  {
    category: 'excessive-automation',
    description: t('Operational reliance on AI output displaces institutional judgement over time.'),
    likelihood: 'medium',
    impact: 'high',
    controls: [
      t('No AI output can transition a workflow state without human action'),
      t('Human oversight acceptance and modification rates are monitored'),
      t('Recommendations are advisory by construction, not by policy alone'),
    ],
    ownerId: 'user-ai-governance',
  },
  {
    category: 'model-drift',
    description: t('Model behaviour diverges from its evaluated baseline as underlying data distributions change.'),
    likelihood: 'medium',
    impact: 'medium',
    controls: [
      t('Evaluation status and last evaluation date recorded per model'),
      t('Re-evaluation triggered on schedule and on material data change'),
      t('Confidence distribution monitored across requests'),
    ],
    ownerId: 'user-ai-governance',
  },
  {
    category: 'explainability',
    description: t('An output cannot be traced to the inputs and reasoning that produced it.'),
    likelihood: 'low',
    impact: 'high',
    controls: [
      t('Every derived metric publishes its lineage and weights'),
      t('Every recommendation states Why, Evidence, Dependencies and Risks'),
      t('Model and prompt version recorded on every request'),
    ],
    ownerId: 'user-ai-governance',
  },
  {
    category: 'dependency',
    description: t('Operational dependence on a single model or provider creates continuity exposure.'),
    likelihood: 'medium',
    impact: 'medium',
    controls: [
      t('The AI layer is an abstraction; providers are interchangeable without interface change'),
      t('The platform degrades to non-AI operation without loss of core function'),
      t('Sovereign and on-premise deployment options retained in the registry'),
    ],
    ownerId: 'user-ai-governance',
  },
]
}
let RISK_SPECS: Array<{
  category: AIRiskCategory
  description: string
  likelihood: AIRiskEntry['likelihood']
  impact: AIRiskEntry['impact']
  controls: string[]
  ownerId: string
}> = build$RISK_SPECS()
registerLayer(() => {
  RISK_SPECS = build$RISK_SPECS()
})

function ratingFrom(likelihood: string, impact: string): Severity {
  const l = likelihood === 'high' ? 3 : likelihood === 'medium' ? 2 : 1
  const im = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1
  const product = l * im
  if (product >= 9) return 'critical'
  if (product >= 6) return 'high'
  if (product >= 3) return 'medium'
  return 'low'
}

/** ---------------------------------------------------------------------
 * AI incidents
 * ------------------------------------------------------------------- */

function aiIncidentRecords(): AIIncident[] {
  return [
    {
      id: 'aii-0001',
      tenantId: TENANT_ID,
      reference: 'AII-2026-0007',
      title: t('Response cited an evidence reference that could not be resolved'),
      description:
        t('A municipal query response included a citation whose evidence identifier did not resolve in the evidence store. The response was withheld from the requesting officer by the citation validation control.'),
      category: 'hallucination',
      severity: 'medium',
      detectedAt: isoDaysFromAnchor(-11),
      modelId: 'model-municipal-analysis-v1',
      status: 'resolved',
      ownerId: 'user-ai-governance',
      actionsTaken: [
        t('Citation validation control confirmed working as designed - the response never reached the officer'),
        t('Root cause traced to a stale evidence index following a corpus refresh'),
        t('Index refresh sequencing corrected'),
        t('Regression check added to the evaluation suite'),
      ],
      affectedRequests: 1,
    },
    {
      id: 'aii-0002',
      tenantId: TENANT_ID,
      reference: 'AII-2026-0011',
      title: t('Prompt sought a determination reserved to human authority'),
      description:
        t('A request asked the platform to approve a payment release. The gateway blocked the request under the high-impact action prohibition and recorded the event.'),
      category: 'unsafe-recommendation',
      severity: 'high',
      detectedAt: isoDaysFromAnchor(-6),
      modelId: 'model-municipal-analysis-v1',
      status: 'reviewed',
      ownerId: 'user-ai-governance',
      actionsTaken: [
        t('Request blocked at the gateway before reaching the model'),
        t('Requesting officer notified of the prohibition and the correct workflow'),
        t('Guidance issued clarifying which determinations remain reserved to human authority'),
      ],
      affectedRequests: 1,
    },
    {
      id: 'aii-0003',
      tenantId: TENANT_ID,
      reference: 'AII-2026-0014',
      title: t('Confidence reported above the level supported by input completeness'),
      description:
        t('A risk analysis response reported high confidence where a material proportion of the underlying evidence set was stale. The confidence calibration rule has been revised.'),
      category: 'explainability',
      severity: 'medium',
      detectedAt: isoDaysFromAnchor(-3),
      modelId: 'model-municipal-analysis-v1',
      status: 'contained',
      ownerId: 'user-ai-governance',
      actionsTaken: [
        t('Confidence calibration now weights evidence staleness explicitly'),
        t('Affected responses re-issued to the requesting officers with corrected confidence'),
        t('Freshness is now stated alongside confidence in every response'),
      ],
      affectedRequests: 4,
    },
  ]
}

/** ---------------------------------------------------------------------
 * Agent workflows - every one contains a mandatory human checkpoint
 *
 * Run counts follow each workflow's own schedule rather than the size of the
 * corporation: a workflow set to run every thirty minutes runs 1,440 times a
 * month whether it is serving twelve million residents or three hundred
 * thousand.
 * ------------------------------------------------------------------- */

function agentWorkflowRecords(): AgentWorkflow[] {
  return [
    {
      id: 'agw-monsoon-readiness',
      tenantId: TENANT_ID,
      name: t('Pre-monsoon readiness assessment'),
      description:
        t('Assembles drain condition, pump readiness, chronic location status and rainfall outlook into a ward readiness position, then presents it for departmental confirmation.'),
      domain: 'monsoon',
      trigger: 'Daily at 05:30 during the monsoon season, and on rainfall threshold breach',
      steps: [
        { id: 's1', name: t('Retrieve drainage and pump position'), kind: 'retrieve', description: t('Collects the current desilting, encroachment and pump availability position for every ward.'), requiresHuman: false },
        { id: 's2', name: t('Retrieve rainfall and tide outlook'), kind: 'retrieve', description: t('Collects the rainfall accumulation and the tidal windows for the assessment horizon.'), requiresHuman: false },
        { id: 's3', name: t('Compute ward readiness'), kind: 'analyse', description: t('Applies the published readiness weights to produce a ward-level readiness score with declared gaps.'), requiresHuman: false },
        { id: 's4', name: t('Correlate with hospital and route exposure'), kind: 'correlate', description: t('Identifies wards where readiness gaps coincide with hospital access or critical route exposure.'), requiresHuman: false },
        { id: 's5', name: t('Draft deployment recommendations'), kind: 'recommend', description: t('Produces advisory resource pre-positioning recommendations with stated rationale and dependencies.'), requiresHuman: false },
        { id: 's6', name: t('Departmental confirmation'), kind: 'human-checkpoint', description: t('A named officer must review, amend or reject the recommendations. No deployment occurs without this step.'), requiresHuman: true },
        { id: 's7', name: t('Notify ward officers'), kind: 'notify', description: t('Confirmed position is issued to ward officers with the approving officer recorded.'), requiresHuman: false },
      ],
      status: 'active',
      runsLast30d: 30,
      humanApprovalRate: 82,
      ownerId: 'user-disaster',
      lastRunAt: isoFromAnchor(-224),
    },
    {
      id: 'agw-project-risk',
      tenantId: TENANT_ID,
      name: t('Capital project risk sweep'),
      description:
        t('Evaluates every active capital project against the published risk engine and escalates those crossing the departmental threshold for engineering review.'),
      domain: 'projects',
      trigger: 'Daily at 02:00',
      steps: [
        { id: 's1', name: t('Retrieve project and milestone position'), kind: 'retrieve', description: t('Collects physical progress, milestone status and payment position for every active project.'), requiresHuman: false },
        { id: 's2', name: t('Evaluate the risk engine'), kind: 'analyse', description: t('Applies the published project risk weights and produces explainable driver contributions.'), requiresHuman: false },
        { id: 's3', name: t('Correlate with contractor and complaint signals'), kind: 'correlate', description: t('Cross-references contractor delivery history and linked citizen complaints on the same geography.'), requiresHuman: false },
        { id: 's4', name: t('Engineering review checkpoint'), kind: 'human-checkpoint', description: t('The Chief Engineer or a nominated officer reviews escalations before any decision case is raised.'), requiresHuman: true },
        { id: 's5', name: t('Raise decision cases for confirmed escalations'), kind: 'recommend', description: t('Confirmed escalations are prepared as decision case drafts for the competent authority.'), requiresHuman: false },
      ],
      status: 'active',
      runsLast30d: 30,
      humanApprovalRate: 71,
      ownerId: 'user-chief-engineer',
      lastRunAt: isoFromAnchor(-440),
    },
    {
      id: 'agw-sla-escalation',
      tenantId: TENANT_ID,
      name: t('Service SLA escalation'),
      description:
        t('Detects approaching and breached service SLAs, notifies the accountable officer and escalates on non-acknowledgement within the defined window.'),
      domain: 'wards',
      trigger: 'Every 30 minutes',
      steps: [
        { id: 's1', name: t('Retrieve open alerts and complaints'), kind: 'retrieve', description: t('Collects all open items with an SLA position within the notification window.'), requiresHuman: false },
        { id: 's2', name: t('Assess SLA position'), kind: 'analyse', description: t('Computes remaining SLA and classifies each item as approaching, breached or within tolerance.'), requiresHuman: false },
        { id: 's3', name: t('Notify accountable officers'), kind: 'notify', description: t('Issues notification to the officer accountable for each item.'), requiresHuman: false },
        { id: 's4', name: t('Escalation authorisation'), kind: 'human-checkpoint', description: t('Escalation beyond the department requires a control room operator or ward officer to authorise it.'), requiresHuman: true },
      ],
      status: 'active',
      runsLast30d: 1440,
      humanApprovalRate: 94,
      ownerId: 'user-commissioner',
      lastRunAt: isoFromAnchor(-18),
    },
    {
      id: 'agw-revenue-reconciliation',
      tenantId: TENANT_ID,
      name: t('Revenue reconciliation candidate identification'),
      description:
        t('Identifies collection and assessment patterns requiring reconciliation against cohort comparables and routes them to the assessment department.'),
      domain: 'revenue',
      trigger: 'Weekly, Monday 06:00',
      steps: [
        { id: 's1', name: t('Retrieve assessment and collection position'), kind: 'retrieve', description: t('Collects the demand and realisation position by ward, segment and period.'), requiresHuman: false },
        { id: 's2', name: t('Compare against cohort comparables'), kind: 'analyse', description: t('Identifies statistical divergence from demographically comparable cohorts.'), requiresHuman: false },
        { id: 's3', name: t('Assessment officer review'), kind: 'human-checkpoint', description: t('An assessment officer reviews each candidate. No communication is issued to any assessee by the platform.'), requiresHuman: true },
        { id: 's4', name: t('Record reconciliation outcome'), kind: 'notify', description: t('Reconciliation outcomes are recorded against the anomaly with the reviewing officer named.'), requiresHuman: false },
      ],
      status: 'active',
      runsLast30d: 4,
      humanApprovalRate: 66,
      ownerId: 'user-finance',
      lastRunAt: isoFromAnchor(-2600),
    },
    {
      id: 'agw-cross-domain',
      tenantId: TENANT_ID,
      name: t('Cross-domain correlation sweep'),
      description:
        t('Correlates signals across drainage, roads, hospitals, mobility and ward vulnerability to surface integrated exposures no single domain view reveals.'),
      domain: 'executive',
      trigger: 'Every 2 hours',
      steps: [
        { id: 's1', name: t('Retrieve domain signal set'), kind: 'retrieve', description: t('Collects the current signal position across all participating domains.'), requiresHuman: false },
        { id: 's2', name: t('Evaluate correlation rules'), kind: 'correlate', description: t('Applies declared correlation rules to identify integrated exposures.'), requiresHuman: false },
        { id: 's3', name: t('Assess severity and confidence'), kind: 'analyse', description: t('Assigns severity from combined exposure and confidence from input completeness.'), requiresHuman: false },
        { id: 's4', name: t('Analyst validation'), kind: 'human-checkpoint', description: t('An analyst validates each correlation before it is raised as intelligence. Correlation is never presented as causation.'), requiresHuman: true },
      ],
      status: 'active',
      runsLast30d: 360,
      humanApprovalRate: 58,
      ownerId: 'user-analyst',
      lastRunAt: isoFromAnchor(-74),
    },
    {
      id: 'agw-brief-composition',
      tenantId: TENANT_ID,
      name: t('Executive brief composition'),
      description:
        t('Assembles the daily executive brief from the current intelligence, decision, finance and operations position for the Commissioner.'),
      domain: 'executive',
      trigger: 'Daily at 06:45',
      steps: [
        { id: 's1', name: t('Retrieve current position'), kind: 'retrieve', description: t('Collects intelligence, alerts, decisions, incidents and finance position within the requesting principal scope.'), requiresHuman: false },
        { id: 's2', name: t('Compose brief sections'), kind: 'analyse', description: t('Produces each brief section from the retrieved records with citations and stated confidence.'), requiresHuman: false },
        { id: 's3', name: t('Executive review'), kind: 'human-checkpoint', description: t('The brief is presented for review. It is never distributed as an institutional position without a named officer releasing it.'), requiresHuman: true },
      ],
      status: 'active',
      runsLast30d: 30,
      humanApprovalRate: 88,
      ownerId: 'user-commissioner',
      lastRunAt: isoFromAnchor(-155),
    },
  ]
}

/** ---------------------------------------------------------------------
 * Controlled AI agents (§46)
 *
 * The nine named agents the platform operates. Every agent is advisory only:
 * it may draft and analyse, but the transition to an approved action is a
 * named human's act, never the agent's. The `reservedActs` on each agent are
 * the government acts it is categorically barred from performing - the same
 * acts the AI gateway blocks before any request reaches a model, expressed
 * here at the agent level so the reader can see the boundary per agent.
 * ------------------------------------------------------------------- */

function build$RESERVED_ACTS_FINANCE() {
  return [
  t('Sanction or release any payment or expenditure'),
  t('Approve a procurement award'),
  t('Impose a penalty or recovery'),
]
}
let RESERVED_ACTS_FINANCE: ReturnType<typeof build$RESERVED_ACTS_FINANCE> = build$RESERVED_ACTS_FINANCE()
registerLayer(() => {
  RESERVED_ACTS_FINANCE = build$RESERVED_ACTS_FINANCE()
})
function build$RESERVED_ACTS_RECORD() {
  return [
  t('Amend any official record or register entry'),
  t('Issue a final or official order'),
  t('Reject a citizen entitlement or eligibility'),
]
}
let RESERVED_ACTS_RECORD: ReturnType<typeof build$RESERVED_ACTS_RECORD> = build$RESERVED_ACTS_RECORD()
registerLayer(() => {
  RESERVED_ACTS_RECORD = build$RESERVED_ACTS_RECORD()
})
function build$RESERVED_ACTS_CONDUCT() {
  return [t('Characterise any person or supplier as culpable of wrongdoing')]
}
let RESERVED_ACTS_CONDUCT: ReturnType<typeof build$RESERVED_ACTS_CONDUCT> = build$RESERVED_ACTS_CONDUCT()
registerLayer(() => {
  RESERVED_ACTS_CONDUCT = build$RESERVED_ACTS_CONDUCT()
})

interface AgentSpec {
  id: string
  name: string
  purpose: string
  domain: IntelligenceDomain
  stage: AIAgent['stage']
  modelId: string
  ownerId: string
  reservedActs: string[]
}

function build$AGENT_SPECS(): AgentSpec[] {
  return [
  {
    id: 'agent-commissioner-brief',
    name: t('Commissioner Brief Agent'),
    purpose:
      t('Assembles the daily city intelligence brief from the platform record - top risks, exceptions, decisions required and readiness - for the Commissioner to act on.'),
    domain: 'executive',
    stage: 'human-review',
    modelId: 'model-municipal-analysis-v1',
    ownerId: 'off-head-dept-commissioner',
    reservedActs: [...RESERVED_ACTS_RECORD, ...RESERVED_ACTS_CONDUCT],
  },
  {
    id: 'agent-monsoon',
    name: t('Monsoon Intelligence Agent'),
    purpose:
      t('Assembles ward monsoon readiness from drain, pump, rainfall and tide position and drafts advisory resource pre-positioning for departmental confirmation.'),
    domain: 'monsoon',
    stage: 'approved-action',
    modelId: 'model-flood-risk-v2',
    ownerId: 'off-head-dept-stormwater',
    reservedActs: [...RESERVED_ACTS_RECORD],
  },
  {
    id: 'agent-project-risk',
    name: t('Project Risk Agent'),
    purpose:
      t('Scores active capital works against the published project risk weights and drafts the drivers behind each high-risk work for engineering review.'),
    domain: 'projects',
    stage: 'ai-analysis',
    modelId: 'model-decision-analysis-v1',
    ownerId: 'off-head-dept-projects',
    reservedActs: [...RESERVED_ACTS_FINANCE, ...RESERVED_ACTS_CONDUCT],
  },
  {
    id: 'agent-revenue',
    name: t('Revenue Intelligence Agent'),
    purpose:
      t('Surfaces revenue exceptions and collection-efficiency movements as reconciliation candidates for the finance department to review.'),
    domain: 'revenue',
    stage: 'human-review',
    modelId: 'model-anomaly-detection-v3',
    ownerId: 'off-head-dept-finance',
    reservedActs: [...RESERVED_ACTS_FINANCE, ...RESERVED_ACTS_CONDUCT],
  },
  {
    id: 'agent-citizen-service',
    name: t('Citizen Service Agent'),
    purpose:
      t('Detects recurring complaint clusters and drafts the root-cause association with the infrastructure record in that ward for the ward officer.'),
    domain: 'citizen-services',
    stage: 'ai-analysis',
    modelId: 'model-municipal-analysis-v1',
    ownerId: 'off-head-dept-commissioner',
    reservedActs: [...RESERVED_ACTS_RECORD],
  },
  {
    id: 'agent-infrastructure-risk',
    name: t('Infrastructure Risk Agent'),
    purpose:
      t('Assesses asset failure risk from condition, age, inspection and work-order history and drafts a predictive-maintenance queue for asset management.'),
    domain: 'assets',
    stage: 'draft',
    modelId: 'model-decision-analysis-v1',
    ownerId: 'off-head-dept-projects',
    reservedActs: [...RESERVED_ACTS_FINANCE],
  },
  {
    id: 'agent-evidence',
    name: t('Evidence Agent'),
    purpose:
      t('Resolves the evidence chain behind a metric or recommendation so that every figure a human acts on can be traced to its source record.'),
    domain: 'executive',
    stage: 'approved-action',
    modelId: 'model-municipal-analysis-v1',
    ownerId: 'off-head-dept-it',
    reservedActs: [...RESERVED_ACTS_RECORD],
  },
  {
    id: 'agent-sop',
    name: t('SOP Agent'),
    purpose:
      t('Retrieves the applicable standard operating procedure for an incident or decision and drafts the relevant steps for the responding officer.'),
    domain: 'disaster',
    stage: 'human-review',
    modelId: 'model-text-summary-v1',
    ownerId: 'off-head-dept-disaster',
    reservedActs: [...RESERVED_ACTS_RECORD],
  },
  {
    id: 'agent-audit',
    name: t('Audit Agent'),
    purpose:
      t('Reviews the audit trail for access patterns warranting attention and drafts them for the auditor - it flags for review, it does not adjudicate.'),
    domain: 'security',
    stage: 'ai-analysis',
    modelId: 'model-anomaly-detection-v3',
    ownerId: 'off-head-dept-it',
    reservedActs: [...RESERVED_ACTS_CONDUCT, t('Take any enforcement or disciplinary action')],
  },
]
}
let AGENT_SPECS: AgentSpec[] = build$AGENT_SPECS()
registerLayer(() => {
  AGENT_SPECS = build$AGENT_SPECS()
})

/** ---------------------------------------------------------------------
 * AI model evaluations (§48)
 *
 * The evidence behind each model's `evaluationStatus`. One dated run per model
 * against the six evaluation dimensions, each scored against a published
 * threshold. The verdict is derived from the dimension results, not asserted
 * separately - a model passes only if it clears every dimension.
 * ------------------------------------------------------------------- */

function build$EVAL_DIMENSIONS(): Array<{ id: EvaluationDimensionId; label: string; threshold: number; detail: string }> {
  return [
  { id: 'grounding', label: t('Grounding'), threshold: 85, detail: t('Share of responses whose claims resolve to a cited evidence record.') },
  { id: 'accuracy', label: t('Accuracy'), threshold: 80, detail: t('Agreement with the expected answer on the held-out case set.') },
  { id: 'refusal-discipline', label: t('Refusal discipline'), threshold: 90, detail: t('Correct refusal of prompts expressing a reserved government act.') },
  { id: 'bias', label: t('Bias'), threshold: 82, detail: t('Absence of ward, department or demographic skew across matched cases.') },
  { id: 'injection-resistance', label: t('Injection resistance'), threshold: 88, detail: t('Resistance to prompt-injection attempts embedded in retrieved context.') },
  { id: 'explainability', label: t('Explainability'), threshold: 75, detail: t('Share of outputs accompanied by an inspectable rationale.') },
]
}
let EVAL_DIMENSIONS: Array<{ id: EvaluationDimensionId; label: string; threshold: number; detail: string }> = build$EVAL_DIMENSIONS()
registerLayer(() => {
  EVAL_DIMENSIONS = build$EVAL_DIMENSIONS()
})

/** ---------------------------------------------------------------------
 * Live bindings
 * ------------------------------------------------------------------- */

export let AI_MODELS: AIModel[] = []
export let AI_MODEL_BY_ID: Map<string, AIModel> = new Map()
export let PROMPT_TEMPLATES: PromptTemplate[] = []
export let AI_REQUESTS: AIRequestRecord[] = []
export let AI_RISK_REGISTER: AIRiskEntry[] = []
export let HUMAN_OVERSIGHT: HumanOversightRecord[] = []
export let AI_INCIDENTS: AIIncident[] = []
export let AGENT_WORKFLOWS: AgentWorkflow[] = []
export let AI_AGENTS: AIAgent[] = []
export let AI_AGENT_BY_ID: Map<string, AIAgent> = new Map()
export let AI_EVALUATIONS: AIEvaluation[] = []
export let AI_EVALUATION_BY_MODEL: Map<string, AIEvaluation> = new Map()

/** Aggregate figures for the AI governance dashboard. */
export function aiOversightSummary(): {
  pending: number
  accepted: number
  modified: number
  rejected: number
  escalated: number
  acceptanceRate: number
} {
  const pending = HUMAN_OVERSIGHT.filter((h) => h.outcome === 'pending').length
  const accepted = HUMAN_OVERSIGHT.filter((h) => h.outcome === 'accepted').length
  const modified = HUMAN_OVERSIGHT.filter((h) => h.outcome === 'modified').length
  const rejected = HUMAN_OVERSIGHT.filter((h) => h.outcome === 'rejected').length
  const escalated = HUMAN_OVERSIGHT.filter((h) => h.outcome === 'escalated').length
  const reviewed = accepted + modified + rejected + escalated
  return {
    pending,
    accepted,
    modified,
    rejected,
    escalated,
    acceptanceRate: reviewed > 0 ? Math.round((accepted / reviewed) * 1000) / 10 : 0,
  }
}

registerLayer(() => {
  const scale = CITY_SCALE

  AI_MODELS = modelRegistry()
  AI_MODEL_BY_ID = new Map(AI_MODELS.map((m) => [m.id, m]))

  PROMPT_TEMPLATES = promptRegistry()

  // Request volume follows the officer body putting questions to the platform.
  // The floor keeps the governance log worth opening on the smallest
  // corporation, and is set above two full passes of the use-case list so
  // every use case - and therefore every review outcome - is represented.
  const prompts = samplePrompts()
  const requestCount = scaledCount(148, scale.population, 20)

  AI_REQUESTS = Array.from({ length: requestCount }, (_, i): AIRequestRecord => {
    const r = det(`airequest:${i}`)
    // The first two passes cycle through the use cases rather than sampling
    // them. On a short log, a purely sampled draw can leave the Decision
    // Options tab empty and the human-oversight register with nothing in it -
    // understating the controls rather than demonstrating them.
    const useCase = i < USE_CASES.length * 2 ? (USE_CASES[i % USE_CASES.length] as AIUseCase) : r.pick(USE_CASES)
    const user = r.pick(DEMO_USERS)
    const template = PROMPT_TEMPLATES.find((p) => p.useCase === useCase) ?? PROMPT_TEMPLATES[0]!
    const grounding = r.weighted([['evidence-backed', 8], ['general-reasoning', 2]] as const)
    const citationCount = grounding === 'evidence-backed' ? r.int(2, 9) : 0
    const policyStatus = r.weighted([['passed', 22], ['flagged', 3], ['blocked', 1]] as const)
    const highImpact = useCase === 'action-recommendation' || useCase === 'decision-options' || useCase === 'anomaly-narrative'

    return {
      id: `air-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      useCase,
      prompt: r.pick(prompts[useCase]),
      promptTemplateId: template.id,
      modelId: useCase === 'decision-options' ? 'model-decision-analysis-v1' : useCase === 'anomaly-narrative' ? 'model-anomaly-detection-v3' : useCase === 'scenario-interpretation' ? 'model-flood-risk-v2' : 'model-municipal-analysis-v1',
      provider: 'Local demonstration provider',
      requestedBy: user.id,
      requestedByRole: user.roleId,
      requestedAt: isoFromAnchor(-r.int(6, 60 * 24 * 20)),
      latencyMs: r.int(280, 3400),
      confidence: r.weighted([['high', 3], ['medium', 5], ['low', 2]] as const),
      grounding,
      citationCount,
      reviewStatus: highImpact
        ? r.weighted([['pending', 4], ['accepted', 4], ['modified', 2], ['rejected', 1], ['escalated', 1]] as const)
        : 'not-required',
      policyStatus,
      policyNote:
        policyStatus === 'blocked'
          ? t('Request blocked at the gateway: the prompt sought a determination reserved to human authority.')
          : policyStatus === 'flagged'
            ? t('Response flagged for review: confidence below threshold for the requested use case.')
            : undefined,
      classification: r.weighted([['internal', 6], ['confidential', 3], ['restricted', 1]] as const),
      tokensIn: r.int(320, 4800),
      tokensOut: r.int(180, 2600),
      domains: r.sample(
        ['monsoon', 'water', 'roads', 'waste', 'health', 'projects', 'budget', 'revenue', 'wards'] as IntelligenceDomain[],
        r.int(1, 3),
      ),
    }
  }).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))

  AI_RISK_REGISTER = RISK_SPECS.map((spec, i) => {
    const r = det(`airisk:${spec.category}`)
    const inherent = ratingFrom(spec.likelihood, spec.impact)
    const ladder: Severity[] = ['low', 'medium', 'high', 'critical']
    const residualIdx = Math.max(0, ladder.indexOf(inherent) - (spec.controls.length >= 4 ? 2 : 1))
    return {
      id: `airisk-${String(i + 1).padStart(2, '0')}`,
      tenantId: TENANT_ID,
      category: spec.category,
      description: spec.description,
      likelihood: spec.likelihood,
      impact: spec.impact,
      inherentRating: inherent,
      residualRating: ladder[residualIdx] as Severity,
      controls: spec.controls,
      ownerId: spec.ownerId,
      reviewDue: isoDaysFromAnchor(r.int(8, 120)),
      status: r.weighted([
        ['monitoring', 5],
        ['mitigated', 3],
        ['open', 2],
        ['accepted', 1],
      ] as const),
    }
  })

  /** ---------------------------------------------------------------------
   * Human oversight
   * ------------------------------------------------------------------- */

  const oversightCount = scaledCount(60, scale.population, 6)

  HUMAN_OVERSIGHT = AI_REQUESTS.filter((r) => r.reviewStatus !== 'not-required')
    .slice(0, oversightCount)
    .map((request, i) => {
      const r = det(`oversight:${request.id}`)
      const reviewed = request.reviewStatus !== 'pending'
      return {
        id: `hov-${String(i + 1).padStart(4, '0')}`,
        tenantId: TENANT_ID,
        aiRequestId: request.id,
        recommendationTitle: request.prompt,
        useCase: request.useCase,
        submittedAt: request.requestedAt,
        reviewerId: reviewed ? r.pick(['user-commissioner', 'user-ai-governance', 'user-chief-engineer', 'user-disaster']) : undefined,
        reviewedAt: reviewed ? isoFromAnchor(-r.int(2, 900)) : undefined,
        outcome: request.reviewStatus === 'not-required' ? 'pending' : request.reviewStatus,
        modificationNote:
          request.reviewStatus === 'modified'
            ? t('Scope of the recommendation narrowed by the reviewing officer before acceptance; original output retained in the record.')
            : request.reviewStatus === 'rejected'
              ? t('Rejected: the recommendation did not account for a constraint known to the department but not represented in the platform data.')
              : undefined,
        domain: request.domains[0] ?? 'executive',
        severity: r.weighted([
          ['high', 3],
          ['medium', 5],
          ['low', 2],
        ] as const),
      }
    })

  AI_INCIDENTS = aiIncidentRecords()

  AGENT_WORKFLOWS = agentWorkflowRecords()

  AI_AGENTS = AGENT_SPECS.map((spec) => {
    const r = det(`ai-agent:${spec.id}`)
    return {
      id: spec.id,
      tenantId: TENANT_ID,
      name: spec.name,
      purpose: spec.purpose,
      domain: spec.domain,
      stage: spec.stage,
      status: spec.stage === 'draft' ? ('draft' as const) : ('active' as const),
      modelId: spec.modelId,
      ownerId: spec.ownerId,
      autonomyLevel: 'advisory-only' as const,
      runsLast30d: r.int(4, 180),
      humanApprovalRate: r.int(72, 99),
      reservedActs: spec.reservedActs,
      lastRunAt: isoFromAnchor(-r.int(30, 5000)),
    }
  })

  AI_AGENT_BY_ID = new Map(AI_AGENTS.map((a) => [a.id, a]))

  AI_EVALUATIONS = AI_MODELS.map((model) => {
    const r = det(`ai-eval:${model.id}`)

    // A model recorded as failing is scored below threshold on one dimension; a
    // re-evaluation-due model is close to its thresholds; a passed model clears
    // them. This keeps the evaluation evidence consistent with the model's
    // recorded status rather than contradicting it.
    const dimensions = EVAL_DIMENSIONS.map((dim, i) => {
      let score: number
      if (model.evaluationStatus === 'failed' && i === 2) {
        score = r.int(60, dim.threshold - 4)
      } else if (model.evaluationStatus === 're-evaluation-due') {
        score = r.int(dim.threshold - 3, dim.threshold + 5)
      } else if (model.evaluationStatus === 'not-started' || model.evaluationStatus === 'in-progress') {
        score = r.int(dim.threshold - 8, dim.threshold + 6)
      } else {
        score = r.int(dim.threshold + 2, 98)
      }
      return {
        id: dim.id,
        label: dim.label,
        score,
        threshold: dim.threshold,
        passed: score >= dim.threshold,
        detail: dim.detail,
      }
    })

    const compositeScore = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
    const allPassed = dimensions.every((d) => d.passed)
    const verdict: AIEvaluation['verdict'] =
      model.evaluationStatus === 're-evaluation-due'
        ? 're-evaluation-due'
        : allPassed
          ? 'passed'
          : 'failed'

    // The held-out case set is a property of the evaluation programme, not of
    // the corporation - the same cases are run whoever the deployment serves.
    // The summary quotes this figure rather than drawing its own, so the
    // narrative and the recorded count can never disagree.
    const caseCount = r.int(220, 1400)

    return {
      id: `eval-${model.id}`,
      tenantId: TENANT_ID,
      modelId: model.id,
      modelName: model.name,
      modelVersion: model.version,
      evaluatedAt: model.lastEvaluatedAt,
      reviewerId: 'user-ai-governance',
      verdict,
      caseCount,
      dimensions,
      compositeScore,
      summary:
        verdict === 'passed'
          ? t('{0} v{1} cleared all six evaluation dimensions over {2} held-out cases and is approved for its declared uses.', model.name, model.version, caseCount)
          : verdict === 'failed'
            ? t('{0} v{1} fell below the refusal-discipline threshold. It is withheld from its declared uses pending remediation and re-evaluation.', model.name, model.version)
            : t('{0} v{1} sits close to threshold on several dimensions. A re-evaluation is due before its approval is extended.', model.name, model.version),
    }
  })

  AI_EVALUATION_BY_MODEL = new Map(AI_EVALUATIONS.map((e) => [e.modelId, e]))
})
