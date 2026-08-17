import { useMemo, useState } from 'react'
import { Network, Search } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Badge, ClassificationBadge } from '@/components/ui/badges'
import { DefinitionList, DefinitionRow, Input } from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState, PartialDataWarning } from '@/components/ui/states'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { useDebounced } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { infrastructureGraphService, type ScopedInfrastructureChain } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { GRAPH_ENTITY_LABEL, type GraphEntityKind } from '@/types/governance'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'

/**
 * src/pages/strategic/InfrastructureGraphPage.tsx
 *
 * City Infrastructure Graph.
 *
 * Where the Knowledge Graph lets an officer browse any entity, this screen
 * traces one accountability chain: pick a piece of infrastructure and see
 * everything the corporation holds about how it is delivered and maintained -
 * the ward it sits in, the department accountable for it, the contractor and
 * project delivering it, the budget funding it, the complaints and incidents
 * attached to it. Laid out by hops from the anchor, so the chain reads as a
 * chain.
 *
 * Both surfaces run on the same graph, so there is one truth about how the
 * city connects. This one exists to answer "who is accountable for this asset
 * and what is attached to it", which a free browse makes slower than it should
 * be.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-360),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const CANONICAL_CHAIN: Array<{ kind: GraphEntityKind; relation?: string }> = [
  { kind: 'asset' },
  { kind: 'ward', relation: 'located in' },
  { kind: 'department', relation: 'maintained under' },
  { kind: 'contractor', relation: 'executed by' },
  { kind: 'project', relation: 'delivered as' },
  { kind: 'complaint', relation: 'linked to' },
  { kind: 'budget', relation: 'funded by' },
  { kind: 'incident', relation: 'associated with' },
]

const KIND_TONE: Partial<Record<GraphEntityKind, string>> = {
  asset: 'bg-govt-100 text-govt-700',
  road: 'bg-govt-100 text-govt-700',
  ward: 'bg-intel-100 text-intel-700',
  department: 'bg-ink-100 text-ink-700',
  contractor: 'bg-warn-100 text-warn-700',
  project: 'bg-ok-100 text-ok-700',
  complaint: 'bg-risk-100 text-risk-700',
  incident: 'bg-crit-100 text-crit-700',
  budget: 'bg-ok-100 text-ok-700',
  facility: 'bg-govt-100 text-govt-700',
  hospital: 'bg-intel-100 text-intel-700',
}

export function InfrastructureGraphPage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(t('City Infrastructure Graph'))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounced(searchInput, 200)

  const anchorsQuery = useServiceQuery(queryKeys.infraGraph('anchors'), (u) =>
    infrastructureGraphService.anchors(u),
  )

  const anchors = useMemo(() => anchorsQuery.data ?? [], [anchorsQuery.data])

  const effectiveId = selectedId ?? anchors[0]?.node.id ?? null

  const chainQuery = useServiceQuery(
    queryKeys.infraGraph(`chain:${effectiveId}`),
    (u) => (effectiveId ? infrastructureGraphService.chain(u, effectiveId) : Promise.resolve(null)),
    { enabled: Boolean(effectiveId) },
  )

  const filteredAnchors = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return anchors
    return anchors.filter(
      (a) => a.node.label.toLowerCase().includes(q) || a.node.subtitle.toLowerCase().includes(q),
    )
  }, [anchors, debouncedSearch])

  if (anchorsQuery.isLoading) return <LoadingState variant="block" rows={6} />
  if (anchorsQuery.error) return <ErrorState detail={anchorsQuery.error.message} onRetry={() => anchorsQuery.refetch()} />

  const chain = chainQuery.data

  const byDepth = new Map<number, ScopedInfrastructureChain['nodes']>()
  if (chain) {
    for (const n of chain.nodes) {
      if (n.depth === 0) continue
      const bucket = byDepth.get(n.depth) ?? []
      bucket.push(n)
      byDepth.set(n.depth, bucket)
    }
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Intelligence')}
        breadcrumbs={[{ label: t('Strategic Intelligence') }, { label: t('City Infrastructure Graph') }]}
        freshness={FRESHNESS}
      />

      {/* ── Two columns ─────────────────────────────────────────────
          The spine and the traced chain read down the wide column; the anchor
          register that drives them stands beside, pinned, so an officer can
          move from asset to asset without losing the chain's place. On a
          narrow screen the register comes first, because nothing can be traced
          until an anchor is chosen. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="order-2 flex min-w-0 flex-col gap-3 xl:order-1 xl:col-span-8">
          {/* The canonical chain ------------------------------------------- */}
          <GovPanel dense tone="amber" title={t('The infrastructure accountability chain')} subtitle={t('Institutional methodology')}>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('The spine this graph is built to make traceable, from asset to attached incident.')}</p>
            <div className="scrollbar-slim flex items-center gap-1 overflow-x-auto px-3 pb-3">
              {CANONICAL_CHAIN.map((step, i) => (
                <div key={step.kind} className="flex shrink-0 items-center gap-1">
                  {i > 0 ? (
                    <span className="flex flex-col items-center px-0.5 text-ink-300">
                      <span className="text-[0.5625rem] whitespace-nowrap text-ink-400">{step.relation}</span>
                      <span aria-hidden>→</span>
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'rounded-[2px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap',
                      KIND_TONE[step.kind] ?? 'bg-surface-sunken text-ink-700',
                    )}
                  >
                    {GRAPH_ENTITY_LABEL[step.kind]}
                  </span>
                </div>
              ))}
            </div>
          </GovPanel>

          <GovPanel
            dense
            tone="red"
            title={chain ? `Chain from ${chain.anchor.label}` : 'Infrastructure chain'}
            actions={
              chain ? (
                <Badge tone="intel">
                  <Network className="mr-1 h-3 w-3" />
                  {chain.edges.length} links
                </Badge>
              ) : undefined
            }
          >
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
              {chain
                ? `${chain.nodes.length} connected entities across ${byDepth.size} hop(s) from the anchor.`
                : 'Select an anchor to trace its chain.'}
            </p>

            {chainQuery.isLoading ? (
              <LoadingState variant="block" rows={5} />
            ) : !chain ? (
              <EmptyState
                title={t('No readable chain')}
                detail="This anchor's chain contains nothing you are authorised to read."
              />
            ) : (
              <div className="space-y-4 px-3 pb-3">
                {chain.prunedNodes > 0 ? (
                  <PartialDataWarning
                    available={chain.nodes.length}
                    expected={chain.nodes.length + chain.prunedNodes}
                    detail={`${chain.prunedNodes} connected entit(y/ies) in this chain sit outside your authorised scope and have been pruned. The chain you see is complete for what you may read.`}
                  />
                ) : null}

                {/* Anchor -------------------------------------------- */}
                <div className="rounded-[2px] border-2 border-govt-200 bg-govt-50/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[0.625rem] font-semibold', KIND_TONE[chain.anchor.kind] ?? 'bg-ink-100 text-ink-700')}>
                      {GRAPH_ENTITY_LABEL[chain.anchor.kind]}
                    </span>
                    <ClassificationBadge classification={chain.anchor.classification} />
                  </div>
                  <p className="mt-1.5 text-[0.9375rem] font-semibold text-ink-900">{chain.anchor.label}</p>
                  <p className="text-[0.6875rem] text-ink-500">{chain.anchor.subtitle}</p>
                </div>

                {/* By depth ------------------------------------------ */}
                {[...byDepth.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([depth, nodes]) => (
                    <div key={depth}>
                      <p className="label-institutional mb-2">
                        {t('{0} hop{1} from anchor · {2} entit{3}', depth, depth > 1 ? 's' : '', nodes.length, nodes.length === 1 ? 'y' : 'ies')}
                      </p>
                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {nodes.map((n) => (
                          <li
                            key={n.node.id}
                            className="rounded-[2px] border border-ink-100 bg-surface p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn('rounded px-1.5 py-0.5 text-[0.625rem] font-semibold', KIND_TONE[n.node.kind] ?? 'bg-ink-100 text-ink-700')}>
                                {GRAPH_ENTITY_LABEL[n.node.kind]}
                              </span>
                              {n.viaRelation ? (
                                <span className="text-[0.625rem] text-ink-400">{n.viaRelation}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-[0.8125rem] font-medium text-ink-800">{n.node.label}</p>
                            <p className="truncate text-[0.6875rem] text-ink-500">{n.node.subtitle}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                {/* Composition --------------------------------------- */}
                <div className="border-t border-ink-100 pt-3">
                  <p className="label-institutional mb-2">{t('Chain composition')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {chain.composition.map((c) => (
                      <Badge key={c.kind} tone="muted">
                        {c.count} {c.label.toLowerCase()}
                        {c.count > 1 ? 's' : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </GovPanel>
        </div>

        {/* The whole column pins, not one panel of it: a `sticky` element stays
            in flow, so a panel below a pinned one would slide up underneath it. */}
        <div className="order-1 xl:order-2 xl:col-span-4">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            <GovPanel dense tone="amber" title={t('Infrastructure anchors')}>
              <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('Ranked by how much of the city fabric each connects to.')}</p>
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t('Search assets, roads, projects, facilities…')}
                    aria-label={t('Search infrastructure anchors')}
                    className="pl-8"
                  />
                </div>
              </div>
              <ul className="scrollbar-slim max-h-[32rem] overflow-y-auto px-2 pb-2">
                {filteredAnchors.length === 0 ? (
                  <li className="px-2 py-3 text-xs text-ink-400">{t('No anchor matches "{0}".', debouncedSearch)}</li>
                ) : (
                  filteredAnchors.map((a) => (
                    <li key={a.node.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(a.node.id)}
                        className={cn(
                          'w-full rounded-[2px] px-2.5 py-2 text-left transition-colors hover:bg-ink-50/70',
                          effectiveId === a.node.id && 'bg-govt-50/70',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[0.8125rem] font-medium text-ink-800">{a.node.label}</span>
                          <Badge tone="muted" size="sm">
                            {a.reach}
                          </Badge>
                        </div>
                        <p className="truncate text-[0.6875rem] text-ink-500">
                          {GRAPH_ENTITY_LABEL[a.node.kind]} · {a.node.subtitle}
                        </p>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </GovPanel>

            {chain && chain.accountableDepartments.length > 0 ? (
              <GovPanel tone="red" title={t('Accountable in this chain')}>
                <DefinitionList>
                  <DefinitionRow label={t('Departments')}>
                    {chain.accountableDepartments.join(', ')}
                  </DefinitionRow>
                  <DefinitionRow label={t('Entities in scope')}>{chain.nodes.length}</DefinitionRow>
                  <DefinitionRow label={t('Relationships')}>{chain.edges.length}</DefinitionRow>
                </DefinitionList>
              </GovPanel>
            ) : null}

            <DemonstrationNotice />
          </div>
        </div>
      </div>
    </PageBody>
  )
}

export default InfrastructureGraphPage
