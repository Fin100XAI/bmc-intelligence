import { useMemo, useState } from 'react'
import { AlertOctagon, ShieldCheck } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Card, CardHeader, DefinitionList, DefinitionRow, MetricGrid } from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { aiService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import type { AIIncident } from '@/types/ai'
import { AI_RISK_LABEL } from '@/types/ai'
import { AI_MODEL_BY_ID } from '@/data/ai.data'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/pages/ai/AIIncidentsPage.tsx
 *
 * AI Incidents.
 *
 * When an AI use case behaves in a way that warrants recording - a grounding
 * failure, a drift signal, a blocked request pattern - it becomes an incident
 * and moves through a fixed lifecycle:
 *
 *   Detected → Triaged → Contained → Resolved → Reviewed
 *
 * Recording AI incidents at all is the point. A platform that surfaces only its
 * AI successes is not being governed; this register makes the failures visible,
 * owned and closed on the record.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-30),
  refreshIntervalMinutes: 360,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const STAGES: AIIncident['status'][] = ['detected', 'triaged', 'contained', 'resolved', 'reviewed']
function build$STAGE_LABEL(): Record<AIIncident['status'], string> {
  return {
  detected: t('Detected'),
  triaged: t('Triaged'),
  contained: t('Contained'),
  resolved: t('Resolved'),
  reviewed: t('Reviewed'),
}
}
let STAGE_LABEL: Record<AIIncident['status'], string> = build$STAGE_LABEL()
registerLayer(() => {
  STAGE_LABEL = build$STAGE_LABEL()
})

function IncidentStages({ status }: { status: AIIncident['status'] }): React.JSX.Element {
  const activeIndex = STAGES.indexOf(status)
  return (
    <ol className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const reached = i <= activeIndex
        return (
          <li key={s} className="min-w-0 flex-1">
            <div
              className={cn(
                'flex h-6 items-center justify-center rounded-[2px] border px-1 text-[0.625rem] font-medium',
                reached ? 'border-govt-200 bg-govt-50 text-govt-700' : 'border-ink-100 bg-surface text-ink-400',
              )}
            >
              <span className="truncate">{STAGE_LABEL[s]}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function AIIncidentsPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(
    t('AI Incidents'),
    t('Every AI use case that behaves in a way warranting a record - a grounding failure, a drift signal, a blocked-request pattern - moves through a fixed lifecycle from detection to review. Recording the failures, not only the successes, is what makes the AI layer governed.'),
  )

  const query = useServiceQuery(queryKeys.ai('incidents-page'), (u) => aiService.incidents(u))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openOnly, setOpenOnly] = useState(false)

  const incidents = useMemo(() => query.data ?? [], [query.data])
  const filtered = useMemo(
    () => (openOnly ? incidents.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed') : incidents),
    [incidents, openOnly],
  )
  const selected = useMemo(
    () => filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  )

  if (query.isLoading) return <LoadingState variant="block" rows={6} />
  if (query.error) return <ErrorState detail={query.error.message} onRetry={() => query.refetch()} />

  const open = incidents.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed').length
  const critical = incidents.filter((i) => i.severity === 'critical' || i.severity === 'high').length
  const reviewed = incidents.filter((i) => i.status === 'reviewed').length

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('AI & Automation')}
        breadcrumbs={[{ label: t('AI & Automation') }, { label: t('AI Incidents') }]}
        freshness={FRESHNESS}
        actions={
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[2px] border px-2.5 text-xs font-medium transition-colors',
              openOnly ? 'border-govt-300 bg-govt-50 text-govt-700' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
            )}
          >
            {t('Open incidents only')}
          </button>
        }
      />

      {/* ── Two columns ─────────────────────────────────────────────
          The standing count of what is open, severe and closed, then the
          register itself, read down the wide column. The incident an officer
          has opened — its lifecycle position and the actions recorded against
          it — stands pinned beside the register. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <MetricGrid columns={3}>
            <MetricCard
              label={t('Open incidents')}
              value={open}
              tone={open > 0 ? 'critical' : 'positive'}
              support={t('Not yet resolved or reviewed')}
              icon={<AlertOctagon className="h-4 w-4" />}
            />
            <MetricCard label={t('High or critical')} value={critical} tone={critical > 0 ? 'warn' : 'default'} support={t('By severity, all statuses')} />
            <MetricCard label={t('Reviewed and closed')} value={reviewed} support={t('Completed the full lifecycle')} icon={<ShieldCheck className="h-4 w-4" />} />
          </MetricGrid>

          <Card flush>
            <CardHeader bordered title={t('Incident register')} description={t('Every recorded AI incident and its lifecycle position.')} />
            {filtered.length === 0 ? (
              <EmptyState title={t('No incidents')} detail={openOnly ? 'No open incidents. Clear the filter to see closed ones.' : 'No AI incidents are on the register.'} />
            ) : (
              <ul className="divide-y divide-ink-50">
                {filtered.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(incident.id)}
                      className={cn(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-ink-50/70',
                        selected?.id === incident.id && 'bg-govt-50/60',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[0.8125rem] font-semibold text-ink-900">{incident.title}</p>
                          <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                            {t('{0} · {1} · detected {2}', incident.reference, AI_RISK_LABEL[incident.category], formatRelative(incident.detectedAt))}
                          </p>
                        </div>
                        <SeverityBadge severity={incident.severity} />
                      </div>
                      <div className="mt-2">
                        <IncidentStages status={incident.status} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* The whole column pins, not one panel of it: a `sticky` element stays
            in flow, so a panel below a pinned one would slide up underneath it. */}
        <div className="xl:col-span-4">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            {selected ? (
              <>
                <Card>
                  <CardHeader
                    title={selected.title}
                    description={selected.reference}
                    actions={<SeverityBadge severity={selected.severity} />}
                  />
                  <div className="mt-3">
                    <IncidentStages status={selected.status} />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-ink-600">{selected.description}</p>
                  <DefinitionList className="mt-4">
                    <DefinitionRow label={t('Risk category')}>
                      <Badge tone="warn">{AI_RISK_LABEL[selected.category]}</Badge>
                    </DefinitionRow>
                    <DefinitionRow label={t('Model involved')}>
                      {AI_MODEL_BY_ID.get(selected.modelId)?.name ?? selected.modelId}
                    </DefinitionRow>
                    <DefinitionRow label={t('Requests affected')}>{selected.affectedRequests}</DefinitionRow>
                    <DefinitionRow label={t('Detected')}>{formatRelative(selected.detectedAt)}</DefinitionRow>
                    <DefinitionRow label={t('Current status')}>{STAGE_LABEL[selected.status]}</DefinitionRow>
                  </DefinitionList>
                </Card>

                <Card>
                  <CardHeader title={t('Actions taken')} description={t('The containment and remediation steps on the record.')} />
                  {selected.actionsTaken.length === 0 ? (
                    <p className="mt-2 text-xs text-ink-500">{t('No actions have been recorded against this incident yet.')}</p>
                  ) : (
                    <ol className="mt-3 space-y-2">
                      {selected.actionsTaken.map((action, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="numeric mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-govt-100 text-[0.625rem] font-semibold text-govt-700">
                            {i + 1}
                          </span>
                          <span className="text-[0.75rem] leading-relaxed text-ink-700">{action}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </>
            ) : null}

            <DemonstrationNotice />
          </div>
        </div>
      </div>
    </PageBody>
  )
}

export default AIIncidentsPage
