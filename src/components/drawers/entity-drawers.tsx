import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  GitBranch,
  MessageSquarePlus,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { DOMAIN_LABEL } from '@/types/common'
import { INTELLIGENCE_TYPE_LABEL } from '@/types/intelligence'
import { ROUTES } from '@/config/navigation'
import { INTELLIGENCE_BY_ID, ALERT_BY_ID } from '@/data/intelligence.data'
import { DECISION_BY_ID, INCIDENT_BY_ID } from '@/data/operations.data'
import { PROJECT_BY_ID, CONTRACT_BY_ID, contractorName } from '@/data/finance.data'
import { SECURITY_EVENTS, ACCESS_POLICIES, AUDIT_EVENTS } from '@/data/governance.data'
import { GRAPH_NODE_BY_ID, graphNeighbours } from '@/data/knowledge-graph.data'
import { ASSET_BY_ID } from '@/data/operations.data'
import { WARD_BY_ID, departmentName, officerDesignation, officerDisplayName, wardName } from '@/data/reference'
import { GRAPH_RELATION_LABEL } from '@/types/governance'
import { canAccess } from '@/security/access'
import {
  actionWorkflow,
  alertWorkflow,
  decisionWorkflow,
  incidentWorkflow,
  intelligenceWorkflow,
  nextTransitions,
  progressPct,
  type StateMachine,
  type Transition,
} from '@/workflows'
import { ownerDesignation, ownerDisplayName } from '@/auth/demo-users'
import { queryKeys } from '@/app/queryClient'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { actionService } from '@/services'
import type { ActionStatus } from '@/types/operations'
import { useCurrentUser } from '@/stores/auth.store'
import { useDrawerStore } from '@/stores/ui.store'
import { formatCompact, formatCrore, formatDate, formatDateTime, formatRelative, sanitiseText } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  Badge,
  ClassificationBadge,
  ConfidenceBadge,
  SeverityBadge,
  StateBadge,
} from '@/components/ui/badges'
import {
  Button,
  Card,
  DefinitionList,
  DefinitionRow,
  ProgressBar,
  Textarea,
  toneForScore,
} from '@/components/ui/primitives'
import { AccessDeniedState, EmptyState, LoadingState } from '@/components/ui/states'
import { ConfirmDialog, Drawer, Tabs } from '@/components/ui/overlays'
import { HumanConfirmationGate } from '@/features/human-oversight/HumanConfirmationGate'
import { ContributionBars } from '@/components/charts/charts'
import { AIRecommendationCard } from '@/components/cards/domain-cards'
import { t } from '@/i18n'

/* ==========================================================================
   Shared: workflow action strip
   ========================================================================== */

function WorkflowStrip<S extends string>({
  machine,
  current,
  onTransition,
  className,
}: {
  machine: StateMachine<S>
  current: S
  onTransition?: (to: S, reason: string) => void
  className?: string
}): React.JSX.Element {
  const user = useCurrentUser()
  const [pending, setPending] = useState<Transition<S> | null>(null)
  const available = nextTransitions(machine, current)

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress rail */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label-institutional">{machine.name}</span>
          <span className="numeric text-[0.6875rem] text-ink-500">{t('{0}% through lifecycle', progressPct(machine, current))}</span>
        </div>
        <ol className="flex items-center gap-1">
          {machine.order.map((stage, i) => {
            const idx = machine.order.indexOf(current)
            const done = i < idx
            const active = i === idx
            return (
              <li key={stage} className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={cn(
                    'h-1 w-full rounded-full',
                    done ? 'bg-govt-500' : active ? 'bg-govt-600' : 'bg-ink-100',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'truncate text-[0.5625rem] leading-tight',
                    active ? 'font-semibold text-govt-700' : done ? 'text-ink-500' : 'text-ink-300',
                  )}
                >
                  {machine.labels[stage]}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Available transitions */}
      {available.length > 0 && onTransition ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map((transition) => {
            const permitted = canAccess(user, transition.requires.resource, transition.requires.action).allowed
            return (
              <Button
                key={`${transition.from}-${transition.to}-${transition.label}`}
                size="xs"
                variant={
                  transition.intent === 'critical'
                    ? 'critical'
                    : transition.intent === 'positive'
                      ? 'positive'
                      : transition.intent === 'primary'
                        ? 'primary'
                        : 'outline'
                }
                disabled={!permitted}
                title={
                  permitted
                    ? transition.description
                    : `Your role does not hold ${transition.requires.resource}:${transition.requires.action}. This control is disabled by the permission engine.`
                }
                onClick={() => setPending(transition)}
                icon={!permitted ? <Ban className="h-3 w-3" /> : undefined}
              >
                {transition.label}
              </Button>
            )
          })}
        </div>
      ) : null}

      {/*
        Transitions carrying approval authority route through the human
        confirmation gate rather than a plain confirmation. The additional
        friction is the control: the acting officer must acknowledge, by name
        and in their institutional capacity, that the determination is theirs.
      */}
      {pending && pending.requires.action === 'approve' ? (
        <HumanConfirmationGate
          open
          onClose={() => setPending(null)}
          onConfirm={(record) => {
            onTransition?.(
              pending.to,
              `${record.rationale} - confirmed by ${record.confirmedBy} (${record.confirmedByRole}).`,
            )
            setPending(null)
          }}
          title={pending.label}
          description={pending.description}
          consequence={`The record will move to "${machine.labels[pending.to]}". This transition is recorded permanently and cannot be amended afterwards.`}
          confirmLabel={t('{0} as the deciding officer', pending.label)}
          intent={pending.intent === 'critical' ? 'critical' : pending.intent === 'positive' ? 'positive' : 'primary'}
        />
      ) : pending ? (
        <ConfirmDialog
          open
          onClose={() => setPending(null)}
          onConfirm={(reason) => {
            onTransition?.(pending.to, reason)
            setPending(null)
          }}
          title={pending.label}
          description={pending.description}
          confirmLabel={pending.label}
          intent={pending.intent === 'critical' ? 'critical' : pending.intent === 'positive' ? 'positive' : 'primary'}
          requireReason={pending.requiresReason}
        />
      ) : null}
    </div>
  )
}

/* ==========================================================================
   Intelligence drawer
   ========================================================================== */

export function IntelligenceDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const push = useDrawerStore((s) => s.push)
  const item = INTELLIGENCE_BY_ID.get(id)
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(item?.status ?? 'new')
  const [log, setLog] = useState<Array<{ at: string; text: string }>>([])
  const [note, setNote] = useState('')

  if (!item) {
    return (
      <Drawer open onClose={close} title={t('Intelligence item')} width="lg">
        <EmptyState title={t('Intelligence item not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'intelligence', 'view', {
    wardIds: item.wardIds,
    departmentId: item.departmentId,
    domain: item.domain,
    classification: item.classification,
  })

  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Intelligence item')} width="lg">
        <AccessDeniedState reason={access.reason} resource="intelligence" action="view" />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={`${INTELLIGENCE_TYPE_LABEL[item.type]} · ${DOMAIN_LABEL[item.domain]}`}
      title={item.title}
      meta={
        <>
          <SeverityBadge severity={item.severity} />
          <ConfidenceBadge confidence={item.confidence} />
          <ClassificationBadge classification={item.classification} />
          <Badge tone="muted" className="font-mono">
            {item.id}
          </Badge>
        </>
      }
      tabs={
        <Tabs
          items={[
            { id: 'overview', label: t('Overview') },
            { id: 'evidence', label: t('Evidence'), count: item.evidenceIds.length },
            { id: 'actions', label: t('Recommended actions'), count: item.recommendedActions.length },
            { id: 'workflow', label: t('Workflow') },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Intelligence detail sections"
        />
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          <Button
            variant="outline"
            icon={<FileSearch className="h-3.5 w-3.5" />}
            onClick={() => item.evidenceIds[0] && push({ kind: 'evidence', id: item.evidenceIds[0] })}
            disabled={item.evidenceIds.length === 0}
          >
            {t('Open evidence')}
          </Button>
          <Link to={`${ROUTES.decisions}?from=${item.id}`}>
            <Button variant="primary" icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
              {t('Create decision case')}
            </Button>
          </Link>
        </>
      }
    >
      {tab === 'overview' ? (
        <div className="space-y-4">
          <Card tone="sunken">
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{item.description}</p>
          </Card>

          <Card>
            <h4 className="label-institutional mb-1.5">{t('Why this was raised')}</h4>
            <p className="text-[0.8125rem] leading-relaxed text-ink-600">{item.explanation}</p>
          </Card>

          <Card>
            <h4 className="label-institutional mb-2">{t('Record')}</h4>
            <DefinitionList>
              <DefinitionRow label={t('Geography')}>{item.wardIds.map((w) => wardName(w)).join(', ')}</DefinitionRow>
              <DefinitionRow label={t('Accountable department')}>{departmentName(item.departmentId)}</DefinitionRow>
              <DefinitionRow label={t('Owner')}>
                {item.ownerId ? (
                  <>
                    {officerDisplayName(item.ownerId)}
                    <span className="ml-1 text-ink-400">({officerDesignation(item.ownerId)})</span>
                  </>
                ) : (
                  <span className="text-warn-700">{t('Unassigned')}</span>
                )}
              </DefinitionRow>
              <DefinitionRow label={t('Produced by')}>
                {item.generator === 'rule-engine'
                  ? 'Rule engine - deterministic threshold evaluation'
                  : item.generator === 'model'
                    ? 'Model - statistical evaluation with stated confidence'
                    : item.generator === 'correlation-engine'
                      ? 'Correlation engine - multi-domain signal combination'
                      : 'Analyst review'}
              </DefinitionRow>
              {item.citizensAffected ? (
                <DefinitionRow label={t('Citizens affected')}>
                  {formatCompact(item.citizensAffected)}{' '}
                  <span className="text-ink-400">{t('(modelled estimate, not a survey figure)')}</span>
                </DefinitionRow>
              ) : null}
              <DefinitionRow label={t('Raised')}>{formatDateTime(item.createdAt)}</DefinitionRow>
              <DefinitionRow label={t('Last updated')}>{formatRelative(item.updatedAt)}</DefinitionRow>
            </DefinitionList>
          </Card>

          {item.contributingDomains && item.contributingDomains.length > 1 ? (
            <Card tone="info">
              <h4 className="label-institutional mb-2 flex items-center gap-1.5">
                <GitBranch className="h-3 w-3" />
                {t('Contributing domains')}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {item.contributingDomains.map((d) => (
                  <Badge key={d} tone="info">
                    {DOMAIN_LABEL[d]}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">
                {t('This signal was produced by combining independent domain inputs. No single domain view surfaces it. Correlation across domains identifies an exposure requiring assessment; it does not establish causation.')}
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'evidence' ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-ink-500">
            {t('Every statement in this item traces to the records below. Open any record to inspect its source system, transformation, quality assessment and full provenance chain.')}
          </p>
          {item.evidenceIds.map((eid) => (
            <button
              key={eid}
              type="button"
              onClick={() => push({ kind: 'evidence', id: eid })}
              className="flex w-full items-center gap-2 rounded-lg border border-ink-100 bg-surface-sunken p-3 text-left transition-colors hover:border-govt-200 hover:bg-govt-50/40"
            >
              <FileSearch className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[0.6875rem] text-ink-500">{eid}</span>
                <span className="block truncate text-[0.8125rem] text-ink-700">{t('Open evidence record')}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'actions' ? (
        <div className="space-y-3">
          {item.recommendedActions.map((action) => (
            <AIRecommendationCard
              key={action.id}
              recommendation={{
                id: action.id,
                title: action.title,
                why: action.rationale,
                evidenceRefs: item.evidenceIds,
                expectedImpact: action.expectedImpact,
                confidence: action.confidence,
                dependencies: action.dependencies,
                risks: action.risks,
                humanOwnerRole: t('Accountable departmental officer'),
                departmentId: action.departmentId,
                requiresHumanApproval: true,
              }}
              onOpenEvidence={() => item.evidenceIds[0] && push({ kind: 'evidence', id: item.evidenceIds[0] })}
            />
          ))}
        </div>
      ) : null}

      {tab === 'workflow' ? (
        <div className="space-y-4">
          <Card>
            <WorkflowStrip
              machine={intelligenceWorkflow}
              current={status}
              onTransition={(to, reason) => {
                setStatus(to)
                setLog((prev) => [
                  {
                    at: new Date().toISOString(),
                    text: `Status changed to ${intelligenceWorkflow.labels[to]}${reason ? ` - ${sanitiseText(reason, 300)}` : ''}`,
                  },
                  ...prev,
                ])
              }}
            />
          </Card>

          <Card>
            <h4 className="label-institutional mb-2">{t('Add a note')}</h4>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('Record an operational observation. Notes are attributed to your name and retained permanently.')}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="xs"
                variant="outline"
                icon={<MessageSquarePlus className="h-3 w-3" />}
                disabled={note.trim().length < 3}
                onClick={() => {
                  setLog((prev) => [{ at: new Date().toISOString(), text: sanitiseText(note) }, ...prev])
                  setNote('')
                }}
              >
                {t('Add note')}
              </Button>
            </div>
          </Card>

          <Card>
            <h4 className="label-institutional mb-2">{t('Activity in this session')}</h4>
            {log.length === 0 ? (
              <p className="text-xs text-ink-400">
                {t('No changes recorded in this session. Every transition and note is written to the audit trail.')}
              </p>
            ) : (
              <ul className="space-y-2">
                {log.map((entry, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <Activity className="mt-0.5 h-3 w-3 shrink-0 text-govt-500" />
                    <span className="min-w-0 flex-1 text-ink-600">{entry.text}</span>
                    <span className="shrink-0 text-[0.625rem] text-ink-400">{formatRelative(entry.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
    </Drawer>
  )
}

/* ==========================================================================
   Decision drawer
   ========================================================================== */

export function DecisionDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const push = useDrawerStore((s) => s.push)
  const base = DECISION_BY_ID.get(id)
  const [tab, setTab] = useState('problem')
  const [status, setStatus] = useState(base?.status ?? 'draft')
  const [selected, setSelected] = useState(base?.recommendationId ?? '')
  const [log, setLog] = useState<Array<{ at: string; text: string }>>([])

  if (!base) {
    return (
      <Drawer open onClose={close} title={t('Decision case')} width="xl">
        <EmptyState title={t('Decision case not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'decision', 'view', { wardIds: base.wardIds, classification: base.classification })
  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Decision case')} width="xl">
        <AccessDeniedState reason={access.reason} resource="decision" action="view" />
      </Drawer>
    )
  }

  const canApprove = canAccess(user, 'decision', 'approve').allowed

  return (
    <Drawer
      open
      onClose={close}
      width="xl"
      eyebrow={t('Decision case · {0}', DOMAIN_LABEL[base.domain])}
      title={base.title}
      meta={
        <>
          <Badge tone="info" className="font-mono">
            {base.reference}
          </Badge>
          <SeverityBadge severity={base.severity} />
          <ClassificationBadge classification={base.classification} />
          <Badge tone="muted">{t('{0} financial impact', formatCrore(base.financialImpactCrore))}</Badge>
        </>
      }
      tabs={
        <Tabs
          items={[
            { id: 'problem', label: t('Problem & background') },
            { id: 'alternatives', label: t('Alternatives'), count: base.alternatives.length },
            { id: 'analysis', label: t('Analysis') },
            { id: 'decision', label: t('Decision & approvals') },
            { id: 'outcome', label: t('Outcome') },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Decision case sections"
        />
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          <Button
            variant="outline"
            icon={<FileSearch className="h-3.5 w-3.5" />}
            disabled={base.evidenceIds.length === 0}
            onClick={() => base.evidenceIds[0] && push({ kind: 'evidence', id: base.evidenceIds[0] })}
          >
            {t('Open evidence ({0})', base.evidenceIds.length)}
          </Button>
        </>
      }
    >
      {tab === 'problem' ? (
        <div className="space-y-4">
          <Card tone="warn">
            <h4 className="label-institutional mb-1.5">{t('Problem statement')}</h4>
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{base.problemStatement}</p>
          </Card>
          <Card>
            <h4 className="label-institutional mb-1.5">{t('Background')}</h4>
            <p className="text-[0.8125rem] leading-relaxed text-ink-600">{base.background}</p>
          </Card>
          <Card>
            <h4 className="label-institutional mb-2">{t('Impact')}</h4>
            <DefinitionList>
              <DefinitionRow label={t('Financial impact')}>{formatCrore(base.financialImpactCrore)}</DefinitionRow>
              <DefinitionRow label={t('Geographic impact')}>{base.geographicImpact.join(', ') || '-'}</DefinitionRow>
              <DefinitionRow label={t('Citizen impact')}>{base.citizenImpact}</DefinitionRow>
              <DefinitionRow label={t('Departments involved')}>
                {base.departmentIds.map((d) => departmentName(d)).join(', ')}
              </DefinitionRow>
              <DefinitionRow label={t('Due date')}>{formatDate(base.dueDate)}</DefinitionRow>
              <DefinitionRow label={t('Raised by')}>{officerDisplayName(base.createdBy)}</DefinitionRow>
            </DefinitionList>
          </Card>
          {base.risks.length > 0 ? (
            <Card tone="critical">
              <h4 className="label-institutional mb-2">{t('Risks recorded against this case')}</h4>
              <ul className="space-y-1.5">
                {base.risks.map((risk) => (
                  <li key={risk} className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-crit-500" aria-hidden />
                    {risk}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'alternatives' ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-500">
            {t('Alternatives are compared on a published basis. The ordering is advisory. The decision rests with the competent authority, who records the selected alternative and the rationale below.')}
          </p>
          {[...base.alternatives]
            .sort((a, b) => b.score - a.score)
            .map((alt) => {
              const isSelected = alt.id === selected
              return (
                <Card
                  key={alt.id}
                  tone={isSelected ? 'info' : 'default'}
                  className={cn('cursor-pointer transition-shadow hover:shadow-raised', isSelected && 'ring-1 ring-govt-300')}
                  onClick={() => setSelected(alt.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                            isSelected ? 'border-govt-600 bg-govt-600' : 'border-ink-300',
                          )}
                          aria-hidden
                        >
                          {isSelected ? <CheckCircle2 className="h-3 w-3 text-white" /> : null}
                        </span>
                        <h4 className="text-[0.8125rem] font-semibold text-ink-900">{alt.title}</h4>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{alt.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="numeric text-lg font-semibold text-ink-900">{alt.score}</span>
                      <p className="text-[0.625rem] text-ink-400">score</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-[0.6875rem]">
                    <div>
                      <span className="text-ink-400">{t('Indicative cost')}</span>
                      <p className="numeric font-semibold text-ink-800">{formatCrore(alt.indicativeCostCrore)}</p>
                    </div>
                    <div>
                      <span className="text-ink-400">{t('Time to effect')}</span>
                      <p className="numeric font-semibold text-ink-800">{alt.timeToEffectDays} days</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="label-institutional mb-1">{t('Benefits')}</p>
                      <ul className="space-y-1">
                        {alt.benefits.map((b) => (
                          <li key={b} className="flex items-start gap-1.5 text-[0.6875rem] text-ink-600">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ok-500" aria-hidden />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="label-institutional mb-1">{t('Risks')}</p>
                      <ul className="space-y-1">
                        {alt.risks.map((r) => (
                          <li key={r} className="flex items-start gap-1.5 text-[0.6875rem] text-ink-600">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-warn-500" aria-hidden />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="mt-3 border-t border-ink-100 pt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                    <span className="font-medium text-ink-600">{t('Basis for this score:')}</span> {alt.scoreRationale}
                  </p>
                </Card>
              )
            })}
        </div>
      ) : null}

      {tab === 'analysis' ? (
        <div className="space-y-4">
          {base.aiAnalysis ? (
            <Card tone="info">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="intel" icon={<Sparkles className="h-3 w-3" />}>
                  {t('Model-assisted analysis')}
                </Badge>
                <ConfidenceBadge confidence={base.aiAnalysis.confidence} />
                <Badge tone="muted" className="font-mono">
                  {base.aiAnalysis.modelId}
                </Badge>
              </div>
              <p className="text-[0.8125rem] leading-relaxed text-ink-700">{base.aiAnalysis.summary}</p>

              <h5 className="label-institutional mt-3 mb-1.5">{t('Key findings')}</h5>
              <ul className="space-y-1.5">
                {base.aiAnalysis.keyFindings.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs leading-relaxed text-ink-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-govt-500" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <h5 className="label-institutional mt-3 mb-1.5">{t('Limitations')}</h5>
              <ul className="space-y-1.5">
                {base.aiAnalysis.limitations.map((l) => (
                  <li key={l} className="flex items-start gap-2 text-xs leading-relaxed text-ink-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn-500" aria-hidden />
                    {l}
                  </li>
                ))}
              </ul>

              <p className="mt-3 border-t border-govt-200 pt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                {t('Generated {0}. This analysis is advisory. It cannot and does not decide. Authority rests with the competent officer.', formatDateTime(base.aiAnalysis.generatedAt))}
              </p>
            </Card>
          ) : null}

          <Card>
            <h4 className="label-institutional mb-1.5">{t('Platform recommendation')}</h4>
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{base.recommendationSummary}</p>
          </Card>

          <Card>
            <h4 className="label-institutional mb-2">{t('Source intelligence')}</h4>
            <ul className="space-y-1.5">
              {base.sourceIntelligenceIds.map((iid) => {
                const src = INTELLIGENCE_BY_ID.get(iid)
                return (
                  <li key={iid}>
                    <button
                      type="button"
                      onClick={() => push({ kind: 'intelligence', id: iid })}
                      className="flex w-full items-start gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-ink-50"
                    >
                      <Activity className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
                      <span className="min-w-0 flex-1 text-xs text-ink-700">{src?.title ?? iid}</span>
                      {src ? <SeverityBadge severity={src.severity} withDot={false} /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === 'decision' ? (
        <div className="space-y-4">
          <Card>
            <WorkflowStrip
              machine={decisionWorkflow}
              current={status}
              onTransition={(to, reason) => {
                setStatus(to)
                setLog((prev) => [
                  { at: new Date().toISOString(), text: `${decisionWorkflow.labels[to]} - ${sanitiseText(reason, 300)}` },
                  ...prev,
                ])
              }}
            />
          </Card>

          {base.humanDecision ? (
            <Card tone="positive">
              <h4 className="label-institutional mb-2">{t('Human decision recorded')}</h4>
              <DefinitionList>
                <DefinitionRow label={t('Selected alternative')}>
                  {base.alternatives.find((a) => a.id === base.humanDecision?.selectedAlternativeId)?.title ?? '-'}
                </DefinitionRow>
                <DefinitionRow label={t('Decided by')}>{officerDisplayName(base.humanDecision.decidedBy)}</DefinitionRow>
                <DefinitionRow label={t('Decided at')}>{formatDateTime(base.humanDecision.decidedAt)}</DefinitionRow>
              </DefinitionList>
              <p className="mt-2 border-t border-ok-200 pt-2 text-xs leading-relaxed text-ink-600">
                <span className="font-medium">{t('Rationale:')}</span> {base.humanDecision.rationale}
              </p>
            </Card>
          ) : (
            <Card tone="warn">
              <h4 className="label-institutional mb-1.5">{t('Awaiting human decision')}</h4>
              <p className="text-xs leading-relaxed text-ink-600">
                {t('No alternative has been selected. The platform will not select one. A named officer with approval authority must record the decision and its rationale.')}
              </p>
              {!canApprove ? (
                <p className="mt-2 text-[0.6875rem] text-ink-500">
                  {t('Your role does not hold')}{' '}<span className="font-mono">{t('decision:approve')}</span>{t('. The approval controls are disabled by the permission engine, not merely hidden.')}
                </p>
              ) : null}
            </Card>
          )}

          <Card>
            <h4 className="label-institutional mb-2">{t('Approvals')}</h4>
            <ul className="space-y-2">
              {base.approvals.map((approval) => (
                <li
                  key={approval.id}
                  className="flex items-center gap-2.5 rounded-md border border-ink-100 bg-surface-sunken px-2.5 py-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-govt-700 text-[0.5625rem] font-semibold text-white">
                    {officerDisplayName(approval.approverId)
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink-800">{approval.approverDesignation}</p>
                    {approval.note ? <p className="truncate text-[0.6875rem] text-ink-500">{approval.note}</p> : null}
                  </div>
                  <Badge
                    tone={
                      approval.status === 'approved'
                        ? 'positive'
                        : approval.status === 'rejected'
                          ? 'critical'
                          : approval.status === 'deferred'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {approval.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          {log.length > 0 ? (
            <Card>
              <h4 className="label-institutional mb-2">{t('Recorded in this session')}</h4>
              <ul className="space-y-1.5">
                {log.map((entry, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <ClipboardCheck className="mt-0.5 h-3 w-3 shrink-0 text-govt-500" />
                    <span className="min-w-0 flex-1 text-ink-600">{entry.text}</span>
                    <span className="shrink-0 text-[0.625rem] text-ink-400">{formatRelative(entry.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'outcome' ? (
        <div className="space-y-4">
          {base.outcome ? (
            <>
              <Card tone={base.outcome.effectiveness === 'effective' ? 'positive' : 'warn'}>
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="label-institutional">{t('Measured outcome')}</h4>
                  <Badge
                    tone={
                      base.outcome.effectiveness === 'effective'
                        ? 'positive'
                        : base.outcome.effectiveness === 'not-effective'
                          ? 'critical'
                          : 'warn'
                    }
                  >
                    {base.outcome.effectiveness.replace('-', ' ')}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-ink-600">{base.outcome.summary}</p>
                <p className="mt-1.5 text-[0.6875rem] text-ink-400">
                  {t('Measured {0}', formatDateTime(base.outcome.measuredAt))}
                </p>
              </Card>
              <Card>
                <h4 className="label-institutional mb-2">{t('Indicator movement')}</h4>
                <ul className="space-y-3">
                  {base.outcome.indicators.map((ind) => (
                    <li key={ind.label}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-ink-600">{ind.label}</span>
                        <span className="numeric">
                          <span className="text-ink-400">{ind.before}</span>
                          <ArrowRight className="mx-1 inline h-2.5 w-2.5 text-ink-300" />
                          <span className="font-semibold text-ink-800">
                            {ind.after}
                            {ind.unit}
                          </span>
                        </span>
                      </div>
                      <ProgressBar value={ind.after} className="mt-1" size="xs" />
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <EmptyState
              title={t('Outcome not yet measured')}
              detail="Outcome measurement follows implementation and verification. Results are recorded without adjustment, including where an intervention proved ineffective."
            />
          )}
        </div>
      ) : null}
    </Drawer>
  )
}

/* ==========================================================================
   Project drawer
   ========================================================================== */

export function ProjectDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const push = useDrawerStore((s) => s.push)
  const project = PROJECT_BY_ID.get(id)
  const [tab, setTab] = useState('overview')

  if (!project) {
    return (
      <Drawer open onClose={close} title={t('Project')} width="lg">
        <EmptyState title={t('Project not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'project', 'view', {
    wardIds: project.wardIds,
    departmentId: project.departmentId,
    classification: project.classification,
  })
  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Project')} width="lg">
        <AccessDeniedState reason={access.reason} resource="project" action="view" />
      </Drawer>
    )
  }

  const relatedContracts = Array.from(CONTRACT_BY_ID.values()).filter((c) => c.projectId === project.id)

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={t('Capital project')}
      title={project.name}
      meta={
        <>
          <Badge tone="neutral" className="font-mono">
            {project.reference}
          </Badge>
          <Badge
            tone={project.riskScore >= 70 ? 'critical' : project.riskScore >= 55 ? 'risk' : project.riskScore >= 38 ? 'warn' : 'positive'}
          >
            {t('Risk {0}/100', project.riskScore)}
          </Badge>
          <ClassificationBadge classification={project.classification} />
        </>
      }
      tabs={
        <Tabs
          items={[
            { id: 'overview', label: t('Overview') },
            { id: 'risk', label: t('Risk drivers'), count: project.riskDrivers.length },
            { id: 'milestones', label: t('Milestones'), count: project.milestones.length },
            { id: 'contract', label: t('Contract') },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Project sections"
        />
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          <Link to={`${ROUTES.decisions}?from=project:${project.id}`}>
            <Button variant="primary" icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
              {t('Create decision case')}
            </Button>
          </Link>
        </>
      }
    >
      {tab === 'overview' ? (
        <div className="space-y-4">
          <Card tone="sunken">
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{project.description}</p>
          </Card>
          <Card>
            <h4 className="label-institutional mb-2">{t('Delivery position')}</h4>
            <div className="mb-3">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-ink-500">{t('Physical progress against phased plan')}</span>
                <span className="numeric">
                  <span className="font-semibold text-ink-800">{project.completionPct}%</span>
                  <span className="mx-1 text-ink-300">/</span>
                  <span className="text-ink-500">{t('{0}% planned', project.plannedCompletionPct)}</span>
                </span>
              </div>
              <ProgressBar value={project.completionPct} size="sm" tone={toneForScore(project.riskScore, false)} />
            </div>
            <DefinitionList>
              <DefinitionRow label={t('Sanctioned cost')}>{formatCrore(project.sanctionedCostCrore)}</DefinitionRow>
              <DefinitionRow label={t('Current cost')}>
                {formatCrore(project.currentCostCrore)}
                {project.currentCostCrore > project.sanctionedCostCrore ? (
                  <span className="ml-1 text-crit-600">
                    (+
                    {(
                      ((project.currentCostCrore - project.sanctionedCostCrore) / project.sanctionedCostCrore) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>
                ) : null}
              </DefinitionRow>
              <DefinitionRow label={t('Paid to date')}>{formatCrore(project.paidCrore)}</DefinitionRow>
              <DefinitionRow label={t('Executing agency')}>{contractorName(project.contractorId)}</DefinitionRow>
              <DefinitionRow label={t('Department')}>{departmentName(project.departmentId)}</DefinitionRow>
              <DefinitionRow label={t('Wards')}>{project.wardIds.map((w) => wardName(w)).join(', ')}</DefinitionRow>
              <DefinitionRow label={t('Planned')}>
                {formatDate(project.plannedStart)} → {formatDate(project.plannedEnd)}
              </DefinitionRow>
              <DefinitionRow label={t('Open inspection observations')}>
                {project.inspectionObservationsOpen}
              </DefinitionRow>
              <DefinitionRow label={t('Linked citizen complaints')}>{project.complaintsLinked}</DefinitionRow>
              <DefinitionRow label={t('Last inspected')}>{formatRelative(project.lastInspectedAt)}</DefinitionRow>
            </DefinitionList>
          </Card>
        </div>
      ) : null}

      {tab === 'risk' ? (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <h4 className="label-institutional">{t('Composite risk score')}</h4>
              <span className="numeric text-metric-sm font-semibold text-ink-900">{project.riskScore}/100</span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('The score is the weighted sum of the drivers below. Weights are published and identical for every project, so scores are comparable. A high score indicates delivery risk requiring management attention. It is not a finding against any person or organisation.')}
            </p>
            <ContributionBars items={project.riskDrivers} />
          </Card>
        </div>
      ) : null}

      {tab === 'milestones' ? (
        <ol className="space-y-2">
          {project.milestones.map((ms) => (
            <li
              key={ms.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3',
                ms.status === 'slipped'
                  ? 'border-crit-200 bg-crit-50/40'
                  : ms.status === 'at-risk'
                    ? 'border-warn-200 bg-warn-50/40'
                    : ms.status === 'achieved'
                      ? 'border-ok-200 bg-ok-50/30'
                      : 'border-ink-100',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                  ms.status === 'achieved' ? 'bg-ok-500' : ms.status === 'slipped' ? 'bg-crit-500' : 'bg-ink-200',
                )}
                aria-hidden
              >
                {ms.status === 'achieved' ? <CheckCircle2 className="h-3 w-3 text-white" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-medium text-ink-800">{ms.name}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                  {t('Planned {0}{1}{2}', formatDate(ms.plannedDate), ms.actualDate ? ` · Achieved ${formatDate(ms.actualDate)}` : '', ms.slippageDays > 0 ? ` · ${ms.slippageDays} days slipped` : '')}
                </p>
              </div>
              <Badge
                tone={
                  ms.status === 'achieved'
                    ? 'positive'
                    : ms.status === 'slipped'
                      ? 'critical'
                      : ms.status === 'at-risk'
                        ? 'warn'
                        : 'neutral'
                }
              >
                {ms.status}
              </Badge>
            </li>
          ))}
        </ol>
      ) : null}

      {tab === 'contract' ? (
        <div className="space-y-3">
          {relatedContracts.length === 0 ? (
            <EmptyState title={t('No contract linked')} detail="No contract record is linked to this project reference." compact />
          ) : (
            relatedContracts.map((contract) => (
              <Card key={contract.id}>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral" className="font-mono">
                    {contract.reference}
                  </Badge>
                  <Badge tone={contract.riskScore >= 60 ? 'critical' : contract.riskScore >= 42 ? 'warn' : 'positive'}>
                    {t('Risk indicator {0}', contract.riskScore)}
                  </Badge>
                  <Badge tone="muted">{contract.stage}</Badge>
                </div>
                <DefinitionList>
                  <DefinitionRow label={t('Contractor')}>{contractorName(contract.contractorId)}</DefinitionRow>
                  <DefinitionRow label={t('Value')}>{formatCrore(contract.valueCrore)}</DefinitionRow>
                  <DefinitionRow label={t('Paid')}>{formatCrore(contract.paidCrore)}</DefinitionRow>
                  <DefinitionRow label={t('Extensions')}>{contract.extensions}</DefinitionRow>
                  <DefinitionRow label={t('Variation')}>{contract.variationPct}%</DefinitionRow>
                  <DefinitionRow label={t('Milestones')}>
                    {t('{0} of {1} achieved', contract.milestonesAchieved, contract.milestonesTotal)}
                  </DefinitionRow>
                </DefinitionList>
                <div className="mt-3 border-t border-ink-100 pt-2.5">
                  <p className="label-institutional mb-2">{t('Procurement risk indicators')}</p>
                  <ContributionBars items={contract.riskIndicators} />
                </div>
                <p className="mt-2.5 rounded-md bg-ink-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('These indicators identify delivery and continuity risk. They are not, and must not be represented as, findings of impropriety against any party.')}
                </p>
              </Card>
            ))
          )}
          <Button
            variant="outline"
            size="xs"
            icon={<FileSearch className="h-3 w-3" />}
            onClick={() => push({ kind: 'evidence', id: 'ev-0005' })}
          >
            {t('Open supporting evidence')}
          </Button>
        </div>
      ) : null}
    </Drawer>
  )
}

/* ==========================================================================
   Incident drawer
   ========================================================================== */

export function IncidentDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const push = useDrawerStore((s) => s.push)
  const incident = INCIDENT_BY_ID.get(id)
  const [status, setStatus] = useState(incident?.status ?? 'detected')
  const [tab, setTab] = useState('overview')
  const [note, setNote] = useState('')
  const [entries, setEntries] = useState<Array<{ at: string; text: string }>>([])

  if (!incident) {
    return (
      <Drawer open onClose={close} title={t('Incident')} width="lg">
        <EmptyState title={t('Incident not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'incident', 'view', {
    wardId: incident.wardId,
    departmentId: incident.departmentId,
    classification: incident.classification,
  })
  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Incident')} width="lg">
        <AccessDeniedState reason={access.reason} resource="incident" action="view" />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={t('Incident')}
      title={incident.title}
      meta={
        <>
          <Badge tone="neutral" className="font-mono">
            {incident.reference}
          </Badge>
          <SeverityBadge severity={incident.severity} />
          <ConfidenceBadge confidence={incident.confidence} />
          <ClassificationBadge classification={incident.classification} />
        </>
      }
      tabs={
        <Tabs
          items={[
            { id: 'overview', label: t('Overview') },
            { id: 'response', label: t('Response'), count: incident.responseTeams.length },
            { id: 'timeline', label: t('Timeline'), count: incident.timeline.length + entries.length },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="Incident sections"
        />
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          <Button
            variant="outline"
            icon={<FileSearch className="h-3.5 w-3.5" />}
            disabled={incident.evidenceIds.length === 0}
            onClick={() => incident.evidenceIds[0] && push({ kind: 'evidence', id: incident.evidenceIds[0] })}
          >
            {t('Open evidence')}
          </Button>
        </>
      }
    >
      {tab === 'overview' ? (
        <div className="space-y-4">
          <Card tone="sunken">
            <p className="text-[0.8125rem] leading-relaxed text-ink-700">{incident.description}</p>
          </Card>
          <Card>
            <WorkflowStrip
              machine={incidentWorkflow}
              current={status}
              onTransition={(to, reason) => {
                setStatus(to)
                setEntries((prev) => [
                  {
                    at: new Date().toISOString(),
                    text: `${incidentWorkflow.labels[to]}${reason ? ` - ${sanitiseText(reason, 300)}` : ''}`,
                  },
                  ...prev,
                ])
              }}
            />
          </Card>
          <Card>
            <h4 className="label-institutional mb-2">{t('Situation')}</h4>
            <DefinitionList>
              <DefinitionRow label={t('Location')}>{incident.locationName}</DefinitionRow>
              <DefinitionRow label={t('Ward')}>{wardName(incident.wardId)}</DefinitionRow>
              <DefinitionRow label={t('Affected population')}>
                {formatCompact(incident.affectedPopulation)}{' '}
                <span className="text-ink-400">{t('(modelled estimate)')}</span>
              </DefinitionRow>
              <DefinitionRow label={t('Affected area')}>{t('{0} km²', incident.affectedAreaSqKm)}</DefinitionRow>
              <DefinitionRow label={t('Detected')}>{formatDateTime(incident.detectedAt)}</DefinitionRow>
              <DefinitionRow label={t('Owner')}>{officerDisplayName(incident.ownerId)}</DefinitionRow>
              <DefinitionRow label={t('Department')}>{departmentName(incident.departmentId)}</DefinitionRow>
              {incident.roadsImpacted.length > 0 ? (
                <DefinitionRow label={t('Roads impacted')}>{incident.roadsImpacted.join(', ')}</DefinitionRow>
              ) : null}
              {incident.hospitalsImpacted.length > 0 ? (
                <DefinitionRow label={t('Hospital access')}>{incident.hospitalsImpacted.join(', ')}</DefinitionRow>
              ) : null}
            </DefinitionList>
          </Card>
        </div>
      ) : null}

      {tab === 'response' ? (
        <div className="space-y-2">
          {incident.responseTeams.map((team) => (
            <Card key={team.id} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-govt-50 text-govt-700">
                <UserPlus className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-medium text-ink-800">{team.name}</p>
                <p className="text-[0.6875rem] text-ink-500">
                  {t('{0} · {1} personnel · {2}', team.type.replace('-', ' '), team.strength, wardName(team.wardId))}
                </p>
              </div>
              <Badge
                tone={
                  team.status === 'deployed'
                    ? 'positive'
                    : team.status === 'en-route'
                      ? 'warn'
                      : team.status === 'standby'
                        ? 'info'
                        : 'muted'
                }
                dot
              >
                {team.status.replace('-', ' ')}
              </Badge>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'timeline' ? (
        <div className="space-y-4">
          <Card>
            <h4 className="label-institutional mb-2">{t('Add a command log entry')}</h4>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('Record a field update or command instruction. Entries are attributed and retained.')}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="xs"
                variant="outline"
                disabled={note.trim().length < 3}
                onClick={() => {
                  setEntries((prev) => [{ at: new Date().toISOString(), text: sanitiseText(note) }, ...prev])
                  setNote('')
                }}
              >
                {t('Add entry')}
              </Button>
            </div>
          </Card>

          <ol className="space-y-0">
            {entries.map((entry, i) => (
              <li key={`live-${i}`} className="relative pb-4 pl-6">
                <span className="absolute top-4 bottom-0 left-[7px] w-px bg-ink-100" aria-hidden />
                <span className="absolute top-1 left-0 h-3.5 w-3.5 rounded-full border-2 border-intel-500 bg-surface" aria-hidden />
                <p className="text-xs font-medium text-ink-800">{t('Command log entry')}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-600">{entry.text}</p>
                <p className="mt-0.5 text-[0.625rem] text-ink-400">{formatRelative(entry.at)}</p>
              </li>
            ))}
            {[...incident.timeline].reverse().map((event, i, arr) => (
              <li key={event.id} className="relative pb-4 pl-6 last:pb-0">
                {i < arr.length - 1 ? (
                  <span className="absolute top-4 bottom-0 left-[7px] w-px bg-ink-100" aria-hidden />
                ) : null}
                <span
                  className={cn(
                    'absolute top-1 left-0 h-3.5 w-3.5 rounded-full border-2 bg-surface',
                    event.kind === 'escalation' ? 'border-crit-500' : event.kind === 'resolution' ? 'border-ok-500' : 'border-govt-500',
                  )}
                  aria-hidden
                />
                <p className="text-xs font-medium text-ink-800">{event.title}</p>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-600">{event.detail}</p>
                <p className="mt-0.5 text-[0.625rem] text-ink-400">
                  {event.actor} · {formatDateTime(event.at)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Drawer>
  )
}

/* ==========================================================================
   Ward drawer
   ========================================================================== */

export function WardDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const ward = WARD_BY_ID.get(id)

  if (!ward) {
    return (
      <Drawer open onClose={close} title={t('Ward')} width="md">
        <EmptyState title={t('Ward not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'ward', 'view', { wardId: ward.id })
  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Ward')} width="md">
        <AccessDeniedState reason={access.reason} resource="ward" action="view" />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="md"
      eyebrow={t('{0} · Zone {1}', ward.region, ward.zoneId.toUpperCase())}
      title={`${ward.code} - ${ward.name}`}
      meta={
        <>
          <StateBadge state={ward.state} />
          {ward.floodProne ? <Badge tone="warn">{'Flood-prone'}</Badge> : null}
          <Badge tone="muted">{t('Risk {0}/100', ward.riskScore)}</Badge>
        </>
      }
      footer={
        <Link to={`${ROUTES.wards}?ward=${ward.id}`}>
          <Button variant="primary" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
            {t('Open ward intelligence')}
          </Button>
        </Link>
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="label-institutional">{t('Operational health')}</h4>
            <span className="numeric text-metric-sm font-semibold text-ink-900">{ward.healthScore}/100</span>
          </div>
          <ProgressBar value={ward.healthScore} size="sm" />
        </Card>
        <Card>
          <h4 className="label-institutional mb-2">{t('Ward profile')}</h4>
          <DefinitionList>
            <DefinitionRow label={t('Population')}>{ward.population.toLocaleString('en-IN')}</DefinitionRow>
            <DefinitionRow label={t('Households')}>{ward.households.toLocaleString('en-IN')}</DefinitionRow>
            <DefinitionRow label={t('Area')}>{t('{0} km²', ward.areaSqKm)}</DefinitionRow>
            <DefinitionRow label={t('Density')}>
              {t('{0} per km²', Math.round(ward.population / ward.areaSqKm).toLocaleString('en-IN'))}
            </DefinitionRow>
            <DefinitionRow label={t('Ward Officer')}>{officerDisplayName(ward.wardOfficerId)}</DefinitionRow>
            <DefinitionRow label={t('Chronic waterlogging locations')}>{ward.waterloggingSpots}</DefinitionRow>
          </DefinitionList>
        </Card>
      </div>
    </Drawer>
  )
}

/* ==========================================================================
   Alert, Action, Security, Graph and Asset drawers
   ========================================================================== */

export function AlertDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const push = useDrawerStore((s) => s.push)
  const alert = ALERT_BY_ID.get(id)
  const [status, setStatus] = useState(alert?.status ?? 'open')

  if (!alert) {
    return (
      <Drawer open onClose={close} title={t('Alert')} width="md">
        <EmptyState title={t('Alert not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'alert', 'view', {
    wardIds: alert.wardIds,
    departmentId: alert.departmentId,
    classification: alert.classification,
  })
  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Alert')} width="md">
        <AccessDeniedState reason={access.reason} resource="alert" action="view" />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="md"
      eyebrow={t('Alert · {0}', DOMAIN_LABEL[alert.domain])}
      title={alert.title}
      meta={
        <>
          <SeverityBadge severity={alert.severity} />
          <ConfidenceBadge confidence={alert.confidence} />
          <ClassificationBadge classification={alert.classification} />
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          <Button
            variant="outline"
            icon={<FileSearch className="h-3.5 w-3.5" />}
            disabled={alert.evidenceIds.length === 0}
            onClick={() => alert.evidenceIds[0] && push({ kind: 'evidence', id: alert.evidenceIds[0] })}
          >
            {t('Open evidence')}
          </Button>
          {alert.intelligenceId ? (
            <Button variant="primary" onClick={() => push({ kind: 'intelligence', id: alert.intelligenceId! })}>
              {t('Open source intelligence')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <Card tone="sunken">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">{alert.description}</p>
        </Card>
        <Card>
          <WorkflowStrip machine={alertWorkflow} current={status} onTransition={(to) => setStatus(to)} />
        </Card>
        <Card>
          <h4 className="label-institutional mb-2">{t('Alert record')}</h4>
          <DefinitionList>
            <DefinitionRow label={t('Geography')}>{alert.wardIds.map((w) => wardName(w)).join(', ')}</DefinitionRow>
            <DefinitionRow label={t('Department')}>{departmentName(alert.departmentId)}</DefinitionRow>
            <DefinitionRow label={t('Source')}>{alert.source}</DefinitionRow>
            <DefinitionRow label={t('Owner')}>{alert.ownerId ? officerDisplayName(alert.ownerId) : 'Unassigned'}</DefinitionRow>
            <DefinitionRow label="SLA">
              {alert.slaHours}{' '}{t('h target ·')}{' '}
              <span className={alert.slaRemainingHours < 0 ? 'font-semibold text-crit-600' : ''}>
                {alert.slaRemainingHours < 0
                  ? `breached by ${Math.abs(alert.slaRemainingHours).toFixed(1)} h`
                  : `${alert.slaRemainingHours.toFixed(1)} h remaining`}
              </span>
            </DefinitionRow>
            <DefinitionRow label={t('Raised')}>{formatDateTime(alert.createdAt)}</DefinitionRow>
          </DefinitionList>
        </Card>
      </div>
    </Drawer>
  )
}

/**
 * A single field task.
 *
 * Read through the service rather than from the seed catalogue: a task raised
 * during the session - assigned from My Tasks, or created from the Copilot -
 * exists only in the in-session store, and reading the seed reported every one
 * of them as "not found". For the same reason its status changes and notes are
 * written through the service, so they survive being closed and reopened, are
 * seen by the officer the task is assigned to, and appear in the audit trail.
 */
export function ActionDrawer({ id }: { id: string }): React.JSX.Element {
  const close = useDrawerStore((s) => s.close)
  const actionQuery = useServiceQuery(queryKeys.action(id), (u) => actionService.get(u, id))
  const action = actionQuery.data

  const invalidations = [
    ['bmc-mii', 'action'],
    ['bmc-mii', 'actions'],
    ['bmc-mii', 'my-tasks'],
  ]
  const transitionAction = useServiceAction(
    (u, to: ActionStatus, reason?: string) => actionService.transition(u, id, to, reason),
    invalidations,
  )
  const addNote = useServiceAction((u, body: string) => actionService.addNote(u, id, body), invalidations)

  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (actionQuery.isLoading) {
    return (
      <Drawer open onClose={close} title={t('Action')} width="md">
        <LoadingState variant="block" rows={5} />
      </Drawer>
    )
  }

  if (!action) {
    return (
      <Drawer open onClose={close} title={t('Action')} width="md">
        <EmptyState title={t('Action not found')} detail={actionQuery.error?.message} />
      </Drawer>
    )
  }

  const run = async (work: Promise<unknown>): Promise<void> => {
    setActionError(null)
    setSaving(true)
    try {
      await work
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The change could not be recorded.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onClose={close}
      width="md"
      eyebrow={t('Action')}
      title={action.title}
      meta={
        <>
          <Badge tone="neutral" className="font-mono">
            {action.reference}
          </Badge>
          <SeverityBadge severity={action.priority} />
          <ClassificationBadge classification={action.classification} />
        </>
      }
      footer={
        <Button variant="ghost" onClick={close}>
          {t('Close')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Card tone="sunken">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">{action.description}</p>
        </Card>
        <Card>
          <WorkflowStrip
            machine={actionWorkflow}
            current={action.status}
            onTransition={(to, reason) => void run(transitionAction(to, reason || undefined))}
          />
        </Card>
        {actionError ? (
          <p className="text-[0.75rem] text-crit-600" role="alert">
            {actionError}
          </p>
        ) : null}
        <Card>
          <h4 className="label-institutional mb-2">{t('Assignment')}</h4>
          <DefinitionList>
            <DefinitionRow label={t('Owner')}>
              {ownerDisplayName(action.ownerId)}{' '}
              <span className="text-ink-400">({ownerDesignation(action.ownerId)})</span>
            </DefinitionRow>
            <DefinitionRow label={t('Department')}>{departmentName(action.departmentId)}</DefinitionRow>
            <DefinitionRow label={t('Wards')}>
              {action.wardIds.length > 0 ? action.wardIds.map((w) => wardName(w)).join(', ') : 'City-wide'}
            </DefinitionRow>
            <DefinitionRow label={t('Due')}>{formatDate(action.dueDate)}</DefinitionRow>
            <DefinitionRow label={t('Raised')}>{formatDateTime(action.createdAt)}</DefinitionRow>
            <DefinitionRow label={t('Raised by')}>{ownerDisplayName(action.createdBy)}</DefinitionRow>
          </DefinitionList>
        </Card>
        <Card>
          <h4 className="label-institutional mb-2">{t('Notes')}</h4>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Record progress or an obstruction.')} />
          <div className="mt-2 flex justify-end">
            <Button
              size="xs"
              variant="outline"
              disabled={note.trim().length < 3 || saving}
              onClick={() => {
                const body = sanitiseText(note)
                setNote('')
                void run(addNote(body))
              }}
            >
              {t('Add note')}
            </Button>
          </div>
          <ul className="mt-3 space-y-2">
            {action.notes.length === 0 ? (
              <li className="text-[0.6875rem] text-ink-400">{t('No notes recorded against this task yet.')}</li>
            ) : (
              action.notes.map((n) => (
                <li key={n.id} className="rounded-md bg-surface-sunken px-2.5 py-2">
                  <p className="text-xs leading-relaxed text-ink-700">{n.body}</p>
                  <p className="mt-1 text-[0.625rem] text-ink-400">
                    {n.authorName} · {formatRelative(n.createdAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </Drawer>
  )
}

export function SecurityEventDrawer({ id }: { id: string }): React.JSX.Element {
  const user = useCurrentUser()
  const close = useDrawerStore((s) => s.close)
  const event = SECURITY_EVENTS.find((e) => e.id === id)

  if (!event) {
    return (
      <Drawer open onClose={close} title={t('Security event')} width="md">
        <EmptyState title={t('Security event not found')} />
      </Drawer>
    )
  }

  const access = canAccess(user, 'security', 'view', { classification: event.classification })
  if (!access.allowed) {
    return (
      <Drawer open onClose={close} title={t('Security event')} width="md">
        <AccessDeniedState reason={access.reason} resource="security" action="view" />
      </Drawer>
    )
  }

  const policies = ACCESS_POLICIES.filter((p) => event.relatedPolicyIds.includes(p.id))
  const chain = AUDIT_EVENTS.filter((a) => a.actorId === event.subjectUserId).slice(0, 8)

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={t('Security event')}
      title={event.type.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
      meta={
        <>
          <Badge tone="neutral" className="font-mono">
            {event.reference}
          </Badge>
          <SeverityBadge severity={event.severity} />
          <ClassificationBadge classification={event.classification} />
        </>
      }
      footer={
        <Button variant="ghost" onClick={close}>
          {t('Close')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Card tone="critical">
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">{event.description}</p>
        </Card>
        <Card>
          <h4 className="label-institutional mb-2">{t('Affected principal and session')}</h4>
          <DefinitionList>
            <DefinitionRow label={t('Subject')}>{event.subjectUserName}</DefinitionRow>
            <DefinitionRow label={t('Role')}>{event.subjectRole ?? '-'}</DefinitionRow>
            <DefinitionRow label={t('Session')} mono>
              {event.sessionId ?? '-'}
            </DefinitionRow>
            <DefinitionRow label={t('Device')}>{event.device}</DefinitionRow>
            <DefinitionRow label={t('Source address')} mono>
              {event.sourceIpPlaceholder}
            </DefinitionRow>
            <DefinitionRow label={t('Detected')}>{formatDateTime(event.detectedAt)}</DefinitionRow>
            <DefinitionRow label={t('Status')}>{event.status}</DefinitionRow>
            <DefinitionRow label={t('Owner')}>{officerDisplayName(event.ownerId)}</DefinitionRow>
          </DefinitionList>
        </Card>
        <Card tone="info">
          <h4 className="label-institutional mb-1.5">{t('Recommended action')}</h4>
          <p className="text-xs leading-relaxed text-ink-600">{event.recommendedAction}</p>
        </Card>
        {policies.length > 0 ? (
          <Card>
            <h4 className="label-institutional mb-2">{t('Related access policies')}</h4>
            <ul className="space-y-2">
              {policies.map((policy) => (
                <li key={policy.id} className="rounded-md border border-ink-100 bg-surface-sunken px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={policy.effect === 'deny' ? 'critical' : 'positive'}>{policy.effect}</Badge>
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">{policy.name}</p>
                    <Badge tone="muted">{policy.status}</Badge>
                  </div>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{policy.description}</p>
                  <p className="mt-1 font-mono text-[0.625rem] text-ink-400">
                    {policy.conditions.map((c) => `${c.attribute} ${c.operator} ${c.value}`).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <h4 className="label-institutional mb-2">{t('Audit chain for this principal')}</h4>
          <ul className="space-y-1.5">
            {chain.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[0.6875rem]">
                <span
                  className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', a.outcome === 'denied' ? 'bg-crit-500' : 'bg-ok-500')}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-ink-600">
                  {a.action} · <span className="font-mono">{a.resourceId}</span>
                  {a.outcome === 'denied' ? <span className="ml-1 font-medium text-crit-600">denied</span> : null}
                </span>
                <span className="shrink-0 text-ink-400">{formatRelative(a.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Drawer>
  )
}

export function GraphNodeDrawer({ id }: { id: string }): React.JSX.Element {
  const close = useDrawerStore((s) => s.close)
  const open = useDrawerStore((s) => s.open)
  const node = GRAPH_NODE_BY_ID.get(id)
  const neighbours = useMemo(() => (node ? graphNeighbours(node.id) : []), [node])

  if (!node) {
    return (
      <Drawer open onClose={close} title={t('Entity')} width="md">
        <EmptyState title={t('Entity not found in the graph')} />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="md"
      eyebrow={t('Knowledge graph · {0}', node.kind)}
      title={node.label}
      description={node.subtitle}
      meta={
        <>
          <Badge tone="info">{DOMAIN_LABEL[node.domain]}</Badge>
          <ClassificationBadge classification={node.classification} />
          {node.severity ? <SeverityBadge severity={node.severity} /> : null}
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Close')}
          </Button>
          {node.route ? (
            <Link to={node.route}>
              <Button variant="primary" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                {t('Open in module')}
              </Button>
            </Link>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <Card>
          <h4 className="label-institutional mb-2">{t('Attributes')}</h4>
          <DefinitionList>
            {node.attributes.map((attr) => (
              <DefinitionRow key={attr.key} label={attr.key}>
                {attr.value}
              </DefinitionRow>
            ))}
          </DefinitionList>
        </Card>
        <Card>
          <h4 className="label-institutional mb-2">{t('Relationships ({0})', neighbours.length)}</h4>
          <ul className="space-y-1">
            {neighbours.slice(0, 24).map((n, i) => (
              <li key={`${n.node.id}-${i}`}>
                <button
                  type="button"
                  onClick={() => open({ kind: 'graph-node', id: n.node.id })}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ink-50"
                >
                  <Badge tone="muted" className="shrink-0">
                    {n.direction === 'outbound' ? GRAPH_RELATION_LABEL[n.relation] : `← ${GRAPH_RELATION_LABEL[n.relation]}`}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{n.node.label}</span>
                  <span className="shrink-0 text-[0.625rem] text-ink-400">{n.node.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Drawer>
  )
}

export function AssetDrawer({ id }: { id: string }): React.JSX.Element {
  const close = useDrawerStore((s) => s.close)
  const asset = ASSET_BY_ID.get(id)

  if (!asset) {
    return (
      <Drawer open onClose={close} title={t('Asset')} width="md">
        <EmptyState title={t('Asset not found')} />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="md"
      eyebrow={t('Municipal asset')}
      title={asset.name}
      meta={
        <>
          <StateBadge state={asset.state} />
          <SeverityBadge severity={asset.criticality} />
          <ClassificationBadge classification={asset.classification} />
        </>
      }
      footer={
        <Button variant="ghost" onClick={close}>
          {t('Close')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="label-institutional">{t('Condition index')}</h4>
            <span className="numeric text-metric-sm font-semibold text-ink-900">{asset.conditionIndex}/100</span>
          </div>
          <ProgressBar value={asset.conditionIndex} size="sm" />
        </Card>
        <Card>
          <DefinitionList>
            <DefinitionRow label={t('Category')}>{asset.category.replace('-', ' ')}</DefinitionRow>
            <DefinitionRow label={t('Ward')}>{wardName(asset.wardId)}</DefinitionRow>
            <DefinitionRow label={t('Department')}>{departmentName(asset.departmentId)}</DefinitionRow>
            <DefinitionRow label={t('Installed')}>{asset.installedYear}</DefinitionRow>
            <DefinitionRow label={t('Design life')}>{asset.designLifeYears} years</DefinitionRow>
            <DefinitionRow label={t('Age against design life')}>
              {2026 - asset.installedYear} years
              {2026 - asset.installedYear > asset.designLifeYears ? (
                <span className="ml-1 font-medium text-crit-600">{t('past design life')}</span>
              ) : null}
            </DefinitionRow>
            <DefinitionRow label={t('Replacement value')}>{formatCrore(asset.replacementValueCrore, 2)}</DefinitionRow>
            <DefinitionRow label={t('Last inspected')}>{formatRelative(asset.lastInspectedAt)}</DefinitionRow>
            <DefinitionRow label={t('Next inspection due')}>{formatDate(asset.nextInspectionDue)}</DefinitionRow>
            <DefinitionRow label={t('Open observations')}>{asset.openObservations}</DefinitionRow>
          </DefinitionList>
        </Card>
      </div>
    </Drawer>
  )
}

export function ContractDrawer({ id }: { id: string }): React.JSX.Element {
  const close = useDrawerStore((s) => s.close)
  const contract = CONTRACT_BY_ID.get(id)

  if (!contract) {
    return (
      <Drawer open onClose={close} title={t('Contract')} width="md">
        <EmptyState title={t('Contract not found')} />
      </Drawer>
    )
  }

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      eyebrow={t('Contract')}
      title={contract.title}
      meta={
        <>
          <Badge tone="neutral" className="font-mono">
            {contract.reference}
          </Badge>
          <Badge tone={contract.riskScore >= 60 ? 'critical' : contract.riskScore >= 42 ? 'warn' : 'positive'}>
            {t('Risk indicator {0}/100', contract.riskScore)}
          </Badge>
          <ClassificationBadge classification={contract.classification} />
        </>
      }
      footer={
        <Button variant="ghost" onClick={close}>
          {t('Close')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <h4 className="label-institutional mb-2">{t('Contract record')}</h4>
          <DefinitionList>
            <DefinitionRow label={t('Tender reference')} mono>
              {contract.tenderReference}
            </DefinitionRow>
            <DefinitionRow label={t('Contractor')}>{contractorName(contract.contractorId)}</DefinitionRow>
            <DefinitionRow label={t('Department')}>{departmentName(contract.departmentId)}</DefinitionRow>
            <DefinitionRow label={t('Value')}>{formatCrore(contract.valueCrore)}</DefinitionRow>
            <DefinitionRow label={t('Paid')}>{formatCrore(contract.paidCrore)}</DefinitionRow>
            <DefinitionRow label={t('Award date')}>{formatDate(contract.awardDate)}</DefinitionRow>
            <DefinitionRow label={t('Original end date')}>{formatDate(contract.originalEndDate)}</DefinitionRow>
            <DefinitionRow label={t('Current end date')}>{formatDate(contract.endDate)}</DefinitionRow>
            <DefinitionRow label={t('Extensions granted')}>{contract.extensions}</DefinitionRow>
            <DefinitionRow label={t('Variation')}>
              {formatCrore(contract.variationValueCrore)} ({contract.variationPct}%)
            </DefinitionRow>
            <DefinitionRow label={t('Milestones')}>
              {t('{0} of {1} achieved', contract.milestonesAchieved, contract.milestonesTotal)}
            </DefinitionRow>
          </DefinitionList>
        </Card>
        <Card>
          <h4 className="label-institutional mb-2">{t('Risk indicators')}</h4>
          <ContributionBars items={contract.riskIndicators} />
          <p className="mt-3 rounded-md bg-ink-50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('These indicators identify delivery and continuity risk for management attention. They are not findings, do not constitute an allegation, and must not be characterised as evidence of impropriety by any party.')}
          </p>
        </Card>
      </div>
    </Drawer>
  )
}
