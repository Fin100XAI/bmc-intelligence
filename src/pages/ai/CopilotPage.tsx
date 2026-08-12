import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertOctagon,
  ArrowLeftRight,
  Ban,
  BookmarkPlus,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ClipboardPlus,
  Compass,
  Copy,
  CornerDownRight,
  Droplets,
  FileSearch,
  Gauge,
  Gavel,
  Info,
  Landmark,
  Layers,
  ListOrdered,
  MapPinned,
  MessagesSquare,
  Plus,
  Radar,
  RefreshCw,
  Route,
  ScanSearch,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TriangleAlert,
  Waves,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceAction } from '@/hooks'
import {
  actionService,
  aiService,
  decisionService,
  type ActionCreateInput,
  type AIRequestInput,
  type DecisionCreateInput,
} from '@/services'
import { useCurrentUser } from '@/stores/auth.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useDrawerStore } from '@/stores/ui.store'
import { useCopilotStore, type CopilotMessage, type MessageActionState } from '@/stores/copilot.store'
import { classificationCeiling, describeScope, getRole } from '@/security'
import { evaluateGatewayPolicy, getAIProvider } from '@/ai'
import { departmentName, wardShortName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatDateTime, formatRelative, sanitiseText, truncate } from '@/utils/format'
import { cn } from '@/utils/cn'
import { CLASSIFICATION_ORDER, DOMAIN_LABEL, type DataClassification } from '@/types/common'
import type { RoleId, User } from '@/types/organisation'
import type { AICitation, AIEntityKind, AIInterpretation, AIResponse, AIUseCase } from '@/types/ai'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ClassificationBadge,
  ConfidenceBadge,
  ConfirmDialog,
  DemonstrationNotice,
  IconButton,
  Tabs,
  Textarea,
} from '@/components/ui'
import { AIRecommendationCard } from '@/components/cards/domain-cards'
import { AnswerVisuals } from '@/components/ai/AnswerVisuals'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/ai/CopilotPage.tsx
 *
 * The active corporation's Municipal Copilot — a governed intelligence
 * assistant, not a general chatbot.
 *
 * The visual brief is a specific one: this is the screen most likely to be
 * demonstrated to someone who has never seen the platform, so it has to carry
 * institutional weight without becoming a wall. Two rules hold the layout
 * together.
 *
 * **Room over density.** Every other screen in this platform is a dense
 * operational instrument, and correctly so. This one is a reading surface: the
 * answer is set larger and looser than the platform baseline, one idea occupies
 * one band, and anything that is not the answer — provenance, evidence,
 * recommended actions — sits behind a tab rather than stacking underneath it.
 * A governed answer nobody finishes reading has governed nothing.
 *
 * **Authority over ornament.** The depth here comes from layering, hairlines
 * and restraint, not from colour. The only saturated surface on the page is the
 * operator's own question; the assistant answers on white. Where colour does
 * appear it is carrying meaning — a refusal is amber, evidence-backed is green,
 * and neither is decorative.
 *
 * **A stated reading before a confident answer.** Every substantive answer
 * opens with how the question was read: the route, the strength of that match,
 * and the entities it bound. The dangerous failure of a municipal assistant is
 * not a wrong figure — it is a fluent answer to a question nobody asked, which
 * an operator has no way to notice. So the reading is published above the
 * answer, a weak match is drawn as weak, and a misreading is one click from
 * being corrected.
 *
 * Everything the assistant produces stays advisory. It analyses, explains and
 * recommends; a named officer decides, every time.
 */

interface SuggestedPrompt {
  label: string
  question: string
  icon: ReactNode
}

/** Renders a lucide icon at the prompt-card size. */
function icon(Node: typeof Compass): ReactNode {
  return <Node className="h-4 w-4" />
}

function suggestedPromptsForRole(roleId: RoleId): SuggestedPrompt[] {
  switch (roleId) {
    case 'finance-officer':
      return [
        { label: t('Budget variance'), question: t('Show me department budget variance against the phased plan.'), icon: icon(Landmark) },
        { label: t('Revenue risks'), question: t('What are the current revenue risks?'), icon: icon(TrendingDown) },
        { label: t('Collection patterns'), question: t('Are there any unusual collection patterns?'), icon: icon(Building2) },
        { label: t('Project delays'), question: t('Which capital projects are showing schedule risk or delay?'), icon: icon(Compass) },
      ]
    case 'chief-engineer':
      return [
        { label: t('Schedule risk'), question: t('Which projects carry the highest schedule risk?'), icon: icon(Compass) },
        { label: t('Road assets'), question: t('Which road assets need intervention?'), icon: icon(Route) },
        { label: t('Water supply'), question: t('What is the current water supply position?'), icon: icon(Droplets) },
        { label: t('Monsoon readiness'), question: t('How prepared are we for this monsoon?'), icon: icon(Waves) },
      ]
    case 'ward-officer':
      return [
        { label: t('My attention today'), question: t('What requires my attention today?'), icon: icon(MapPinned) },
        { label: t('Rising complaints'), question: t('Why are complaints increasing in my ward?'), icon: icon(TrendingDown) },
        { label: t('Services below SLA'), question: t('Which services are below SLA in my ward?'), icon: icon(MessagesSquare) },
        { label: t('Monsoon readiness'), question: t('How prepared are we for this monsoon?'), icon: icon(Waves) },
      ]
    case 'municipal-commissioner':
    case 'additional-commissioner':
    case 'deputy-commissioner':
    default:
      return [
        { label: t('Highest operational risks'), question: t('What are the five highest operational risks right now?'), icon: icon(TriangleAlert) },
        { label: t('Wards needing attention'), question: t('Which wards need the most attention?'), icon: icon(MapPinned) },
        { label: t('Project delays'), question: t('Which capital projects are showing schedule risk or delay?'), icon: icon(Compass) },
        { label: t('Monsoon readiness'), question: t('How prepared are we for this monsoon?'), icon: icon(Waves) },
      ]
  }
}

/**
 * The fallback follow-up map, keyed by the domains an answer touched.
 *
 * The engine now states the questions its own retrieved position raises, and
 * those are always preferred: a follow-up drawn from the actual finding beats
 * one inferred from a domain label. This map still answers for responses that
 * carry none — a generic "tell me more" teaches nothing, while a pointer at the
 * neighbouring domain is how an operator finds the connection they did not know
 * to ask about.
 */
const DOMAIN_FOLLOW_UP: Partial<Record<string, string>> = {
  monsoon: 'How prepared are we for this monsoon?',
  water: 'What is the current water supply position?',
  roads: 'Which road assets need intervention?',
  budget: 'Show me department budget variance against the phased plan.',
  revenue: 'What are the current revenue risks?',
  projects: 'Which capital projects are showing schedule risk or delay?',
  health: 'Are there any public health signals I should know about?',
  wards: 'Which wards need the most attention?',
  'citizen-services': 'Which citizen services are deteriorating?',
  stormwater: 'Where is waterlogging risk concentrated?',
  procurement: 'Are there any unusual procurement patterns?',
}

function build$BLOCKED_EXAMPLE() {
  return {
  label: t('Try a request the platform must decline'),
  question: t('Approve the payment for contract PWD-2024-0182.'),
}
}
let BLOCKED_EXAMPLE: ReturnType<typeof build$BLOCKED_EXAMPLE> = build$BLOCKED_EXAMPLE()
registerLayer(() => {
  BLOCKED_EXAMPLE = build$BLOCKED_EXAMPLE()
})

/** The pipeline an operator watches while a question is in flight. */
const PIPELINE_STAGES = [
  { id: 'gateway', label: 'Gateway policy', detail: 'Reserved acts refused before any model is called' },
  { id: 'retrieval', label: 'Retrieval', detail: 'Locating the records that bear on the question' },
  { id: 'scope', label: 'Scope filter', detail: 'Withholding anything outside your authorised scope' },
  { id: 'compose', label: 'Composition', detail: 'Assembling the answer with its evidence and limits' },
] as const

function isBlockedResponse(response: AIResponse): boolean {
  return response.sources.some((s) => s.toLowerCase().includes('gateway policy'))
}

/* ==========================================================================
   The reading vocabulary — how a bound entity and a match strength are drawn
   ========================================================================== */

function build$ENTITY_KIND(): Record<AIEntityKind, { caption: string; icon: ReactNode }> {
  return {
  ward: { caption: t('Ward'), icon: <MapPinned className="h-3 w-3" /> },
  zone: { caption: t('Zone'), icon: <Layers className="h-3 w-3" /> },
  department: { caption: t('Department'), icon: <Building2 className="h-3 w-3" /> },
  domain: { caption: t('Domain'), icon: <Radar className="h-3 w-3" /> },
  condition: { caption: t('Condition'), icon: <Stethoscope className="h-3 w-3" /> },
  severity: { caption: t('Severity'), icon: <Gauge className="h-3 w-3" /> },
  limit: { caption: t('Result limit'), icon: <ListOrdered className="h-3 w-3" /> },
  comparison: { caption: t('Comparison'), icon: <ArrowLeftRight className="h-3 w-3" /> },
}
}
let ENTITY_KIND: Record<AIEntityKind, { caption: string; icon: ReactNode }> = build$ENTITY_KIND()
registerLayer(() => {
  ENTITY_KIND = build$ENTITY_KIND()
})

type ReadingStrength = 'strong' | 'partial' | 'weak'

/**
 * Bands set against the scorer in `src/ai/nlu.ts`, not chosen for looks. One
 * anchor term scores exactly the floor at which a route is considered earned at
 * all, which lands at 50; below that the engine has fallen back and the route
 * name is a best guess rather than a reading. Two anchors, or an anchor with
 * supporting terms, clears 75 and is a genuine match.
 */
function readingStrength(matchStrength: number): ReadingStrength {
  if (matchStrength >= 75) return 'strong'
  if (matchStrength >= 50) return 'partial'
  return 'weak'
}

/**
 * A weak reading has to *read* as weak. The surface, the badge and the sentence
 * all move together, because an operator who skims one of the three and misses
 * the other two must still come away doubting the answer rather than trusting
 * it. Dressing a guess as a confident reading is the specific dishonesty this
 * strip exists to prevent.
 */
function build$STRENGTH_STYLE(): Record<
  ReadingStrength,
  { label: string; sentence?: string; surface: string; rail: string; meter: string; badge: 'info' | 'warn' | 'risk' }
> {
  return {
  strong: {
    label: t('Strong match'),
    surface: 'border-ink-100 bg-surface-sunken/50',
    rail: 'bg-govt-500',
    meter: 'bg-govt-500',
    badge: 'info',
  },
  partial: {
    label: t('Partial match'),
    sentence:
      'This route scored highest, but the wording only partly selected it. Check the reading below before relying on the answer.',
    surface: 'border-warn-200/80 bg-warn-50/35',
    rail: 'bg-warn-500',
    meter: 'bg-warn-500',
    badge: 'warn',
  },
  weak: {
    label: t('Weak match'),
    sentence:
      'No retrieval route was clearly selected by this wording. What follows is the closest reading available — treat it as a starting point, not as an answer to the question you asked.',
    surface: 'border-risk-300/80 bg-risk-50/45',
    rail: 'bg-risk-500',
    meter: 'bg-risk-500',
    badge: 'risk',
  },
}
}
let STRENGTH_STYLE: Record<
  ReadingStrength,
  { label: string; sentence?: string; surface: string; rail: string; meter: string; badge: 'info' | 'warn' | 'risk' }
> = build$STRENGTH_STYLE()
registerLayer(() => {
  STRENGTH_STYLE = build$STRENGTH_STYLE()
})

function buildRequestInput(question: string, response: AIResponse, latencyMs: number): AIRequestInput {
  const blocked = isBlockedResponse(response)
  const classification = response.evidence.reduce<DataClassification>(
    (max, e) => (CLASSIFICATION_ORDER[e.classification] > CLASSIFICATION_ORDER[max] ? e.classification : max),
    'internal',
  )
  return {
    useCase: response.useCase,
    prompt: question,
    promptTemplateId: 'prompt-copilot-municipal-query',
    modelId: response.modelId,
    provider: getAIProvider().id,
    latencyMs,
    confidence: response.confidence,
    grounding: response.grounding,
    citationCount: response.evidence.length,
    reviewStatus: response.recommendedActions.length > 0 ? 'pending' : 'not-required',
    policyStatus: blocked ? 'blocked' : 'passed',
    policyNote: blocked ? 'Blocked at the AI gateway before reaching any model - see the recorded answer.' : undefined,
    classification,
    tokensIn: Math.max(8, Math.ceil(question.length / 4)),
    tokensOut: Math.max(8, Math.ceil(response.answer.length / 4)),
    domains: response.domains,
  }
}

function buildDecisionInput(question: string, response: AIResponse, user: User): DecisionCreateInput {
  const primary = response.recommendedActions[0]
  const domain = response.domains[0] ?? 'executive'
  return {
    title: truncate(response.keyFindings[0] ?? question, 120),
    problemStatement: response.answer,
    background:
      response.keyFindings.length > 0
        ? response.keyFindings.join(' ')
        : `Raised directly from a Copilot query: "${question}"`,
    domain,
    departmentIds: [primary?.departmentId ?? user.departmentId],
    wardIds: [],
    financialImpactCrore: 0,
    citizenImpact: 'Not yet formally assessed. Raised from a Copilot analysis for review by the competent authority.',
    recommendationSummary: primary?.title ?? 'See the attached Copilot analysis for the suggested next step.',
    evidenceIds: response.evidence.map((e) => e.evidenceId).filter((v): v is string => Boolean(v)),
    severity: response.evidence.length > 0 ? 'medium' : 'low',
    classification: 'internal',
  }
}

function buildActionInput(question: string, response: AIResponse, user: User): ActionCreateInput {
  const primary = response.recommendedActions[0]
  const domain = response.domains[0] ?? 'executive'
  return {
    title: truncate(primary?.title ?? response.keyFindings[0] ?? question, 120),
    description: primary?.why ?? response.answer,
    ownerId: user.id,
    departmentId: primary?.departmentId ?? user.departmentId,
    wardIds: [],
    priority: 'medium',
    dueDate: isoFromAnchor(7 * 24 * 60),
    domain,
    classification: 'internal',
    evidenceIds: response.evidence.map((e) => e.evidenceId).filter((v): v is string => Boolean(v)),
  }
}

export function CopilotPage(): React.JSX.Element {
  const user = useCurrentUser()
  const corporation = useActiveCorporation()
  const openDrawer = useDrawerStore((s) => s.open)

  // The thread, the ledger and the composer live in the session store, not in
  // this component. An operator who opens a decision case raised from an answer
  // and comes back must find the conversation still here — losing it discards
  // the only record of what was asked and what was raised from it.
  const messages = useCopilotStore((s) => s.messages)
  const actionState = useCopilotStore((s) => s.actionState)
  const escalations = useCopilotStore((s) => s.escalations)
  const situationRoom = useCopilotStore((s) => s.situationRoom)
  const input = useCopilotStore((s) => s.input)
  const setInput = useCopilotStore((s) => s.setInput)
  const takeMessageId = useCopilotStore((s) => s.takeMessageId)
  const appendMessage = useCopilotStore((s) => s.appendMessage)
  const patchMessage = useCopilotStore((s) => s.patchMessage)
  const patchActionState = useCopilotStore((s) => s.patchActionState)
  const pushEscalation = useCopilotStore((s) => s.pushEscalation)
  const pushSituationRoom = useCopilotStore((s) => s.pushSituationRoom)
  const clearSession = useCopilotStore((s) => s.resetSession)

  // Dialog targets stay local: they are the state of a modal that is open on
  // this screen right now, not part of the session an operator navigates with.
  const [escalateTarget, setEscalateTarget] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const busy = messages.some((m) => m.status === 'loading')

  const recordRequest = useServiceAction(
    (u, record: AIRequestInput) => aiService.recordRequest(u, record),
    [['bmc-mii', 'ai']],
  )
  const createDecision = useServiceAction(
    (u, input2: DecisionCreateInput) => decisionService.create(u, input2),
    [['bmc-mii', 'decisions']],
  )
  // A task raised here is owned by the officer raising it, so it lands on their
  // own "My Tasks" board - that view has to be invalidated alongside the action
  // list, or the board keeps serving a cached answer that predates the task.
  const createTask = useServiceAction(
    (u, input2: ActionCreateInput) => actionService.create(u, input2),
    [['bmc-mii', 'actions'], ['bmc-mii', 'my-tasks'], ['bmc-mii', 'action']],
  )
  const saveBrief = useServiceAction(
    (u, useCase: AIUseCase, title: string, response: AIResponse) => aiService.saveBrief(u, useCase, title, response),
    [['bmc-mii', 'ai']],
  )

  // Pin to the newest turn as it arrives. Feature-checked rather than assumed:
  // `scrollIntoView` is not implemented in every DOM the app mounts in, and a
  // convenience behaviour must never be able to take the page down with it.
  useEffect(() => {
    if (messages.length === 0) return
    const end = threadEndRef.current
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'end' })
  }, [messages])

  const sessionLedger = useMemo(() => {
    const answered = messages.filter((m) => m.status === 'done' && m.response)
    const states = Object.values(actionState)
    return {
      asked: messages.length,
      answered: answered.length,
      evidenceCited: new Set(answered.flatMap((m) => (m.response?.evidence ?? []).map((e) => e.id))).size,
      blocked: answered.filter((m) => m.response && isBlockedResponse(m.response)).length,
      decisions: states.filter((s) => s.decisionId).length,
      tasks: states.filter((s) => s.taskId).length,
      briefs: states.filter((s) => s.saved).length,
    }
  }, [messages, actionState])

  if (!user) {
    return (
      <PageBody>
        <PageHeader
          eyebrow={t('AI & Automation')}
          title={t('{0} Municipal Copilot', corporation.city)}
          breadcrumbs={[{ label: t('AI & Automation') }, { label: t('Copilot') }]}
        />
        <Card>{t('No authenticated principal is available.')}</Card>
      </PageBody>
    )
  }

  // Past the guard above, so the principal is known. Bound to a local because
  // the handlers below are hoisted function declarations, which TypeScript
  // analyses before the guard has narrowed `user`.
  const principal: User = user
  const role = getRole(principal.roleId)
  const prompts = suggestedPromptsForRole(principal.roleId)
  const ceiling = classificationCeiling(principal)

  async function ask(rawQuestion: string): Promise<void> {
    const question = sanitiseText(rawQuestion, 1000)
    if (!question || busy) return
    const id = takeMessageId()
    appendMessage({ id, question, askedAt: isoFromAnchor(0), status: 'loading' })
    setInput('')
    const started = performance.now()
    try {
      const provider = getAIProvider()
      const response = await provider.answerMunicipalQuery({ user: principal, question }, question)
      const latencyMs = Math.round(performance.now() - started)
      patchMessage(id, { status: 'done', response, latencyMs })
      recordRequest(buildRequestInput(question, response, latencyMs)).catch(() => undefined)
    } catch (err) {
      patchMessage(id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'The Copilot could not process this request.',
      })
    }
  }

  async function handleCreateDecision(message: CopilotMessage): Promise<void> {
    if (!message.response) return
    const created = await createDecision(buildDecisionInput(message.question, message.response, principal))
    patchActionState(message.id, { decisionId: created.id, decisionRef: created.reference })
    openDrawer({ kind: 'decision', id: created.id })
  }

  async function handleCreateTask(message: CopilotMessage): Promise<void> {
    if (!message.response) return
    const created = await createTask(buildActionInput(message.question, message.response, principal))
    patchActionState(message.id, { taskId: created.id, taskRef: created.reference })
    openDrawer({ kind: 'action', id: created.id })
  }

  async function handleSaveBrief(message: CopilotMessage): Promise<void> {
    if (!message.response) return
    await saveBrief(message.response.useCase, truncate(message.question, 90), message.response)
    patchActionState(message.id, { saved: true })
  }

  function handleAddToSituationRoom(message: CopilotMessage): void {
    pushSituationRoom({ id: message.id, title: truncate(message.question, 90), at: isoFromAnchor(0) })
    patchActionState(message.id, { inSituationRoom: true })
  }

  function handleEscalateConfirm(reason: string): void {
    if (!escalateTarget) return
    const message = messages.find((m) => m.id === escalateTarget)
    pushEscalation({ id: escalateTarget, title: truncate(message?.question ?? '', 90), reason, at: isoFromAnchor(0) })
    patchActionState(escalateTarget, { escalated: true })
    setEscalateTarget(null)
  }

  function resetSession(): void {
    clearSession()
    composerRef.current?.focus()
  }


  return (
    <PageBody width="full">
      <PageHeader
        eyebrow={t('AI & Automation')}
        title={t('{0} Municipal Copilot', corporation.city)}
        description={t('A governed intelligence assistant grounded in the platform\'s own operational records. Every answer states its evidence, its confidence and its limitations.')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('{0} Municipal Copilot', corporation.city) }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={messages.length === 0}
              onClick={() => setResetOpen(true)}
            >
              {t('New session')}
            </Button>
          </div>
        }
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        {/* ---------------------------------------------- Conversation */}
        <Card
          flush
          className="relative flex min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-2xl shadow-raised xl:h-[calc(100vh-14rem)]"
        >
          {/* A single hairline of institutional colour along the top edge. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-govt-500/0 via-govt-500/60 to-intel-500/0"
          />

          <div className="scrollbar-slim min-w-0 flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <Hero city={corporation.city} prompts={prompts} roleName={role?.name} onAsk={(q) => void ask(q)} />
            ) : (
              <div className="mx-auto w-full max-w-4xl space-y-7 px-5 py-6 sm:px-7">
                {messages.map((message) => (
                  <Turn
                    key={message.id}
                    message={message}
                    actionState={actionState[message.id]}
                    onOpenEvidence={(citation) =>
                      citation.evidenceId && openDrawer({ kind: 'evidence', id: citation.evidenceId })
                    }
                    onCreateDecision={() => void handleCreateDecision(message)}
                    onCreateTask={() => void handleCreateTask(message)}
                    onEscalate={() => setEscalateTarget(message.id)}
                    onAddToSituationRoom={() => handleAddToSituationRoom(message)}
                    onSaveBrief={() => void handleSaveBrief(message)}
                    onRetry={() => void ask(message.question)}
                    onFollowUp={(q) => void ask(q)}
                    busy={busy}
                  />
                ))}
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Composer ------------------------------------------------- */}
          <div className="shrink-0 border-t border-ink-100 bg-surface-sunken/60 px-5 py-4 sm:px-7">
            <form
              className="mx-auto w-full max-w-4xl"
              onSubmit={(e) => {
                e.preventDefault()
                void ask(input)
              }}
            >
              <div
                className={cn(
                  'rounded-2xl border border-ink-200 bg-surface p-2 shadow-card transition-all',
                  'focus-within:border-govt-300 focus-within:ring-4 focus-within:ring-govt-500/10',
                )}
              >
                <label htmlFor="copilot-composer" className="sr-only">
                  {t('Ask the Copilot')}
                </label>
                <Textarea
                  id="copilot-composer"
                  ref={composerRef}
                  rows={2}
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter breaks the line — the
                    // convention every operator already has in their fingers.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void ask(input)
                    }
                  }}
                  placeholder={t('Ask about {0}\'s risks, wards, projects, budget or service delivery…', corporation.city)}
                  className="resize-none border-0 bg-transparent px-2 py-1.5 text-[0.875rem] leading-6 shadow-none focus:ring-0"
                />
                <div className="flex items-center gap-2 px-2 pt-1">
                  <p className="text-[0.625rem] text-ink-400">
                    <kbd className="rounded border border-ink-200 bg-ink-50 px-1 font-sans">{t('Enter')}</kbd>{' '}{t('to ask ·')}{' '}
                    <kbd className="rounded border border-ink-200 bg-ink-50 px-1 font-sans">{t('Shift')}</kbd>+
                    <kbd className="rounded border border-ink-200 bg-ink-50 px-1 font-sans">{t('Enter')}</kbd>{' '}{t('for a new line')}
                  </p>
                  <div className="flex-1" />
                  {input.length > 800 ? (
                    <span className={cn('numeric text-[0.625rem]', input.length > 1000 ? 'text-crit-600' : 'text-warn-600')}>
                      {input.length} / 1000
                    </span>
                  ) : null}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    icon={<Send className="h-3.5 w-3.5" />}
                    disabled={input.trim().length === 0 || busy}
                  >
                    {t('Ask')}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </Card>

        {/* ---------------------------------------------------- Inspector */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="rounded-2xl">
            <CardHeader
              icon={<ShieldAlert className="h-4 w-4" />}
              title={t('Your authority')}
              description={t('Answers are bounded by what you may see — not by the assistant\'s willingness.')}
            />
            <dl className="mt-4 space-y-2.5 text-xs">
              <RailRow label={t('Acting as')} value={role?.name ?? principal.roleId} />
              <RailRow label={t('Department')} value={departmentName(principal.departmentId)} />
              <RailRow label={t('Scope')} value={describeScope(principal, wardShortName)} />
              <RailRow
                label={t('Classification ceiling')}
                value={<ClassificationBadge classification={ceiling} showIcon={false} />}
              />
            </dl>
            <p className="mt-3.5 border-t border-ink-100 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('The Copilot analyses, recommends and explains — it never decides. Approving expenditure, sanctioning payment or issuing an order always requires a named officer and cannot be completed here.')}
            </p>
          </Card>

          {messages.length > 0 ? (
            <Card className="rounded-2xl">
              <CardHeader icon={<Sparkles className="h-4 w-4" />} title={t('Ask next')} />
              <div className="mt-3 flex flex-col gap-1.5">
                {prompts.map((p) => (
                  <button
                    key={p.question}
                    type="button"
                    disabled={busy}
                    onClick={() => void ask(p.question)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-snug text-ink-600 transition-colors',
                      'hover:bg-govt-50/70 hover:text-govt-800 focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <span className="shrink-0 text-ink-400">{p.icon}</span>
                    <span className="min-w-0 truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          {sessionLedger.decisions + sessionLedger.tasks + sessionLedger.briefs > 0 ||
          escalations.length > 0 ||
          situationRoom.length > 0 ? (
            <Card className="rounded-2xl">
              <CardHeader
                icon={<ClipboardPlus className="h-4 w-4" />}
                title={t('Raised from this session')}
                description={t('What left this surface and became a record elsewhere.')}
              />
              <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
                <LedgerStat label={t('Decisions')} value={sessionLedger.decisions} />
                <LedgerStat label={t('Tasks')} value={sessionLedger.tasks} />
                <LedgerStat label={t('Briefs')} value={sessionLedger.briefs} />
              </div>

              {escalations.length > 0 ? (
                <div className="mt-3.5 border-t border-ink-100 pt-3">
                  <p className="label-institutional mb-2 flex items-center gap-1.5">
                    <Siren className="h-3 w-3" />{' '}{t('Escalations')}
                  </p>
                  <ul className="space-y-1.5">
                    {escalations.map((e) => (
                      <li key={`${e.id}-${e.at}`} className="rounded-lg border border-warn-200 bg-warn-50/40 p-2.5 text-xs">
                        <p className="font-medium text-ink-800">{e.title}</p>
                        <p className="mt-0.5 leading-relaxed text-ink-600">{e.reason}</p>
                        <p className="mt-1 text-[0.625rem] text-ink-400">{formatRelative(e.at)}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-500">
                    {t('Session-local. Not a substitute for the formal Alerts &amp; Escalations register.')}
                  </p>
                </div>
              ) : null}

              {situationRoom.length > 0 ? (
                <div className="mt-3.5 border-t border-ink-100 pt-3">
                  <p className="label-institutional mb-2 flex items-center gap-1.5">
                    <Compass className="h-3 w-3" />{' '}{t('Added to Situation Room')}
                  </p>
                  <ul className="space-y-1.5">
                    {situationRoom.map((s) => (
                      <li key={`${s.id}-${s.at}`} className="rounded-lg border border-govt-200 bg-govt-50/40 p-2.5 text-xs">
                        <p className="font-medium text-ink-800">{s.title}</p>
                        <p className="mt-1 text-[0.625rem] text-ink-400">{formatRelative(s.at)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={escalateTarget !== null}
        onClose={() => setEscalateTarget(null)}
        onConfirm={handleEscalateConfirm}
        title={t('Escalate this analysis')}
        description={t('State why this requires escalation. This is recorded for this session and should be followed by a formal escalation through Alerts & Escalations where the underlying condition warrants it.')}
        confirmLabel={t('Escalate')}
        intent="critical"
        requireReason
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          resetSession()
          setResetOpen(false)
        }}
        title={t('Start a new session?')}
        description={t('This conversation, its escalations and its Situation Room references are cleared from this browser. Decision cases, tasks and saved briefs already raised are institutional records and are not affected — they remain in their own modules.')}
        confirmLabel={t('New session')}
        intent="primary"
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

/* ==========================================================================
   Rail furniture
   ========================================================================== */

function RailRow({ label, value }: { label: string; value: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-800">{value}</dd>
    </div>
  )
}

function LedgerStat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-surface-sunken px-2 py-2">
      <p className="numeric text-lg font-semibold text-ink-900">{value}</p>
      <p className="mt-px text-[0.625rem] text-ink-500">{label}</p>
    </div>
  )
}

/* ==========================================================================
   Hero — the opening state, and the one moment this page gets to make a case
   for itself before an operator has typed anything
   ========================================================================== */

function Hero({
  city,
  prompts,
  roleName,
  onAsk,
}: {
  city: string
  prompts: SuggestedPrompt[]
  roleName?: string
  onAsk: (question: string) => void
}): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 py-12 text-center sm:px-7 sm:py-16">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-intel-400/30 to-govt-500/30 blur-lg"
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-surface shadow-card ring-1 ring-ink-100">
          <Bot className="h-6 w-6 text-govt-600" />
        </span>
      </span>

      <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink-900">{t('Ask the {0} Municipal Copilot', city)}</h2>
      <p className="mt-2.5 max-w-xl text-[0.875rem] leading-7 text-ink-500">
        {t('A governed assistant answering from this corporation&apos;s own operational record. Every answer arrives with the evidence it rests on, the confidence it carries and the limits of what it can support — bounded by what {0} is authorised to see.', roleName ? `a ${roleName}` : 'your role')}
      </p>

      <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p.question}
            type="button"
            onClick={() => onAsk(p.question)}
            className={cn(
              'lift-on-hover group flex items-start gap-3 rounded-xl border border-ink-100 bg-surface p-3.5 text-left shadow-xs transition-all',
              'hover:border-govt-200 hover:shadow-card focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
            )}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-govt-50 text-govt-600 ring-1 ring-govt-100 transition-colors group-hover:bg-govt-100">
              {p.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-semibold text-ink-800">{p.label}</span>
              <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-ink-500">{p.question}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAsk(BLOCKED_EXAMPLE.question)}
        title={t('Demonstrates the AI gateway\'s prohibited-intent policy.')}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-warn-300/80 bg-warn-50/30 px-3.5 py-2.5 text-xs text-warn-700 transition-colors',
          'hover:bg-warn-50/70 focus-visible:ring-2 focus-visible:ring-warn-500/30 focus-visible:outline-none',
        )}
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{BLOCKED_EXAMPLE.label}</span>
        <span className="hidden opacity-75 sm:inline">{t('— watch it refuse at the gateway')}</span>
      </button>
    </div>
  )
}

/* ==========================================================================
   Thread
   ========================================================================== */

function Turn({
  message,
  actionState,
  onOpenEvidence,
  onCreateDecision,
  onCreateTask,
  onEscalate,
  onAddToSituationRoom,
  onSaveBrief,
  onRetry,
  onFollowUp,
  busy,
}: {
  message: CopilotMessage
  actionState?: MessageActionState
  onOpenEvidence: (citation: AICitation) => void
  onCreateDecision: () => void
  onCreateTask: () => void
  onEscalate: () => void
  onAddToSituationRoom: () => void
  onSaveBrief: () => void
  onRetry: () => void
  onFollowUp: (question: string) => void
  busy: boolean
}): React.JSX.Element {
  return (
    <div className="animate-in-rise space-y-3.5">
      {/* The operator's turn — the only saturated surface on the page. */}
      <div className="flex justify-end">
        <div className="max-w-[38rem] rounded-2xl rounded-br-md bg-gradient-to-b from-govt-600 to-govt-700 px-4 py-3 text-[0.875rem] leading-6 text-white shadow-[0_1px_3px_0_rgb(26_63_175/0.35)]">
          <p className="whitespace-pre-wrap">{message.question}</p>
        </div>
      </div>

      {/* The assistant's turn. */}
      {message.status === 'loading' ? <ThinkingRail question={message.question} /> : null}

      {message.status === 'error' ? (
        <div className="flex items-start gap-3 rounded-2xl border border-crit-200 bg-crit-50/40 p-4">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.875rem] font-semibold text-crit-700">{t('The Copilot could not answer this request')}</p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-600">{message.errorMessage}</p>
            <Button
              size="xs"
              variant="outline"
              className="mt-2.5"
              icon={<RefreshCw className="h-3 w-3" />}
              onClick={onRetry}
              disabled={busy}
            >
              {t('Retry')}
            </Button>
          </div>
        </div>
      ) : null}

      {message.status === 'done' && message.response ? (
        <AnswerPanel
          response={message.response}
          latencyMs={message.latencyMs}
          actionState={actionState}
          onOpenEvidence={onOpenEvidence}
          onCreateDecision={onCreateDecision}
          onCreateTask={onCreateTask}
          onEscalate={onEscalate}
          onAddToSituationRoom={onAddToSituationRoom}
          onSaveBrief={onSaveBrief}
          onFollowUp={onFollowUp}
          busy={busy}
        />
      ) : null}
    </div>
  )
}

/**
 * The pipeline, shown while a question is in flight.
 *
 * The gateway verdict is computed here from the same pure policy function the
 * provider calls, so an operator asking a reserved act watches it stop at stage
 * one rather than seeing a spinner and then a refusal. The remaining stages
 * name what the provider is doing; none claims a measurement it does not have.
 */
function ThinkingRail({ question }: { question: string }): React.JSX.Element {
  const gate = evaluateGatewayPolicy(question)
  return (
    <div
      className="rounded-2xl border border-ink-100 bg-surface-sunken/70 p-4"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink-600">
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-govt-500" />
        {t('Working through your question')}
      </p>
      <ol className="mt-3 space-y-2">
        {PIPELINE_STAGES.map((stage) => {
          const isGateway = stage.id === 'gateway'
          const refusedHere = isGateway && !gate.permitted
          const skipped = !gate.permitted && !isGateway
          return (
            <li key={stage.id} className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  refusedHere ? 'bg-warn-500 ring-2 ring-warn-200' : skipped ? 'bg-ink-200' : 'bg-govt-400',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-[0.75rem] font-medium',
                    refusedHere ? 'text-warn-700' : skipped ? 'text-ink-300' : 'text-ink-700',
                  )}
                >
                  {stage.label}
                  {refusedHere ? ' — refused' : skipped ? ' — not reached' : ''}
                </p>
                <p className={cn('mt-0.5 text-[0.6875rem] leading-relaxed', skipped ? 'text-ink-300' : 'text-ink-500')}>
                  {refusedHere ? `Reserved act: ${gate.blockedIntent}` : stage.detail}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ==========================================================================
   Answer
   ========================================================================== */

type AnswerTab = 'answer' | 'evidence' | 'actions' | 'provenance'

function AnswerPanel({
  response,
  latencyMs,
  actionState,
  onOpenEvidence,
  onCreateDecision,
  onCreateTask,
  onEscalate,
  onAddToSituationRoom,
  onSaveBrief,
  onFollowUp,
  busy,
}: {
  response: AIResponse
  latencyMs?: number
  actionState?: MessageActionState
  onOpenEvidence: (citation: AICitation) => void
  onCreateDecision: () => void
  onCreateTask: () => void
  onEscalate: () => void
  onAddToSituationRoom: () => void
  onSaveBrief: () => void
  onFollowUp: (question: string) => void
  busy: boolean
}): React.JSX.Element {
  const [tab, setTab] = useState<AnswerTab>('answer')
  const [copied, setCopied] = useState(false)
  const blocked = isBlockedResponse(response)
  const acted = Boolean(
    actionState?.decisionId ||
      actionState?.taskId ||
      actionState?.escalated ||
      actionState?.saved ||
      actionState?.inSituationRoom,
  )

  // The engine's own follow-ups come from the position it just retrieved, so
  // they ask what this answer actually raises. The domain map is the fallback
  // for responses that offer none.
  const followUps = useMemo(() => {
    if (response.followUps && response.followUps.length > 0) return response.followUps.slice(0, 2)
    const seen = new Set<string>()
    const out: string[] = []
    for (const domain of response.domains) {
      const q = DOMAIN_FOLLOW_UP[domain]
      if (q && !seen.has(q)) {
        seen.add(q)
        out.push(q)
      }
    }
    return out.slice(0, 2)
  }, [response.domains, response.followUps])

  function copyAnswer(): void {
    const text = [
      response.answer,
      response.keyFindings.length > 0 ? `\nKey findings:\n${response.keyFindings.map((f) => `- ${f}`).join('\n')}` : '',
      `\nConfidence: ${response.confidence} — ${response.confidenceRationale}`,
      response.sources.length > 0 ? `\nSources: ${response.sources.join(' · ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => undefined,
    )
  }

  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border bg-surface shadow-card',
        blocked ? 'border-warn-200' : 'border-ink-100',
      )}
    >
      {/* Identity + verdict, on one line. ------------------------------ */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-b px-5 py-3',
          blocked ? 'border-warn-200 bg-warn-50/50' : 'border-ink-100 bg-gradient-to-r from-govt-50/50 to-transparent',
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
            blocked ? 'bg-warn-100/70 text-warn-700 ring-warn-200' : 'bg-surface text-govt-600 ring-ink-100',
          )}
        >
          <Bot className="h-3.5 w-3.5" />
        </span>

        {blocked ? (
          <Badge tone="warn" icon={<Ban className="h-3 w-3" />}>
            {t('Refused at the AI gateway')}
          </Badge>
        ) : (
          <Badge
            tone={response.grounding === 'evidence-backed' ? 'positive' : 'neutral'}
            icon={<Sparkles className="h-3 w-3" />}
          >
            {response.grounding === 'evidence-backed'
              ? `Evidence-backed · ${response.evidence.length} record${response.evidence.length === 1 ? '' : 's'}`
              : 'General reasoning'}
          </Badge>
        )}
        <ConfidenceBadge confidence={response.confidence} rationale={response.confidenceRationale} />

        <div className="flex-1" />
        {typeof latencyMs === 'number' ? (
          <span className="numeric hidden text-[0.625rem] text-ink-400 sm:inline">{latencyMs} ms</span>
        ) : null}
        <IconButton label={copied ? 'Answer copied' : 'Copy answer'} onClick={copyAnswer}>
          {copied ? <Check className="h-3.5 w-3.5 text-ok-600" /> : <Copy className="h-3.5 w-3.5" />}
        </IconButton>
      </div>

      {/* The reading sits above the tabs rather than inside the Answer tab, so
          it cannot be navigated away from. How a question was read governs
          every tab beneath it — the evidence that was retrieved, the actions
          that were recommended and the provenance recorded all follow from it,
          and none of them can be judged without it. */}
      {response.interpretation ? (
        <InterpretationStrip interpretation={response.interpretation} onAsk={onFollowUp} busy={busy} />
      ) : null}

      <div className="px-5 pt-3">
        <Tabs
          items={[
            { id: 'answer', label: t('Answer') },
            { id: 'evidence', label: t('Evidence'), count: response.evidence.length || undefined },
            { id: 'actions', label: t('Actions'), count: response.recommendedActions.length || undefined },
            { id: 'provenance', label: t('Provenance') },
          ]}
          value={tab}
          onChange={(id) => setTab(id as AnswerTab)}
          ariaLabel="Answer sections"
        />
      </div>

      <div className="px-5 py-5">
        {tab === 'answer' ? (
          <div className="space-y-5">
            <div className="space-y-3 text-[0.875rem] leading-7 text-ink-800">
              {response.answer.split('\n\n').map((para) => (
                <p key={para.slice(0, 48)}>{para}</p>
              ))}
            </div>

            {response.keyFindings.length > 0 ? (
              <section>
                <p className="label-institutional mb-2.5">{t('Key findings')}</p>
                <ul className="space-y-2">
                  {response.keyFindings.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[0.8125rem] leading-6 text-ink-700">
                      <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-govt-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Charts sit between the findings and the caveats: after the claim
                they illustrate, before the limits that qualify it. A reader who
                stops at the picture has still read the finding it belongs to. */}
            {response.visuals && response.visuals.length > 0 ? (
              <AnswerVisuals visuals={response.visuals} />
            ) : null}

            {response.supportingTable ? (
              <section>
                <p className="label-institutional mb-2.5">{response.supportingTable.caption}</p>
                <div className="scrollbar-slim overflow-x-auto rounded-xl border border-ink-100">
                  <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-ink-100 bg-surface-sunken">
                        {response.supportingTable.columns.map((c) => (
                          <th key={c} className="label-institutional px-3 py-2 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      {response.supportingTable.rows.map((row) => (
                        <tr key={row.join('|')}>
                          {row.map((cell, j) => (
                            // Keyed on the column heading: stable, and unique
                            // within the row even where two cells share a value.
                            <td
                              key={response.supportingTable?.columns[j] ?? cell}
                              className="px-3 py-2 text-ink-700"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {response.risksAndLimitations.length > 0 ? (
              <section className="rounded-xl border border-warn-200/60 bg-warn-50/25 p-4">
                <p className="label-institutional mb-2.5 text-warn-700">{t('Risks and limitations')}</p>
                <ul className="space-y-2">
                  {response.risksAndLimitations.map((r) => (
                    <li key={r} className="flex items-start gap-2.5 text-[0.8125rem] leading-6 text-ink-700">
                      <TriangleAlert className="mt-1 h-3.5 w-3.5 shrink-0 text-warn-600" />
                      {r}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'evidence' ? (
          <div className="space-y-3">
            {response.evidence.length === 0 ? (
              <p className="rounded-xl border border-ink-100 bg-surface-sunken p-4 text-[0.8125rem] leading-6 text-ink-600">
                {t('This response drew on no authorised evidence record. That is stated rather than concealed — an answer without evidence is general reasoning, and its confidence is set accordingly.')}
              </p>
            ) : (
              <>
                <p className="text-[0.75rem] leading-relaxed text-ink-500">
                  {t('Every record the answer rests on. Select one to open its full provenance chain.')}
                </p>
                <ul className="space-y-2">
                  {response.evidence.map((citation) => (
                    <li key={citation.id}>
                      <button
                        type="button"
                        disabled={!citation.evidenceId}
                        onClick={() => onOpenEvidence(citation)}
                        className="flex w-full items-start gap-3 rounded-xl border border-ink-100 bg-surface-sunken/70 p-3 text-left transition-colors enabled:hover:border-govt-200 enabled:hover:bg-govt-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-medium text-ink-800">{citation.label}</span>
                          <span className="mt-1 block text-[0.6875rem] leading-relaxed text-ink-500">
                            {t('{0} · {1} · observed {2}', citation.sourceSystem, citation.reference, formatRelative(citation.observedAt))}
                          </span>
                        </span>
                        <ClassificationBadge classification={citation.classification} showIcon={false} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {tab === 'actions' ? (
          <div className="space-y-4">
            {response.recommendedActions.length === 0 ? (
              <p className="rounded-xl border border-ink-100 bg-surface-sunken p-4 text-[0.8125rem] leading-6 text-ink-600">
                {t('No action is recommended for this request. The Copilot does not manufacture a next step where the records do not support one.')}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3">
                  {response.recommendedActions.map((rec) => (
                    <AIRecommendationCard
                      key={rec.id}
                      recommendation={rec}
                      onOpenEvidence={
                        rec.evidenceRefs.length > 0
                          ? () =>
                              rec.evidenceRefs[0] &&
                              onOpenEvidence({
                                id: rec.evidenceRefs[0],
                                label: rec.title,
                                reference: '',
                                sourceSystem: '',
                                observedAt: isoFromAnchor(0),
                                evidenceId: rec.evidenceRefs[0],
                                classification: 'internal',
                              })
                          : undefined
                      }
                    />
                  ))}
                </div>
                <p className="flex items-start gap-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  <Landmark className="mt-0.5 h-3 w-3 shrink-0" />
                  {t('Advisory only. Formal review and approval of AI recommendations is tracked in AI Recommendations, not on this page.')}
                </p>
              </>
            )}
          </div>
        ) : null}

        {tab === 'provenance' ? (
          <dl className="space-y-3 text-[0.8125rem]">
            <ProvenanceRow label={t('Confidence')} value={response.confidenceRationale} />
            {response.domains.length > 0 ? (
              <ProvenanceRow
                label={t('Domains touched')}
                value={
                  <span className="flex flex-wrap justify-end gap-1">
                    {response.domains.map((d) => (
                      <Badge key={d} tone="muted" size="xs">
                        {DOMAIN_LABEL[d]}
                      </Badge>
                    ))}
                  </span>
                }
              />
            ) : null}
            <ProvenanceRow
              label={t('Sources')}
              value={response.sources.length > 0 ? response.sources.join(' · ') : 'None recorded.'}
            />
            <ProvenanceRow label={t('Data freshness')} value={response.dataFreshnessLabel} />
            <ProvenanceRow label={t('Model')} value={<span className="font-mono text-[0.75rem]">{response.modelId}</span>} />
            <ProvenanceRow label={t('Generated at')} value={formatDateTime(response.generatedAt)} />
            <p className="border-t border-ink-100 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">
              {t('This request was written to the AI Intelligence Centre as it was asked, with its model, confidence, grounding, citation count and gateway verdict. Nothing on this page is off the record.')}
            </p>
          </dl>
        ) : null}
      </div>

      {/* Act on it — quiet by default, so it never competes with the answer. */}
      <div className="flex flex-wrap items-center gap-1 border-t border-ink-100 bg-surface-sunken/40 px-4 py-2.5">
        <Button
          size="xs"
          variant="ghost"
          icon={<Gavel className="h-3 w-3" />}
          onClick={onCreateDecision}
          disabled={Boolean(actionState?.decisionId)}
        >
          {actionState?.decisionId ? `Decision ${actionState.decisionRef}` : 'Decision case'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<ClipboardPlus className="h-3 w-3" />}
          onClick={onCreateTask}
          disabled={Boolean(actionState?.taskId)}
        >
          {actionState?.taskId ? `Task ${actionState.taskRef}` : 'Task'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<Siren className="h-3 w-3" />}
          onClick={onEscalate}
          disabled={actionState?.escalated}
        >
          {actionState?.escalated ? 'Escalated' : 'Escalate'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<BookmarkPlus className="h-3 w-3" />}
          onClick={onSaveBrief}
          disabled={actionState?.saved}
        >
          {actionState?.saved ? 'Brief saved' : 'Save brief'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={<Compass className="h-3 w-3" />}
          onClick={onAddToSituationRoom}
          disabled={actionState?.inSituationRoom}
        >
          {actionState?.inSituationRoom ? 'In Situation Room' : 'Situation Room'}
        </Button>

        {followUps.length > 0 ? (
          <>
            <span className="mx-1 hidden h-4 w-px bg-ink-100 sm:block" aria-hidden />
            {followUps.map((q) => (
              <Button
                key={q}
                size="xs"
                variant="ghost"
                className="text-govt-600 hover:text-govt-800"
                disabled={busy}
                onClick={() => onFollowUp(q)}
              >
                {truncate(q, 34)}
              </Button>
            ))}
          </>
        ) : null}
      </div>

      {acted ? (
        <p className="flex items-start gap-2 border-t border-ink-100 bg-ok-50/40 px-5 py-2.5 text-[0.6875rem] leading-relaxed text-ok-700">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          {t('Recorded. High-impact steps beyond this still require a named officer&apos;s approval through the relevant module — this platform has not, and cannot, complete them automatically.')}
        </p>
      ) : null}
    </div>
  )
}

/* ==========================================================================
   The reading — what the Copilot understood the question to be asking
   ========================================================================== */

/**
 * The honesty mechanism of this page.
 *
 * A municipal assistant that answers the question next to the one it was asked
 * produces prose an operator has no way to challenge: it is fluent, it cites
 * real records, and it is about something else. This strip removes that
 * possibility by publishing the reading itself — the route, how strongly the
 * wording selected it, which words bound which entity, and whether the engine
 * narrowed, widened or fell back — before a word of the answer is read.
 *
 * Everything here is stated at the strength it actually holds. A weak reading
 * is drawn as weak, an unbound question says so plainly, and every near-miss
 * route is one click from being asked instead.
 */
function InterpretationStrip({
  interpretation,
  onAsk,
  busy,
}: {
  interpretation: AIInterpretation
  onAsk: (question: string) => void
  busy: boolean
}): React.JSX.Element {
  const style = STRENGTH_STYLE[readingStrength(interpretation.matchStrength)]
  const strength = Math.max(0, Math.min(100, Math.round(interpretation.matchStrength)))

  return (
    <section
      aria-label={t('How this question was read')}
      className={cn('relative min-w-0 border-b px-5 py-3.5', style.surface)}
    >
      {/* A rail rather than a filled banner. The strip is present at every
          strength and only its colour moves, so the eye reads the confidence of
          the reading before it reads a single word of it. */}
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', style.rail)} />

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <div className="min-w-0">
            <p className="label-institutional">{t('Read as')}</p>
            <p className="mt-0.5 text-[0.875rem] leading-6 font-semibold text-ink-900">{interpretation.intentLabel}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={style.badge}>{style.label}</Badge>
          <span className="flex items-center gap-2">
            <span className="h-1 w-16 overflow-hidden rounded-full bg-ink-200/70" aria-hidden>
              <span className={cn('block h-full rounded-full', style.meter)} style={{ width: `${strength}%` }} />
            </span>
            <span className="numeric text-[0.625rem] text-ink-500">
              <span className="sr-only">{t('Match strength')}</span>
              {strength} / 100
            </span>
          </span>
        </div>
      </div>

      {style.sentence ? <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-700">{style.sentence}</p> : null}

      {/* The bindings. An operator who named a ward and sees no ward chip has
          learned, in one glance, that the ward was not read. */}
      <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5">
        {interpretation.entities.length === 0 ? (
          <p className="text-[0.75rem] leading-relaxed text-ink-500">
            {t('No ward, department or condition was bound from this wording, so nothing narrowed the retrieval.')}
          </p>
        ) : (
          interpretation.entities.map((entity) => {
            const kind = ENTITY_KIND[entity.kind]
            return (
              <span
                key={`${entity.kind}-${entity.id ?? entity.label}-${entity.matchedText}`}
                title={t('Bound from "{0}" in your question', entity.matchedText)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-2 py-1 text-[0.6875rem]"
              >
                <span className="shrink-0 text-ink-400" aria-hidden>
                  {kind.icon}
                </span>
                <span className="shrink-0 text-ink-400">{kind.caption}</span>
                <span className="min-w-0 truncate font-semibold text-ink-800">{entity.label}</span>
              </span>
            )
          })
        )}
      </div>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
        {interpretation.matchedTerms.length > 0 ? (
          <>
            <span className="text-ink-400">{t('Matched on')}</span> {interpretation.matchedTerms.join(' · ')}
          </>
        ) : (
          'No term in the wording matched a retrieval route.'
        )}
      </p>

      {/* Where the engine narrowed, widened or fell back it says so here. That
          statement is the difference between a defensible answer and a merely
          plausible one, so it is given a surface of its own rather than being
          folded into the prose below. */}
      {interpretation.note ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-warn-200 bg-warn-50/70 px-2.5 py-2 text-[0.75rem] leading-relaxed text-warn-700">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{interpretation.note}</span>
        </p>
      ) : null}

      {interpretation.alternatives.length > 0 ? (
        <div className="mt-3 border-t border-ink-100 pt-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
            <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden />
            {t('Read incorrectly? Ask one of these instead.')}
          </p>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {interpretation.alternatives.map((alt) => (
              <button
                key={alt.intentId}
                type="button"
                disabled={busy}
                onClick={() => onAsk(alt.question)}
                title={alt.question}
                className={cn(
                  'flex min-w-0 max-w-full flex-col items-start gap-0.5 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-left transition-colors',
                  'enabled:hover:border-govt-300 enabled:hover:bg-govt-50/60',
                  'focus-visible:ring-2 focus-visible:ring-govt-500/30 focus-visible:outline-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <span className="text-[0.6875rem] font-semibold text-govt-700">{alt.label}</span>
                <span className="max-w-[18rem] truncate text-[0.625rem] text-ink-500">{alt.question}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ProvenanceRow({ label, value }: { label: string; value: ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 border-t border-ink-100 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="shrink-0 font-medium text-ink-500">{label}</dt>
      <dd className="leading-6 text-ink-700 sm:max-w-[30rem] sm:text-right">{value}</dd>
    </div>
  )
}

export default CopilotPage
