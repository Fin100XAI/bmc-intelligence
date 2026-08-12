import { useMemo, useState } from 'react'
import { Archive, BookOpen, Lightbulb, Link2, Search } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { Card, CardHeader, Input, MetricGrid, Select } from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MetricCard } from '@/components/cards/MetricCard'
import { useServiceQuery, useDebounced } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { knowledgeService } from '@/services'
import { MEMORY_KIND_LABEL, type MemoryKind } from '@/types/knowledge'
import { departmentName } from '@/data/reference'
import { DOMAIN_LABEL } from '@/types/common'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/strategic/InstitutionalMemoryPage.tsx
 *
 * Municipal Institutional Memory.
 *
 * The corporation's durable record of what it has decided, faced and learned —
 * so a new officer facing a situation can ask what was done last time and read
 * the answer, rather than rediscovering it. Selecting a record surfaces the
 * similar past records and, crucially, the actions that were taken, with the
 * basis for each match shown so the officer can trust why it surfaced.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-1440),
  refreshIntervalMinutes: 10080,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const KIND_TONE: Record<MemoryKind, string> = {
  decision: 'bg-govt-100 text-govt-700',
  incident: 'bg-crit-100 text-crit-700',
  lesson: 'bg-ok-100 text-ok-700',
  'project-outcome': 'bg-intel-100 text-intel-700',
  sop: 'bg-ink-100 text-ink-700',
  meeting: 'bg-warn-100 text-warn-700',
  'audit-observation': 'bg-risk-100 text-risk-700',
  intervention: 'bg-govt-100 text-govt-700',
}

export function InstitutionalMemoryPage(): React.JSX.Element {
  const [kind, setKind] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounced(searchInput, 200)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filters = useMemo(
    () => ({ ...(kind ? { kind: kind as MemoryKind } : {}), ...(search ? { search } : {}) }),
    [kind, search],
  )

  const summaryQuery = useServiceQuery(queryKeys.knowledge('summary'), (u) => knowledgeService.summary(u))
  const recordsQuery = useServiceQuery(queryKeys.knowledge(`records:${kind}:${search}`), (u) =>
    knowledgeService.records(u, filters),
  )

  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data])
  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) ?? records[0] ?? null,
    [records, selectedId],
  )

  const similarQuery = useServiceQuery(
    queryKeys.knowledge(`similar:${selected?.id ?? 'none'}`),
    (u) => (selected ? knowledgeService.similar(u, selected.id) : Promise.resolve([])),
    { enabled: Boolean(selected) },
  )

  if (summaryQuery.isLoading) return <LoadingState variant="metrics" />
  if (summaryQuery.error) return <ErrorState detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} />

  const summary = summaryQuery.data
  const similar = similarQuery.data ?? []

  const kindOptions = [
    { value: '', label: t('All record kinds') },
    ...Object.entries(MEMORY_KIND_LABEL).map(([value, label]) => ({ value, label })),
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Intelligence')}
        title={t('Municipal Institutional Memory')}
        description={t('What the corporation has decided, faced and learned, kept as a durable record. When a situation recurs, an officer can read what was done last time and what it taught — continuity of institutional knowledge, not its rediscovery.')}
        breadcrumbs={[{ label: t('Strategic Intelligence') }, { label: t('Institutional Memory') }]}
        freshness={FRESHNESS}
        controls={
          <>
            <div className="relative w-full max-w-[18rem]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('Search decisions, incidents, lessons…')}
                aria-label={t('Search institutional memory')}
                className="pl-8"
              />
            </div>
            <div className="w-full max-w-[14rem]">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('Filter by record kind')} options={kindOptions} />
            </div>
          </>
        }
      />

      <DemonstrationNotice />

      <MetricGrid columns={4}>
        <MetricCard label={t('Records held')} value={summary?.total ?? 0} support={t('Across every record kind')} icon={<Archive className="h-4 w-4" />} />
        <MetricCard
          label={t('Lessons learned')}
          value={summary?.byKind.find((k) => k.kind === 'lesson')?.count ?? 0}
          support={t('Durable lessons on record')}
          icon={<Lightbulb className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Decisions & interventions')}
          value={
            (summary?.byKind.find((k) => k.kind === 'decision')?.count ?? 0) +
            (summary?.byKind.find((k) => k.kind === 'intervention')?.count ?? 0)
          }
          support={t('With recorded outcomes')}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <MetricCard
          label={t('SOPs')}
          value={summary?.byKind.find((k) => k.kind === 'sop')?.count ?? 0}
          support={t('Standard operating procedures')}
        />
      </MetricGrid>

      <SplitLayout
        asideWidth="lg"
        main={
          <Card flush>
            <CardHeader bordered title={t('The record')} description={t('Ranked by significance, most significant first.')} />
            {records.length === 0 ? (
              <EmptyState title={t('No records match')} detail="Relax the filter or search to widen the set." />
            ) : (
              <ul className="divide-y divide-ink-50">
                {records.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-ink-50/70',
                        selected?.id === r.id && 'bg-govt-50/60',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('rounded px-1.5 py-0.5 text-[0.625rem] font-semibold', KIND_TONE[r.kind])}>
                              {MEMORY_KIND_LABEL[r.kind]}
                            </span>
                            <span className="text-[0.625rem] text-ink-400">{DOMAIN_LABEL[r.domain]}</span>
                          </div>
                          <p className="mt-1 truncate text-[0.8125rem] font-semibold text-ink-900">{r.title}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <SeverityBadge severity={r.significance} />
                          <span className="text-[0.625rem] text-ink-400">{formatRelative(r.occurredAt)}</span>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-relaxed text-ink-500">{r.summary}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        }
        aside={
          selected ? (
            <>
              <Card>
                <CardHeader
                  title={selected.title}
                  description={`${MEMORY_KIND_LABEL[selected.kind]} · ${DOMAIN_LABEL[selected.domain]} · ${departmentName(selected.departmentId)}`}
                  actions={<SeverityBadge severity={selected.significance} />}
                />
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="label-institutional mb-1">{t('Situation')}</p>
                    <p className="text-xs leading-relaxed text-ink-600">{selected.summary}</p>
                  </div>
                  <div>
                    <p className="label-institutional mb-1">{t('What was done')}</p>
                    <p className="text-xs leading-relaxed text-ink-600">{selected.outcome}</p>
                  </div>
                  <div className="rounded-lg border border-ok-100 bg-ok-50/40 p-2.5">
                    <p className="label-institutional mb-1 flex items-center gap-1 text-ok-700">
                      <Lightbulb className="h-3 w-3" />{' '}{t('Lesson carried forward')}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-700">{selected.lesson}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {selected.tags.map((tag) => (
                    <Badge key={tag} tone="muted" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader
                  icon={<Link2 className="h-4 w-4" />}
                  title={t('Similar past records')}
                  description={t('What the corporation did in comparable situations — with the basis for each match.')}
                />
                {similarQuery.isLoading ? (
                  <LoadingState variant="inline" className="mt-2" />
                ) : similar.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-500">{t('No comparable record found in your scope.')}</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {similar.map((s) => (
                      <li key={s.record.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(s.record.id)}
                          className="w-full rounded-lg border border-ink-100 p-2.5 text-left transition-colors hover:bg-ink-50/70"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-[0.8125rem] font-medium text-ink-800">{s.record.title}</p>
                            <Badge tone="intel" size="sm">
                              {Math.round(s.relevance * 100)}%
                            </Badge>
                          </div>
                          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">{s.record.outcome}</p>
                          <p className="mt-1 text-[0.625rem] text-ink-400">{t('Matched on {0}', s.basis.join(' · '))}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : null
        }
      />
    </PageBody>
  )
}

export default InstitutionalMemoryPage
