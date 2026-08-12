import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Banknote,
  ClipboardCheck,
  Copy,
  Droplets,
  FileSearch,
  Printer,
  RefreshCw,
  Route,
  Save,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, MetricGrid, ProgressBar } from '@/components/ui/primitives'
import { Badge, ConfidenceBadge, SeverityBadge, StateBadge } from '@/components/ui/badges'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { MetricCard } from '@/components/cards/MetricCard'
import { IntelligenceCard } from '@/components/cards/domain-cards'
import { ChartFrame, CompositionBar, MiniBar, TrendChart } from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { monsoonService, projectService, roadsService, wardService, aiService } from '@/services'
import { buildCityPosition } from '@/domains'
import { getAIProvider, type ExecutiveBrief, type ExecutiveBriefSection } from '@/ai'
import { useDrawerStore } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useCurrentUser } from '@/stores/auth.store'
import { ROUTES } from '@/config/navigation'
import { wardName } from '@/data/reference'
import { formatCrore, formatDateTime, formatPercent } from '@/utils/format'
import type { AIResponse } from '@/types/ai'
import { DOMAIN_LABEL } from '@/types/common'
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from '@/types/operations'
import { t } from '@/i18n'

/**
 * Executive Overview - "<city> Operational Intelligence".
 *
 * The city-level position: one composite health score with its weighted
 * components published, the ward risk map, the operational trend, and the
 * emerging risks that require executive attention - closing with an
 * AI-generated executive brief that is always evidence-backed and always
 * advisory.
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

  const doSaveBrief = useServiceAction((u, title: string, response: AIResponse) => aiService.saveBrief(u, 'executive-brief', title, response), [])

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
      confidenceRationale: t('Derived from {0} evidence reference(s) across {1} section(s).', b.sections.reduce((n, s) => n + s.evidenceIds.length, 0), b.sections.length),
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
  const readinessByWard = useMemo(() => new Map(mapDefined(readinessQuery.data).map((r) => [r.wardId, r.readinessScore])), [readinessQuery.data])
  const maxComplaints = useMemo(() => Math.max(...cityPosition.wardPerformance.map((w) => w.openComplaints), 1), [cityPosition])

  const projects = mapDefined(projectsQuery.data?.items)
  const projectStatusComposition = useMemo(() => {
    const colours: Record<string, string> = {
      planned: '#8195ac',
      tendered: '#8195ac',
      awarded: '#2f6feb',
      'in-progress': '#2f6feb',
      delayed: '#e5484d',
      'on-hold': '#f59e0b',
      completed: '#10b981',
      closed: '#10b981',
    }
    const counts = new Map<string, number>()
    for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([status, value]) => ({ id: status, label: status.replace(/-/g, ' '), value, colour: colours[status] ?? '#8195ac' }))
      .filter((c) => c.value > 0)
  }, [projects])
  const topAtRiskProjects = useMemo(() => [...projects].sort((a, b) => b.riskScore - a.riskScore).slice(0, 4), [projects])

  const wardColumns: Array<Column<(typeof cityPosition.wardPerformance)[number]>> = [
    { id: 'ward', header: t('Ward'), cell: (r) => r.label, sortValue: (r) => r.label },
    { id: 'health', header: t('Health'), cell: (r) => r.health, sortValue: (r) => r.health, align: 'right' },
    { id: 'risk', header: t('Risk'), cell: (r) => r.risk, sortValue: (r) => r.risk, align: 'right' },
    { id: 'complaints', header: t('Open complaints'), cell: (r) => r.openComplaints, sortValue: (r) => r.openComplaints, align: 'right', hideBelow: 'md' },
    { id: 'breached', header: t('SLA breached'), cell: (r) => r.slaBreached, sortValue: (r) => r.slaBreached, align: 'right', hideBelow: 'lg' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} /> },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('{0} Operational Intelligence', corporation.city)}
        description={t('The city-level operational position across every domain - composite health, ward risk, emerging signals and financial and infrastructure standing - closing with an evidence-backed executive brief that a named officer can act on.')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Executive Overview') }]}
      />

      {/* Row 1 - headline metrics */}
      <MetricGrid columns={4}>
        <MetricCard
          label={t('City health score')}
          value={cityPosition.healthScore}
          unit="/100"
          size="lg"
          tone={cityPosition.healthScore >= 78 ? 'positive' : cityPosition.healthScore >= 60 ? 'default' : cityPosition.healthScore >= 45 ? 'warn' : 'critical'}
          support={t('Composite of six weighted domain indices')}
          explanation={
            <div className="space-y-1">
              <p className="font-semibold">{t('Weighted components')}</p>
              {cityPosition.healthComponents.map((c) => (
                <p key={c.id}>
                  {c.label}: {(c.weight * 100).toFixed(0)}% × {c.score.toFixed(0)} = {c.contribution.toFixed(1)}
                </p>
              ))}
            </div>
          }
        />
        <MetricCard
          label={t('Critical alerts')}
          value={cityPosition.criticalAlerts}
          size="lg"
          tone={cityPosition.criticalAlerts > 0 ? 'critical' : 'default'}
          support={t('{0} high-severity also open', cityPosition.highAlerts)}
          to={`${ROUTES.alerts}?severity=critical`}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label={t('Priority decisions')}
          value={cityPosition.priorityDecisions}
          size="lg"
          tone={cityPosition.priorityDecisions > 0 ? 'warn' : 'default'}
          support={t('Draft or under review')}
          to={ROUTES.decisions}
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
        />
        <MetricCard
          label={t('Services at risk')}
          value={cityPosition.servicesAtRisk}
          size="lg"
          tone={cityPosition.servicesAtRisk > 0 ? 'warn' : 'default'}
          support={t('Categories below SLA compliance threshold')}
          to={ROUTES.wards}
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
        />
      </MetricGrid>

      {/* Row 2 - risk map, trend, emerging risks */}
      <SplitLayout
        asideWidth="md"
        main={
          <Card flush className="h-full">
            <CardHeader bordered title={t('City risk map')} description={t('Ward-level composite indicators. Click a ward to open its profile.')} />
            <div className="p-3">
              <CityMap
                layers={[
                  { id: 'risk', label: t('Ward Risk'), valueFor: (id) => wardById.get(id)?.riskScore, higherIsWorse: true, unit: '/100', description: t('Composite ward risk index.') },
                  { id: 'health', label: t('Operational Health'), valueFor: (id) => wardById.get(id)?.healthScore, higherIsWorse: false, unit: '/100', description: t('Composite ward operational health index.') },
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
                    valueFor: (id) => { const r = readinessByWard.get(id); return r === undefined ? undefined : 100 - r },
                    higherIsWorse: true,
                    unit: '/100',
                    description: t('Inverse of monsoon readiness score.'),
                  },
                ]}
                onWardSelect={(wardId) => openDrawer({ kind: 'ward', id: wardId })}
                height={440}
              />
            </div>
          </Card>
        }
        aside={
          <>
            <Card>
              <ChartFrame title={t('City operational trend')} unit={t('Health score /100')} timeframe="Last 30 days" height={180}>
                <TrendChart points={cityPosition.operationalTrend} unit="/100" seriesLabel="City health" comparisonLabel="Target" referenceValue={75} referenceLabel="Target" />
              </ChartFrame>
            </Card>
            <Card flush>
              <CardHeader bordered title={t('Top emerging risks')} description={t('{0} highest-severity open items', cityPosition.topRisks.length)} />
              <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
                {cityPosition.topRisks.length === 0 ? (
                  <EmptyState compact title={t('No open risks')} />
                ) : (
                  cityPosition.topRisks.map((item) => (
                    <IntelligenceCard key={item.id} item={item} compact onClick={() => openDrawer({ kind: 'intelligence', id: item.id })} />
                  ))
                )}
              </div>
            </Card>
          </>
        }
      />

      {/* Row 3 - ward performance, project health, citizen services */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card flush className="xl:col-span-1">
          <CardHeader bordered title={t('Ward performance')} description={t('Ranked by composite risk. Click a row to open the ward profile.')} />
          <DataTable
            rows={cityPosition.wardPerformance}
            columns={wardColumns}
            rowKey={(r) => r.wardId}
            searchable
            searchPlaceholder="Search wards"
            dense
            maxHeight="420px"
            stickyHeader
            initialSort={{ columnId: 'risk', direction: 'desc' }}
            onRowClick={(r) => openDrawer({ kind: 'ward', id: r.wardId })}
            ariaLabel="Ward performance"
          />
        </Card>

        <Card>
          <CardHeader title={t('Project health')} description={t('Status composition and the highest-risk capital works.')} />
          {projectsQuery.isLoading ? (
            <LoadingState variant="inline" />
          ) : projectsQuery.error ? (
            <ErrorState detail={projectsQuery.error.message} onRetry={() => projectsQuery.refetch()} />
          ) : (
            <>
              {projectStatusComposition.length > 0 ? <CompositionBar segments={projectStatusComposition} className="mt-2" /> : null}
              <div className="mt-3 space-y-1.5">
                {topAtRiskProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openDrawer({ kind: 'project', id: p.id })}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-ink-50"
                  >
                    <span className="min-w-0 truncate text-ink-700">{p.name}</span>
                    <Badge tone={p.riskScore >= 70 ? 'critical' : p.riskScore >= 55 ? 'risk' : 'warn'} className="shrink-0">{t('Risk {0}', p.riskScore)}</Badge>
                  </button>
                ))}
                {topAtRiskProjects.length === 0 ? <p className="text-xs text-ink-400">{t('No projects above the risk threshold.')}</p> : null}
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title={t('Citizen services')} description={t('SLA compliance by category, lowest first.')} />
          {serviceHealthQuery.isLoading ? (
            <LoadingState variant="inline" />
          ) : serviceHealthQuery.error ? (
            <ErrorState detail={serviceHealthQuery.error.message} onRetry={() => serviceHealthQuery.refetch()} />
          ) : (
            <div className="mt-2 space-y-2">
              {mapDefined(serviceHealthQuery.data).map((row) => (
                <div key={row.category} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-ink-600">{COMPLAINT_CATEGORY_LABEL[row.category]}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <MiniBar value={row.avgSla} width={44} />
                    <span className="numeric font-semibold text-ink-800">{formatPercent(row.avgSla)}</span>
                  </span>
                </div>
              ))}
              {mapDefined(serviceHealthQuery.data).length === 0 ? <EmptyState compact title={t('No service data')} /> : null}
            </div>
          )}
        </Card>
      </div>

      {/* Row 4 - financial position, infrastructure risk */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Banknote className="h-4 w-4" />} title={t('Financial position')} description={t('Revenue realisation and capital utilisation against the phased plan.')} />
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-ink-500">{t('Revenue collected vs target')}</span>
                <span className="numeric font-semibold text-ink-800">{formatCrore(cityPosition.revenue.collectedCrore)} of {formatCrore(cityPosition.revenue.targetCrore)}</span>
              </div>
              <ProgressBar value={cityPosition.revenue.efficiencyPct} showValue />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-ink-500">{t('Budget utilisation')}</span>
                <span className="numeric font-semibold text-ink-800">{formatCrore(cityPosition.budget.actualCrore)} of {formatCrore(cityPosition.budget.revisedCrore)}</span>
              </div>
              <ProgressBar value={cityPosition.budget.utilisationPct} showValue />
            </div>
            <p className="text-xs text-ink-500">{t('Arrears outstanding:')}{' '}<span className="font-semibold text-ink-800">{formatCrore(cityPosition.revenue.arrearsCrore)}</span></p>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Droplets className="h-4 w-4" />} title={t('Infrastructure risk')} description={t('Water, drainage and roads - the physical service condition of the city.')} />
          <div className="mt-3 space-y-3 text-xs">
            <div>
              <p className="label-institutional mb-1">{t('Water')}</p>
              <p className="text-ink-600">{t('Supply')}{' '}{cityPosition.water.supplyMld.toFixed(0)}{' '}{t('MLD against')}{' '}{cityPosition.water.demandMld.toFixed(0)}{' '}{t('MLD demand ·')}{' '}<span className="font-semibold text-ink-800">{t('{0} zone(s) at risk', cityPosition.water.zonesAtRisk)}</span></p>
            </div>
            <div>
              <p className="label-institutional mb-1">{t('Drainage &amp; monsoon')}</p>
              <p className="text-ink-600">{t('Mean readiness {0}/100 · {1} chronic waterlogging location(s)', cityPosition.monsoon.readinessScore, cityPosition.monsoon.chronicLocations)}</p>
            </div>
            <div>
              <p className="label-institutional mb-1 flex items-center gap-1"><Route className="h-3 w-3" />{t('Roads - top priority defects')}</p>
              {defectsQuery.isLoading ? (
                <LoadingState variant="inline" />
              ) : mapDefined(defectsQuery.data).length === 0 ? (
                <p className="text-ink-400">{t('No high-priority defects recorded.')}</p>
              ) : (
                <div className="space-y-1">
                  {mapDefined(defectsQuery.data).map((d) => (
                    <p key={d.id} className="flex items-center justify-between text-ink-600">
                      <span>{wardName(d.wardId)} - {d.type.replace('-', ' ')}</span>
                      <span className="numeric font-semibold text-ink-800">{d.priorityScore}/100</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Executive brief */}
      <Card flush>
        <CardHeader
          bordered
          icon={<Sparkles className="h-4 w-4" />}
          eyebrow={t('Governed AI layer - advisory only')}
          title={t('Executive brief')}
          description={t('Evidence-backed synthesis across every domain. The platform never decides - every section names the officer accountable for acting on it.')}
          actions={
            <Button variant="primary" size="sm" disabled={briefStatus === 'loading'} icon={<RefreshCw className={briefStatus === 'loading' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => void generateBrief()}>
              {briefStatus === 'ready' ? 'Regenerate brief' : 'Generate Executive Brief'}
            </Button>
          }
        />
        <div className="p-4">
          {briefStatus === 'idle' ? (
            <EmptyState title={t('No brief generated yet')} detail="Generate an executive brief to synthesise the city's current position, with evidence and confidence stated for every finding." icon={<Sparkles className="h-4 w-4" />} />
          ) : briefStatus === 'loading' ? (
            <LoadingState variant="block" rows={4} label={t('Generating executive brief')} />
          ) : briefStatus === 'error' ? (
            <ErrorState title={t('The executive brief could not be generated')} detail={briefError ?? undefined} onRetry={() => void generateBrief()} />
          ) : brief ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink-100 bg-surface-sunken p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  <ConfidenceBadge confidence={brief.confidence} />
                  <Badge tone="muted">{brief.scopeLabel}</Badge>
                  <Badge tone="muted">{brief.dataFreshnessLabel}</Badge>
                  <span>{t('Generated {0} · Model {1} · For {2}', formatDateTime(brief.generatedAt), brief.modelId, brief.generatedForRole)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="outline" icon={<Copy className="h-3 w-3" />} onClick={handleCopyBrief}>
                    {copyConfirmed ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="xs" variant="outline" icon={<Save className="h-3 w-3" />} disabled={briefSaved} onClick={handleSaveBrief}>
                    {briefSaved ? 'Saved' : 'Save'}
                  </Button>
                  <Button size="xs" variant="outline" icon={<Printer className="h-3 w-3" />} onClick={() => window.print()}>
                    {t('Print')}
                  </Button>
                </div>
              </div>

              {brief.sections.map((section) => (
                <div key={section.id} className="rounded-lg border border-ink-100 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={section.severity} />
                      {section.domains.map((d) => (
                        <Badge key={d} tone="muted">{DOMAIN_LABEL[d]}</Badge>
                      ))}
                      <Badge tone="info" icon={<FileSearch className="h-3 w-3" />}>{section.evidenceIds.length} evidence</Badge>
                    </div>
                    <Button size="xs" variant="ghost" onClick={() => handleCreateDecisionFromSection(section)}>
                      {t('Create decision from this section')}
                    </Button>
                  </div>
                  <h3 className="mt-2 text-[0.8125rem] font-semibold text-ink-900">{section.heading}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{section.body}</p>
                  {section.bullets.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-600">
                      {section.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}

              {brief.limitations.length > 0 ? (
                <div className="rounded-md border border-warn-200 bg-warn-50/50 p-3 text-xs text-warn-700">
                  <p className="mb-1 font-semibold">{t('Risks and limitations')}</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {brief.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {briefError ? <p className="text-xs text-crit-600">{briefError}</p> : null}
            </div>
          ) : null}
        </div>
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default ExecutiveOverviewPage
