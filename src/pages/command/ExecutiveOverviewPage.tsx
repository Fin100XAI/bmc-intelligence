import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, FileSearch, Printer, RefreshCw, Save, Sparkles } from 'lucide-react'
import { PageBody } from '@/components/layout/PageHeader'
import { Button, ProgressBar } from '@/components/ui/primitives'
import { Badge, ConfidenceBadge, SeverityBadge, StateBadge } from '@/components/ui/badges'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { TrendChart } from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { GovPanel, GovRow, GovStat, GovStripCell } from '@/components/gov/GovPanel'
import { LiveFeed, buildFeed } from '@/components/gov/LiveFeed'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { monsoonService, projectService, roadsService, wardService, aiService } from '@/services'
import { buildCityPosition } from '@/domains'
import { getAIProvider, type ExecutiveBrief, type ExecutiveBriefSection } from '@/ai'
import { useDrawerStore } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import { wardName } from '@/data/reference'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCrore, formatDateTime, formatPercent } from '@/utils/format'
import type { AIResponse } from '@/types/ai'
import { DOMAIN_LABEL } from '@/types/common'
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from '@/types/operations'
import { t } from '@/i18n'

/**
 * Executive Overview — the corporation's own record of its position.
 *
 * Presented as an administrative return rather than as a dashboard. The
 * distinction drives every layout decision here:
 *
 *  - **Columns, read downward.** A tile mosaic asks the reader to scan for the
 *    number they want. A departmental return puts figures in a column so they
 *    can be read in order and compared against the one above. The three
 *    columns are the city's condition, what has just happened, and what the
 *    administration is carrying — which is how a commissioner's morning
 *    briefing is actually structured.
 *
 *  - **Ruled panels, not floating cards.** Square corners, hairline borders,
 *    a titled navy band on each block. Shadowed rounded tiles read as product
 *    widgets; ruled sections read as a record of a public body.
 *
 *  - **A live updates column.** Every administration publishes one. It answers
 *    "has anything happened?" without navigating, and it is the surface an
 *    officer glances at between tasks.
 *
 * The AI brief keeps its place at the foot, unchanged in substance: advisory,
 * evidence-backed, and never the thing that decides.
 */

function mapDefined<T>(items: T[] | undefined): T[] {
  return items ?? []
}

export function ExecutiveOverviewPage(): React.JSX.Element {
  const user = useCurrentUser()
  const corporation = useActiveCorporation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const openDrawer = useDrawerStore((s) => s.open)

  const [brief, setBrief] = useState<ExecutiveBrief | null>(null)
  const [briefStatus, setBriefStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')
  const [briefError, setBriefError] = useState<string | null>(null)
  const [briefSaved, setBriefSaved] = useState(false)
  const [copyConfirmed, setCopyConfirmed] = useState(false)

  const cityPosition = useMemo(() => buildCityPosition(), [])
  const feed = useMemo(() => buildFeed(user, DEMO_NOW), [user])

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(
    t('{0} Operational Intelligence', corporation.city),
    t(
      'The city-level operational position across every domain — composite health, ward risk, emerging signals and financial and infrastructure standing.',
    ),
  )

  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))
  const readinessQuery = useServiceQuery(queryKeys.monsoon('exec-readiness'), (u) => monsoonService.readiness(u))
  const projectsQuery = useServiceQuery(queryKeys.projects('exec-overview'), (u) => projectService.list(u, { pageSize: 300 }))
  const defectsQuery = useServiceQuery(queryKeys.roads('exec-defects'), (u) => roadsService.rankedDefects(u, 3))
  const serviceHealthQuery = useServiceQuery(queryKeys.wards('citizen-services'), async (u) => {
    const wards = await wardService.list(u)
    const profiles = await Promise.all(wards.map((w) => wardService.profile(u, w.id)))
    const byCategory = new Map<ComplaintCategory, { slaSum: number; count: number; open: number }>()
    for (const p of profiles) {
      for (const s of p.services.byCategory) {
        const bucket = byCategory.get(s.category) ?? { slaSum: 0, count: 0, open: 0 }
        bucket.slaSum += s.slaCompliancePct
        bucket.count += 1
        bucket.open += s.open
        byCategory.set(s.category, bucket)
      }
    }
    return Array.from(byCategory.entries())
      .map(([category, b]) => ({ category, avgSla: b.count > 0 ? b.slaSum / b.count : 0, open: b.open }))
      .sort((a, b) => a.avgSla - b.avgSla)
  })

  const doSaveBrief = useServiceAction(
    (u, title: string, response: AIResponse) => aiService.saveBrief(u, 'executive-brief', title, response),
    [],
  )

  async function generateBrief(): Promise<void> {
    if (!user) return
    setBriefStatus('loading')
    setBriefError(null)
    setBriefSaved(false)
    try {
      const result = await getAIProvider().generateExecutiveBrief({ user })
      setBrief(result)
      setBriefStatus('ready')
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'The executive brief could not be generated.')
      setBriefStatus('error')
    }
  }

  useEffect(() => {
    if (searchParams.get('action') === 'brief') {
      void generateBrief()
    }
    // Runs once for the entry-point deep link only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function briefToAIResponse(b: ExecutiveBrief): AIResponse {
    return {
      id: b.id,
      requestId: b.id,
      useCase: 'executive-brief',
      answer: b.sections.map((s) => `${s.heading}: ${s.body}`).join('\n\n'),
      keyFindings: b.sections.flatMap((s) => s.bullets),
      evidence: [],
      confidence: b.confidence,
      confidenceRationale: t(
        'Derived from {0} evidence reference(s) across {1} section(s).',
        b.sections.reduce((n, s) => n + s.evidenceIds.length, 0),
        b.sections.length,
      ),
      recommendedActions: [],
      risksAndLimitations: b.limitations,
      sources: [],
      generatedAt: b.generatedAt,
      dataFreshnessLabel: b.dataFreshnessLabel,
      grounding: 'evidence-backed',
      modelId: b.modelId,
      domains: Array.from(new Set(b.sections.flatMap((s) => s.domains))),
    }
  }

  function handleSaveBrief(): void {
    if (!brief) return
    doSaveBrief(brief.title, briefToAIResponse(brief))
      .then(() => setBriefSaved(true))
      .catch((err: unknown) => setBriefError(err instanceof Error ? err.message : 'The brief could not be saved.'))
  }

  function handleCopyBrief(): void {
    if (!brief) return
    const text = [
      brief.title,
      `Generated ${formatDateTime(brief.generatedAt)} · ${brief.scopeLabel} · ${brief.dataFreshnessLabel}`,
      '',
      ...brief.sections.map((s) => `${s.heading}\n${s.body}\n${s.bullets.map((b) => `- ${b}`).join('\n')}`),
      '',
      `Limitations: ${brief.limitations.join(' ')}`,
    ].join('\n\n')
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyConfirmed(true)
        setTimeout(() => setCopyConfirmed(false), 2500)
      })
      .catch(() => setBriefError('The brief could not be copied to the clipboard.'))
  }

  function handleCreateDecisionFromSection(section: ExecutiveBriefSection): void {
    const match = cityPosition.topRisks.find((item) => section.domains.includes(item.domain))
    navigate(match ? `${ROUTES.decisions}?from=${match.id}` : ROUTES.decisions)
  }

  const wardById = useMemo(() => new Map(mapDefined(wardsQuery.data).map((w) => [w.id, w])), [wardsQuery.data])
  const readinessByWard = useMemo(
    () => new Map(mapDefined(readinessQuery.data).map((r) => [r.wardId, r.readinessScore])),
    [readinessQuery.data],
  )
  const maxComplaints = useMemo(
    () => Math.max(...cityPosition.wardPerformance.map((w) => w.openComplaints), 1),
    [cityPosition],
  )

  const projects = mapDefined(projectsQuery.data?.items)
  const topAtRiskProjects = useMemo(() => [...projects].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5), [projects])

  const wardColumns: Array<Column<(typeof cityPosition.wardPerformance)[number]>> = [
    { id: 'ward', header: t('Ward'), cell: (r) => r.label, sortValue: (r) => r.label },
    { id: 'health', header: t('Health'), cell: (r) => r.health, sortValue: (r) => r.health, align: 'right' },
    { id: 'risk', header: t('Risk'), cell: (r) => r.risk, sortValue: (r) => r.risk, align: 'right' },
    {
      id: 'complaints',
      header: t('Open'),
      cell: (r) => r.openComplaints,
      sortValue: (r) => r.openComplaints,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'breached',
      header: t('Breached'),
      cell: (r) => r.slaBreached,
      sortValue: (r) => r.slaBreached,
      align: 'right',
      hideBelow: 'lg',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
  ]

  const healthTone =
    cityPosition.healthScore >= 78
      ? 'positive'
      : cityPosition.healthScore >= 60
        ? 'default'
        : cityPosition.healthScore >= 45
          ? 'warn'
          : 'critical'

  return (
    <PageBody>
      {/* ── Status strip ───────────────────────────────────────────────
          The identity band now sits above the top bar, rendered once by the
          shell. What stays on the page is the part that is this page's data
          rather than the corporation's letterhead: the six figures a
          commissioner reads first. */}
      <div className="flex flex-wrap items-stretch divide-x divide-ink-100 overflow-hidden rounded-[2px] border border-ink-200 bg-surface-sunken shadow-xs">
        <GovStripCell
          label={t('City health index')}
          value={`${cityPosition.healthScore}/100`}
          tone={healthTone === 'positive' ? 'positive' : healthTone === 'default' ? 'default' : healthTone}
        />
        <GovStripCell
          label={t('Critical alerts')}
          value={cityPosition.criticalAlerts}
          tone={cityPosition.criticalAlerts > 0 ? 'critical' : 'default'}
        />
        <GovStripCell
          label={t('Active incidents')}
          value={cityPosition.activeIncidents}
          tone={cityPosition.activeIncidents > 0 ? 'critical' : 'default'}
        />
        <GovStripCell
          label={t('Priority decisions')}
          value={cityPosition.priorityDecisions}
          tone={cityPosition.priorityDecisions > 0 ? 'warn' : 'default'}
        />
        <GovStripCell
          label={t('Services at risk')}
          value={cityPosition.servicesAtRisk}
          tone={cityPosition.servicesAtRisk > 0 ? 'warn' : 'default'}
        />
        <GovStripCell label={t('Citizens affected')} value={cityPosition.citizensAffected.toLocaleString('en-IN')} />
      </div>

      {/* ── Three columns ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — the city's condition ------------------------- */}
        <div className="flex flex-col gap-3 xl:col-span-5">
          <GovPanel title={t('City health index')} subtitle={t('Weighted composite')} tone="primary" dense>
            <div className="flex items-stretch border-b border-ink-100">
              <div className="w-[8.5rem] shrink-0 border-r border-ink-100 px-3 py-3 text-center">
                <p
                  className={`numeric text-[2.75rem] leading-none font-bold tabular-nums ${
                    healthTone === 'critical'
                      ? 'text-crit-600'
                      : healthTone === 'warn'
                        ? 'text-warn-700'
                        : healthTone === 'positive'
                          ? 'text-google-green-700'
                          : 'text-govt-900'
                  }`}
                >
                  {cityPosition.healthScore}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-400">{t('of 100')}</p>
                <div className="mt-2 flex justify-center">
                  <StateBadge state={cityPosition.state} />
                </div>
              </div>
              {/* The weighting is published, not summarised. A composite whose
                  arithmetic is hidden is an opinion; one whose components,
                  weights and contributions are on the page is a measurement an
                  officer can challenge. */}
              <div className="scrollbar-slim min-w-0 flex-1 overflow-x-auto">
                <table className="w-full text-[0.6875rem]">
                  <thead>
                    <tr className="border-b border-ink-100 bg-surface-sunken text-left">
                      <th className="px-2.5 py-1 font-bold tracking-wide text-ink-500 uppercase">{t('Component')}</th>
                      <th className="px-2 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Wt')}</th>
                      <th className="px-2 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Score')}</th>
                      <th className="px-2.5 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Contrib.')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityPosition.healthComponents.map((c) => (
                      <tr key={c.id} className="border-b border-ink-100 last:border-b-0 even:bg-ink-50/40">
                        <td className="truncate px-2.5 py-[0.3125rem] text-ink-700">{c.label}</td>
                        <td className="numeric px-2 py-[0.3125rem] text-right text-ink-500 tabular-nums">
                          {(c.weight * 100).toFixed(0)}%
                        </td>
                        <td className="numeric px-2 py-[0.3125rem] text-right text-ink-700 tabular-nums">
                          {c.score.toFixed(0)}
                        </td>
                        <td className="numeric px-2.5 py-[0.3125rem] text-right font-semibold text-ink-900 tabular-nums">
                          {c.contribution.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-3 py-2">
              <p className="mb-1 text-[0.5625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
                {t('Thirty-day trend against the 75/100 target')}
              </p>
              {/* Sized by the container — `TrendChart` fills its parent
                  through a responsive container and takes no height prop. */}
              <div className="h-[130px]">
                <TrendChart
                  points={cityPosition.operationalTrend}
                  unit="/100"
                  seriesLabel={t('City health')}
                  comparisonLabel={t('Target')}
                  referenceValue={75}
                  referenceLabel={t('Target')}
                />
              </div>
            </div>
          </GovPanel>

          <GovPanel
            title={t('Ward performance register')}
            subtitle={t('{0} wards', cityPosition.wardPerformance.length)}
            dense
          >
            <DataTable
              rows={cityPosition.wardPerformance}
              columns={wardColumns}
              rowKey={(r) => r.wardId}
              searchable
              searchPlaceholder={t('Search wards')}
              dense
              maxHeight="360px"
              stickyHeader
              initialSort={{ columnId: 'risk', direction: 'desc' }}
              onRowClick={(r) => openDrawer({ kind: 'ward', id: r.wardId })}
              ariaLabel={t('Ward performance')}
            />
          </GovPanel>

          <GovPanel title={t('Ward risk map')} subtitle={t('Select a ward to open its profile')} dense>
            <CityMap
              layers={[
                {
                  id: 'risk',
                  label: t('Ward Risk'),
                  valueFor: (id) => wardById.get(id)?.riskScore,
                  higherIsWorse: true,
                  unit: '/100',
                  description: t('Composite ward risk index.'),
                },
                {
                  id: 'health',
                  label: t('Operational Health'),
                  valueFor: (id) => wardById.get(id)?.healthScore,
                  higherIsWorse: false,
                  unit: '/100',
                  description: t('Composite ward operational health index.'),
                },
                {
                  id: 'complaints',
                  label: t('Complaint Load'),
                  valueFor: (id) => {
                    const row = cityPosition.wardPerformance.find((w) => w.wardId === id)
                    return row ? (row.openComplaints / maxComplaints) * 100 : undefined
                  },
                  higherIsWorse: true,
                  unit: ' (relative)',
                  description: t('Open complaints, scaled relative to the highest ward.'),
                },
                {
                  id: 'flood',
                  label: t('Flood Risk'),
                  valueFor: (id) => {
                    const r = readinessByWard.get(id)
                    return r === undefined ? undefined : 100 - r
                  },
                  higherIsWorse: true,
                  unit: '/100',
                  description: t('Inverse of monsoon readiness score.'),
                },
              ]}
              onWardSelect={(wardId) => openDrawer({ kind: 'ward', id: wardId })}
              height={380}
            />
          </GovPanel>
        </div>

        {/* Column 2 — what has just happened ------------------------ */}
        <div className="xl:col-span-4">
          {/*
           * The WHOLE column pins, not the feed alone.
           *
           * A `position: sticky` element stays in normal flow — its box keeps
           * its place and only its painting is offset. Siblings do not reflow
           * around it, so a panel below a pinned one scrolls straight up
           * underneath it. Pinning just the feed therefore fixed where it came
           * to rest and did nothing about what slid beneath it.
           *
           * Sticking the column as a single block means the two panels move
           * together and can never cross. `max-h` plus `overflow-y-auto` is the
           * safety net for short viewports: on a normal screen the block fits
           * and only the feed scrolls, and on a small one the block itself
           * becomes scrollable rather than running off the bottom with its
           * lower half unreachable.
           */}
          <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:z-10 xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
          <GovPanel
            title={t('Latest updates')}
            subtitle={t('{0} live', feed.length)}
            tone="primary"
            dense
            /* Pinning is handled by the column wrapper above — see the note
               there on why sticking this panel alone could not work. The
               `3.75rem` offset it uses clears the shell's `sticky top-0` top
               bar, which is 3.5rem tall and shares this scrollport. */
          >
            <LiveFeed
              entries={feed}
              now={DEMO_NOW}
              /* Bounded against the viewport rather than fixed, so the pinned
                 column fits on a short laptop as well as a large monitor. The
                 cap is generous — this is the column an officer glances at
                 most, and a feed showing three entries is not worth the space
                 it occupies. The column's own scrollbar is the fallback when
                 the pair genuinely cannot fit. */
              height="min(30rem, calc(100vh - 20rem))"
              onSelect={(entry) => {
                const [kind, id] = entry.id.split(':')
                if (kind === 'intel') openDrawer({ kind: 'intelligence', id: id ?? '' })
                else if (kind === 'incident') openDrawer({ kind: 'incident', id: id ?? '' })
                else if (kind === 'alert') navigate(ROUTES.alerts)
                else if (entry.route) navigate(entry.route)
              }}
            />
          </GovPanel>

          <GovPanel
            title={t('Matters requiring attention')}
            subtitle={t('{0} open', cityPosition.topRisks.length)}
            tone="critical"
            dense
          >
            {cityPosition.topRisks.length === 0 ? (
              <p className="px-3 py-6 text-center text-[0.75rem] text-ink-400">{t('No open risks.')}</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {cityPosition.topRisks.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openDrawer({ kind: 'intelligence', id: item.id })}
                      className="flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-govt-50/60"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={item.severity} />
                        <span className="text-[0.5625rem] font-semibold tracking-wide text-ink-500 uppercase">
                          {DOMAIN_LABEL[item.domain]}
                        </span>
                      </span>
                      <span className="text-[0.75rem] leading-snug font-semibold text-ink-800">{item.title}</span>
                      <span className="line-clamp-2 text-[0.6875rem] leading-snug text-ink-500">{item.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            </GovPanel>
          </div>
        </div>

        {/* Column 3 — what the administration is carrying ----------- */}
        <div className="flex flex-col gap-3 xl:col-span-3">
          <GovPanel title={t('Revenue & finance')} dense>
            <GovStat
              label={t('Revenue realisation')}
              value={formatPercent(cityPosition.revenue.efficiencyPct)}
              reading={t('{0} collected of {1} target', formatCrore(cityPosition.revenue.collectedCrore), formatCrore(cityPosition.revenue.targetCrore))}
              tone={cityPosition.revenue.efficiencyPct >= 80 ? 'positive' : cityPosition.revenue.efficiencyPct >= 60 ? 'warn' : 'critical'}
            />
            <div className="px-3 py-2">
              <ProgressBar value={cityPosition.revenue.efficiencyPct} showValue />
            </div>
            <GovRow label={t('Arrears outstanding')} value={formatCrore(cityPosition.revenue.arrearsCrore)} tone="warn" />
            <GovRow
              label={t('Budget utilisation')}
              value={formatPercent(cityPosition.budget.utilisationPct)}
              note={t('{0} of {1} revised', formatCrore(cityPosition.budget.actualCrore), formatCrore(cityPosition.budget.revisedCrore))}
            />
          </GovPanel>

          <GovPanel title={t('Capital works')} subtitle={t('{0} live', cityPosition.projects.total)} dense>
            <GovRow label={t('Sanctioned value')} value={formatCrore(cityPosition.projects.sanctionedCrore)} />
            <GovRow label={t('At risk')} value={cityPosition.projects.atRisk} tone={cityPosition.projects.atRisk > 0 ? 'warn' : 'default'} />
            <GovRow label={t('Delayed')} value={cityPosition.projects.delayed} tone={cityPosition.projects.delayed > 0 ? 'critical' : 'default'} />
            {projectsQuery.isLoading ? (
              <LoadingState variant="inline" />
            ) : projectsQuery.error ? (
              <ErrorState detail={projectsQuery.error.message} onRetry={() => projectsQuery.refetch()} />
            ) : (
              <>
                <p className="border-b border-ink-100 bg-surface-sunken px-3 py-1 text-[0.5625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
                  {t('Highest-risk works')}
                </p>
                {topAtRiskProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openDrawer({ kind: 'project', id: p.id })}
                    className="flex w-full items-center justify-between gap-2 border-b border-ink-100 px-3 py-[0.4375rem] text-left transition-colors last:border-b-0 hover:bg-govt-50/60"
                  >
                    <span className="min-w-0 truncate text-[0.6875rem] text-ink-700">{p.name}</span>
                    <Badge tone={p.riskScore >= 70 ? 'critical' : p.riskScore >= 55 ? 'risk' : 'warn'} className="shrink-0">
                      {p.riskScore}
                    </Badge>
                  </button>
                ))}
                {topAtRiskProjects.length === 0 ? (
                  <p className="px-3 py-3 text-[0.6875rem] text-ink-400">{t('No projects above the risk threshold.')}</p>
                ) : null}
              </>
            )}
          </GovPanel>

          <GovPanel title={t('Service delivery')} subtitle={t('SLA, lowest first')} dense>
            {serviceHealthQuery.isLoading ? (
              <LoadingState variant="inline" />
            ) : serviceHealthQuery.error ? (
              <ErrorState detail={serviceHealthQuery.error.message} onRetry={() => serviceHealthQuery.refetch()} />
            ) : mapDefined(serviceHealthQuery.data).length === 0 ? (
              <EmptyState compact title={t('No service data')} />
            ) : (
              mapDefined(serviceHealthQuery.data)
                .slice(0, 8)
                .map((row) => (
                  <GovRow
                    key={row.category}
                    label={COMPLAINT_CATEGORY_LABEL[row.category]}
                    note={t('{0} open', row.open)}
                    value={formatPercent(row.avgSla)}
                    tone={row.avgSla >= 85 ? 'positive' : row.avgSla >= 70 ? 'warn' : 'critical'}
                  />
                ))
            )}
          </GovPanel>

          <GovPanel title={t('Infrastructure standing')} dense>
            <GovRow
              label={t('Water supply')}
              note={t('{0} zone(s) at risk', cityPosition.water.zonesAtRisk)}
              value={t('{0}/{1} MLD', cityPosition.water.supplyMld.toFixed(0), cityPosition.water.demandMld.toFixed(0))}
              tone={cityPosition.water.zonesAtRisk > 0 ? 'warn' : 'default'}
            />
            <GovRow
              label={t('Monsoon readiness')}
              note={t('{0} chronic waterlogging location(s)', cityPosition.monsoon.chronicLocations)}
              value={`${cityPosition.monsoon.readinessScore}/100`}
              tone={cityPosition.monsoon.readinessScore >= 75 ? 'positive' : cityPosition.monsoon.readinessScore >= 55 ? 'warn' : 'critical'}
            />
            <GovRow
              label={t('Emergency response')}
              note={t('{0} station(s) below standard', cityPosition.emergency.stationsBelowStandard)}
              value={t('{0} min', cityPosition.emergency.avgResponseMinutes.toFixed(0))}
            />
            <GovRow
              label={t('Waste collection coverage')}
              note={t('{0} hotspot(s)', cityPosition.waste.hotspots)}
              value={formatPercent(cityPosition.waste.coveragePct)}
              tone={cityPosition.waste.coveragePct >= 90 ? 'positive' : 'warn'}
            />
            <p className="border-b border-ink-100 bg-surface-sunken px-3 py-1 text-[0.5625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
              {t('Priority road defects')}
            </p>
            {defectsQuery.isLoading ? (
              <LoadingState variant="inline" />
            ) : mapDefined(defectsQuery.data).length === 0 ? (
              <p className="px-3 py-3 text-[0.6875rem] text-ink-400">{t('No high-priority defects recorded.')}</p>
            ) : (
              mapDefined(defectsQuery.data).map((d) => (
                <GovRow
                  key={d.id}
                  label={`${wardName(d.wardId)} — ${d.type.replace(/-/g, ' ')}`}
                  value={`${d.priorityScore}/100`}
                  tone={d.priorityScore >= 70 ? 'critical' : 'warn'}
                />
              ))
            )}
          </GovPanel>
        </div>
      </div>

      {/* ── Executive brief ────────────────────────────────────────── */}
      <GovPanel
        title={t('Executive brief')}
        subtitle={t('Governed AI layer — advisory only')}
        tone="primary"
        dense
        actions={
          <Button
            variant="outline"
            size="xs"
            disabled={briefStatus === 'loading'}
            icon={<RefreshCw className={briefStatus === 'loading' ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />}
            onClick={() => void generateBrief()}
          >
            {briefStatus === 'ready' ? t('Regenerate') : t('Generate')}
          </Button>
        }
      >
        <div className="p-3">
          {briefStatus === 'idle' ? (
            <EmptyState
              title={t('No brief generated yet')}
              detail={t(
                "Generate an executive brief to synthesise the city's current position, with evidence and confidence stated for every finding.",
              )}
              icon={<Sparkles className="h-4 w-4" />}
            />
          ) : briefStatus === 'loading' ? (
            <LoadingState variant="block" rows={4} label={t('Generating executive brief')} />
          ) : briefStatus === 'error' ? (
            <ErrorState
              title={t('The executive brief could not be generated')}
              detail={briefError ?? undefined}
              onRetry={() => void generateBrief()}
            />
          ) : brief ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-ink-200 bg-surface-sunken p-2.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-ink-500">
                  <ConfidenceBadge confidence={brief.confidence} />
                  <Badge tone="muted">{brief.scopeLabel}</Badge>
                  <Badge tone="muted">{brief.dataFreshnessLabel}</Badge>
                  <span>
                    {t('Generated {0} · Model {1} · For {2}', formatDateTime(brief.generatedAt), brief.modelId, brief.generatedForRole)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="outline" icon={<Copy className="h-3 w-3" />} onClick={handleCopyBrief}>
                    {copyConfirmed ? t('Copied') : t('Copy')}
                  </Button>
                  <Button size="xs" variant="outline" icon={<Save className="h-3 w-3" />} disabled={briefSaved} onClick={handleSaveBrief}>
                    {briefSaved ? t('Saved') : t('Save')}
                  </Button>
                  <Button size="xs" variant="outline" icon={<Printer className="h-3 w-3" />} onClick={() => window.print()}>
                    {t('Print')}
                  </Button>
                </div>
              </div>

              {/* The brief's own sections read as columns too, on wide screens:
                  a synthesis is easier to check against the record beside it
                  than stacked below it. */}
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {brief.sections.map((section) => (
                  <div key={section.id} className="rounded-[2px] border border-ink-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={section.severity} />
                        {section.domains.map((d) => (
                          <Badge key={d} tone="muted">
                            {DOMAIN_LABEL[d]}
                          </Badge>
                        ))}
                        <Badge tone="info" icon={<FileSearch className="h-3 w-3" />}>
                          {section.evidenceIds.length}
                        </Badge>
                      </div>
                      <Button size="xs" variant="ghost" onClick={() => handleCreateDecisionFromSection(section)}>
                        {t('Create decision')}
                      </Button>
                    </div>
                    <h3 className="mt-2 text-[0.8125rem] font-semibold text-ink-900">{section.heading}</h3>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-600">{section.body}</p>
                    {section.bullets.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[0.6875rem] text-ink-600">
                        {section.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>

              {brief.limitations.length > 0 ? (
                <div className="rounded-[2px] border border-warn-200 bg-warn-50/50 p-2.5 text-[0.6875rem] text-warn-700">
                  <p className="mb-1 font-semibold">{t('Risks and limitations')}</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {brief.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {briefError ? <p className="text-[0.6875rem] text-crit-600">{briefError}</p> : null}
            </div>
          ) : null}
        </div>
      </GovPanel>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default ExecutiveOverviewPage
