import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, GitBranch, Search, Waypoints } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { graphService } from '@/services'
import { useDrawerStore, type DrawerKind } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { isoFromAnchor } from '@/utils/deterministic'
import { truncate } from '@/utils/format'
import { SEVERITY_LABEL, type Severity } from '@/types/common'
import { GRAPH_ENTITY_LABEL, GRAPH_RELATION_LABEL, type GraphEntityKind, type GraphNode, type GraphRelation } from '@/types/governance'
import {
  Button,
  Card,
  CardHeader,
  DefinitionList,
  DefinitionRow,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Input,
  LinkButton,
  LoadingState,
  SeverityBadge,
} from '@/components/ui'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Municipal Knowledge Graph - flagship exploration surface.
 *
 * Wards, departments, officers, roads, complaints, projects, contracts,
 * contractors, budgets, incidents, hospitals, facilities, assets, decisions,
 * documents and schemes as one connected corpus. `graphService.neighbourhood`
 * already returns a radial layout (focus centred, first-degree ring, second-
 * degree ring) in a 0–100 coordinate space; this page renders that layout
 * directly as SVG rather than recomputing it.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-180),
  refreshIntervalMinutes: 60,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const KIND_COLOUR: Record<GraphEntityKind, string> = {
  ward: '#2f6feb',
  department: '#0ea5b7',
  officer: '#8195ac',
  asset: '#f59e0b',
  road: '#f97316',
  project: '#7c3aed',
  contractor: '#0a8398',
  tender: '#c026d3',
  budget: '#10b981',
  complaint: '#e5484d',
  incident: '#dc2626',
  hospital: '#db2777',
  facility: '#65a30d',
  scheme: '#0369a1',
  decision: '#4338ca',
  document: '#6b7280',
}

/** Graph entity kinds that resolve to a real record drawer elsewhere in the
 * platform. Where no mapping exists, `route` ("Open in module") is the only
 * path to the underlying record - there is no generic drawer for it. */
const DRAWER_KIND_FOR: Partial<Record<GraphEntityKind, DrawerKind>> = {
  ward: 'ward',
  project: 'project',
  incident: 'incident',
  decision: 'decision',
  asset: 'asset',
  tender: 'contract',
}

const SEVERITY_COLOUR: Record<Severity, string> = {
  critical: '#e5484d',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#2f6feb',
  info: '#8195ac',
}

/** The canonical institutional relationship path, rendered as an explanatory
 * strip. Presentational copy only - not tied to a live traversal. */
function build$CANONICAL_PATH(): Array<{ label: string; relation?: GraphRelation }> {
  return [
  { label: GRAPH_ENTITY_LABEL.ward },
  { label: GRAPH_ENTITY_LABEL.road, relation: 'contains' },
  { label: GRAPH_ENTITY_LABEL.complaint, relation: 'affected-by' },
  { label: GRAPH_ENTITY_LABEL.department, relation: 'assigned-to' },
  { label: t('Contract'), relation: 'maintained-under' },
  { label: GRAPH_ENTITY_LABEL.contractor, relation: 'executed-by' },
  { label: GRAPH_ENTITY_LABEL.budget, relation: 'funded-by' },
  { label: GRAPH_ENTITY_LABEL.project, relation: 'linked-to' },
  { label: t('Outcome'), relation: 'assessed-through' },
]
}
let CANONICAL_PATH: Array<{ label: string; relation?: GraphRelation }> = build$CANONICAL_PATH()
registerLayer(() => {
  CANONICAL_PATH = build$CANONICAL_PATH()
})

function radiusFor(weight: number, isFocus: boolean): number {
  const base = 1.3 + Math.min(Math.max(weight, 0), 10) * 0.32
  return isFocus ? base + 1.3 : base
}

export function KnowledgeGraphPage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)

  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(
    t('Municipal Knowledge Graph'),
    t('How wards, roads, complaints, departments, contracts, contractors, budgets, projects, incidents, hospitals, assets and decisions connect. Search for any entity, then explore its first- and second-degree neighbourhood - every edge is a real, named institutional relationship.'),
  )

  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trail, setTrail] = useState<Array<{ id: string; label: string }>>([])
  const [kindFilter, setKindFilter] = useState<GraphEntityKind[]>([])
  const [relationFilter, setRelationFilter] = useState<GraphRelation[]>([])

  useEffect(() => {
    const entry = setTimeout(() => setDebouncedQuery(searchInput), 250)
    return () => clearTimeout(entry)
  }, [searchInput])

  const searchQuery = useServiceQuery(queryKeys.graph(`search:${debouncedQuery}`), (u) => graphService.search(u, debouncedQuery))
  const kindsQuery = useServiceQuery(queryKeys.graph('kinds'), () => graphService.kinds())
  const relationsQuery = useServiceQuery(queryKeys.graph('relations'), () => graphService.relations())
  const neighbourhoodQuery = useServiceQuery(
    queryKeys.graph(`nbhd:${selectedId ?? 'none'}:${kindFilter.join(',')}:${relationFilter.join(',')}`),
    (u) =>
      selectedId
        ? graphService.neighbourhood(u, selectedId, {
            kinds: kindFilter.length > 0 ? kindFilter : undefined,
            relations: relationFilter.length > 0 ? relationFilter : undefined,
          })
        : Promise.resolve({ focus: undefined, positioned: [], links: [] }),
    { enabled: Boolean(selectedId) },
  )

  // Land on a real entity as soon as the default (empty-query) search results.
  useEffect(() => {
    if (selectedId || trail.length > 0) return
    const first = searchQuery.data?.[0]
    if (first) selectFresh(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery.data])

  function selectFresh(node: GraphNode): void {
    setSelectedId(node.id)
    setTrail([{ id: node.id, label: node.label }])
  }

  function drillInto(node: GraphNode): void {
    setSelectedId(node.id)
    setTrail((prev) => [...prev, { id: node.id, label: node.label }])
  }

  function goToBreadcrumb(index: number): void {
    const entry = trail[index]
    if (!entry) return
    setTrail((prev) => prev.slice(0, index + 1))
    setSelectedId(entry.id)
  }

  function goBack(): void {
    if (trail.length < 2) return
    goToBreadcrumb(trail.length - 2)
  }

  function toggleKind(kind: GraphEntityKind): void {
    setKindFilter((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]))
  }

  function toggleRelation(relation: GraphRelation): void {
    setRelationFilter((prev) => (prev.includes(relation) ? prev.filter((r) => r !== relation) : [...prev, relation]))
  }

  const groupedResults = useMemo(() => {
    const groups = new Map<GraphEntityKind, GraphNode[]>()
    for (const node of searchQuery.data ?? []) {
      const bucket = groups.get(node.kind) ?? []
      bucket.push(node)
      groups.set(node.kind, bucket)
    }
    return Array.from(groups.entries())
  }, [searchQuery.data])

  const neighbourhood = neighbourhoodQuery.data
  const posById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const p of neighbourhood?.positioned ?? []) map.set(p.node.id, { x: p.x, y: p.y })
    return map
  }, [neighbourhood])

  const relationsGrouped = useMemo(() => {
    const groups = new Map<GraphRelation, Array<{ node: GraphNode }>>()
    for (const p of neighbourhood?.positioned ?? []) {
      if (p.ring === 0 || !p.relation) continue
      const bucket = groups.get(p.relation) ?? []
      bucket.push({ node: p.node })
      groups.set(p.relation, bucket)
    }
    return Array.from(groups.entries())
  }, [neighbourhood])

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Urban Intelligence')}
        breadcrumbs={[{ label: t('Strategic Urban Intelligence') }, { label: t('Municipal Knowledge Graph') }]}
        freshness={FRESHNESS}
      />

      <Card flush>
        <CardHeader
          className="px-4 pt-4"
          icon={<Waypoints className="h-4 w-4" />}
          eyebrow={t('Institutional methodology')}
          title={t('The canonical relationship path')}
          description={t('The chain this graph is built to make traceable, ward to measured outcome.')}
        />
        <div className="scrollbar-slim flex items-center gap-1 overflow-x-auto px-4 pb-4">
          {CANONICAL_PATH.map((step, i) => (
            <div key={step.label} className="flex shrink-0 items-center gap-1">
              {i > 0 ? (
                <span className="flex flex-col items-center px-0.5 text-ink-300">
                  <span className="text-[0.5625rem] whitespace-nowrap text-ink-400">
                    {step.relation ? GRAPH_RELATION_LABEL[step.relation] : ''}
                  </span>
                  <span aria-hidden>→</span>
                </span>
              ) : null}
              <span className="rounded-[2px] border border-ink-100 bg-surface-sunken px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink-700">
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Three columns ───────────────────────────────────────────
          How the surface is actually worked: find the entity on the left,
          read its neighbourhood in the middle, and take the record itself off
          the right. Stacking those as rows made the graph and the record it
          describes impossible to hold in view at once. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — finding the entity -------------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-3">
          <Card>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-300" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('Search wards, roads, complaints, projects, contractors, budgets, hospitals, decisions…')}
                aria-label={t('Search the knowledge graph')}
                className="pl-8"
              />
            </div>

            {searchQuery.isLoading ? <LoadingState variant="inline" className="mt-2" /> : null}
            {searchQuery.error ? <ErrorState className="mt-2" detail={searchQuery.error.message} onRetry={() => searchQuery.refetch()} compact /> : null}

            {!searchQuery.isLoading && !searchQuery.error ? (
              (searchQuery.data ?? []).length === 0 ? (
                <p className="mt-3 text-xs text-ink-400">{t('No entities match "{0}".', debouncedQuery)}</p>
              ) : (
                <div className="scrollbar-slim mt-3 max-h-64 space-y-3 overflow-y-auto">
                  {groupedResults.map(([kind, nodes]) => (
                    <div key={kind}>
                      <p className="label-institutional mb-1 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLOUR[kind] }} aria-hidden />
                        {GRAPH_ENTITY_LABEL[kind]} ({nodes.length})
                      </p>
                      <ul className="space-y-0.5">
                        {nodes.map((node) => (
                          <li key={node.id}>
                            <button
                              type="button"
                              onClick={() => selectFresh(node)}
                              className={
                                'flex w-full items-center justify-between gap-2 rounded-[2px] px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink-50 ' +
                                (selectedId === node.id ? 'bg-govt-50 text-govt-800' : 'text-ink-700')
                              }
                            >
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{node.label}</span>
                                <span className="ml-1.5 truncate text-[0.6875rem] text-ink-400">{node.subtitle}</span>
                              </span>
                              {node.severity ? <SeverityBadge severity={node.severity} /> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </Card>

          <Card>
            <CardHeader
              icon={<GitBranch className="h-4 w-4" />}
              title={t('Filters')}
              description={t('Restrict the rendered neighbourhood by entity kind or relationship type.')}
            />
            <div className="mt-2 space-y-2">
              <div>
                <p className="mb-1 text-[0.6875rem] font-medium text-ink-500">{t('Entity kind')}</p>
                <div className="flex flex-wrap gap-1">
                  {(kindsQuery.data ?? []).map(({ kind, label }) => (
                    <button
                      key={kind}
                      type="button"
                      // Selection is otherwise conveyed by colour alone,
                      // which assistive technology cannot read.
                      aria-pressed={kindFilter.includes(kind)}
                      onClick={() => toggleKind(kind)}
                      className={
                        'rounded px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset transition-colors ' +
                        (kindFilter.includes(kind)
                          ? 'bg-govt-700 text-white ring-govt-700'
                          : 'bg-surface text-ink-600 ring-ink-200 hover:bg-ink-50')
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[0.6875rem] font-medium text-ink-500">{t('Relationship')}</p>
                <div className="flex flex-wrap gap-1">
                  {(relationsQuery.data ?? []).map(({ relation, label }) => (
                    <button
                      key={relation}
                      type="button"
                      aria-pressed={relationFilter.includes(relation)}
                      onClick={() => toggleRelation(relation)}
                      className={
                        'rounded px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset transition-colors ' +
                        (relationFilter.includes(relation)
                          ? 'bg-intel-700 text-white ring-intel-700'
                          : 'bg-surface text-ink-600 ring-ink-200 hover:bg-ink-50')
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {(kindFilter.length > 0 || relationFilter.length > 0) && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setKindFilter([])
                    setRelationFilter([])
                  }}
                >
                  {t('Clear filters')}
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Column 2 — the neighbourhood itself --------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-6">
          <Card flush>
            <CardHeader
              className="px-4 pt-4 pb-3"
              title={t('Neighbourhood')}
              description={t('Focus node centred, first-degree neighbours on the inner ring, second-degree on the outer ring. Node size reflects institutional weight; colour reflects entity kind; a red ring marks a recorded severity.')}
              actions={
                trail.length > 1 ? (
                  <Button size="xs" variant="outline" icon={<ArrowLeft className="h-3 w-3" />} onClick={goBack}>
                    {t('Back')}
                  </Button>
                ) : undefined
              }
            />
            {trail.length > 0 ? (
              <nav aria-label={t('Breadcrumb')} className="scrollbar-slim flex items-center gap-1 overflow-x-auto px-4 pb-2 text-[0.6875rem]">
                {trail.map((crumb, i) => (
                  <span key={`${crumb.id}-${i}`} className="flex shrink-0 items-center gap-1">
                    {i > 0 ? <span className="text-ink-300">/</span> : null}
                    <button
                      type="button"
                      onClick={() => goToBreadcrumb(i)}
                      className={i === trail.length - 1 ? 'font-semibold text-ink-800' : 'text-ink-500 hover:text-govt-600'}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
            ) : null}

            {!selectedId ? (
              <EmptyState className="m-4" title={t('Select an entity')} detail="Search above, or choose a result, to explore its neighbourhood." />
            ) : neighbourhoodQuery.isLoading ? (
              <LoadingState variant="chart" className="m-4 h-[26rem]" />
            ) : neighbourhoodQuery.error ? (
              <ErrorState className="m-4" detail={neighbourhoodQuery.error.message} onRetry={() => neighbourhoodQuery.refetch()} />
            ) : !neighbourhood?.focus ? (
              <EmptyState className="m-4" title={t('Entity not found')} detail="This entity could not be resolved. It may fall outside your authorised scope." />
            ) : (
              <div className="px-4 pb-4">
                <div className="aspect-square w-full overflow-hidden rounded-[2px] border border-ink-100 bg-[#fbfcfe]">
                  <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={t('Neighbourhood of {0}', neighbourhood.focus.label)}>
                    {neighbourhood.links.map((link) => {
                      const from = posById.get(link.from)
                      const to = posById.get(link.to)
                      if (!from || !to) return null
                      return (
                        <g key={`${link.from}->${link.relation}->${link.to}`}>
                          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#c7d2e0" strokeWidth={0.35} />
                          <text
                            x={(from.x + to.x) / 2}
                            y={(from.y + to.y) / 2}
                            fontSize={1.7}
                            fill="#8195ac"
                            textAnchor="middle"
                            className="select-none"
                          >
                            {GRAPH_RELATION_LABEL[link.relation]}
                          </text>
                        </g>
                      )
                    })}
                    {neighbourhood.positioned.map((p) => {
                      const radius = radiusFor(p.node.weight, p.ring === 0)
                      const isSelectable = p.ring !== 0
                      return (
                        <g
                          key={p.node.id}
                          transform={`translate(${p.x} ${p.y})`}
                          className={isSelectable ? 'cursor-pointer' : undefined}
                          onClick={isSelectable ? () => drillInto(p.node) : undefined}
                          tabIndex={isSelectable ? 0 : undefined}
                          role={isSelectable ? 'button' : undefined}
                          onKeyDown={
                            isSelectable
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    drillInto(p.node)
                                  }
                                }
                              : undefined
                          }
                        >
                          {p.node.severity ? (
                            <circle r={radius + 1} fill="none" stroke={SEVERITY_COLOUR[p.node.severity]} strokeWidth={0.55} opacity={0.85} />
                          ) : null}
                          <circle r={radius} fill={KIND_COLOUR[p.node.kind]} opacity={p.ring === 0 ? 1 : 0.9} stroke="#ffffff" strokeWidth={0.35} />
                          {p.ring < 2 ? (
                            <text
                              y={radius + 2.8}
                              textAnchor="middle"
                              fontSize={p.ring === 0 ? 2.3 : 1.9}
                              fontWeight={p.ring === 0 ? 700 : 500}
                              fill="#16212f"
                              className="select-none"
                            >
                              {truncate(p.node.label, p.ring === 0 ? 24 : 18)}
                            </text>
                          ) : null}
                          <title>
                            {p.node.label} - {GRAPH_ENTITY_LABEL[p.node.kind]}
                            {p.relation ? ` · ${GRAPH_RELATION_LABEL[p.relation]}` : ''}
                            {p.node.severity ? ` · ${SEVERITY_LABEL[p.node.severity]}` : ''}
                          </title>
                        </g>
                      )
                    })}
                  </svg>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-ink-400">
                  <span>{t('Node size = institutional weight')}</span>
                  <span>{t('· Coloured ring = recorded severity')}</span>
                  <span>{t('· Click a neighbour to re-centre')}</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Column 3 — the record the graph is pointing at ---------- */}
        <div className="xl:col-span-3">
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
            {neighbourhood?.focus ? (
              <Card>
                <CardHeader
                  eyebrow={GRAPH_ENTITY_LABEL[neighbourhood.focus.kind]}
                  title={neighbourhood.focus.label}
                  description={neighbourhood.focus.subtitle}
                  actions={neighbourhood.focus.severity ? <SeverityBadge severity={neighbourhood.focus.severity} /> : undefined}
                />

                <DefinitionList className="mt-3">
                  {neighbourhood.focus.attributes.map((attr) => (
                    <DefinitionRow key={attr.key} label={attr.key}>
                      {attr.value}
                    </DefinitionRow>
                  ))}
                </DefinitionList>

                <div className="mt-3 flex flex-col gap-1.5">
                  {DRAWER_KIND_FOR[neighbourhood.focus.kind] ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => {
                        const kind = DRAWER_KIND_FOR[neighbourhood.focus!.kind]
                        if (kind) openDrawer({ kind, id: neighbourhood.focus!.id.replace(/^kg-/, '') })
                      }}
                    >
                      {t('Open full record')}
                    </Button>
                  ) : null}
                  {neighbourhood.focus.route ? (
                    <LinkButton to={neighbourhood.focus.route} variant="outline" size="sm" className="w-full justify-center" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                      {t('Open in module')}
                    </LinkButton>
                  ) : null}
                </div>

                <div className="mt-4 border-t border-ink-100 pt-3">
                  <p className="label-institutional mb-2">{t('Relationships ({0})', neighbourhood.positioned.length - 1)}</p>
                  {relationsGrouped.length === 0 ? (
                    <p className="text-xs text-ink-400">{t('No neighbouring entity matches the current filters.')}</p>
                  ) : (
                    <div className="space-y-2.5">
                      {relationsGrouped.map(([relation, nodes]) => (
                        <div key={relation}>
                          <p className="mb-1 text-[0.6875rem] font-medium text-ink-500">
                            {GRAPH_RELATION_LABEL[relation]} ({nodes.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {nodes.map(({ node }) => (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => drillInto(node)}
                                className="flex items-center gap-1 rounded bg-ink-50 px-1.5 py-0.5 text-[0.6875rem] text-ink-700 transition-colors hover:bg-govt-50 hover:text-govt-800"
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLOUR[node.kind] }} aria-hidden />
                                {truncate(node.label, 26)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <EmptyState title={t('No entity focused')} detail="Select an entity from search to see its attributes and relationships here." />
            )}

            <DemonstrationNotice />
          </div>
        </div>
      </div>
    </PageBody>
  )
}

export default KnowledgeGraphPage
