import { useEffect, useMemo, useState } from 'react'
import { revenueRealisation } from '@/data/finance.data'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertOctagon,
  ClipboardList,
  CloudRain,
  Copy,
  Droplets,
  FileSearch,
  FlaskConical,
  HeartPulse,
  Printer,
  RefreshCw,
  Save,
  ShieldAlert,
  Siren,
  Sparkles,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, ProgressBar, ScoreDial } from '@/components/ui/primitives'
import { Badge, ConfidenceBadge, SeverityBadge, StateBadge } from '@/components/ui/badges'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { CHART_COLOURS, DonutChart, RadarChart, RankedBarChart, TrendChart } from '@/components/charts'
import { DivisionGeoMap } from '@/components/geo/DivisionGeoMap'
import { GovPanel, GovRow, GovStat } from '@/components/gov/GovPanel'
import { EvidenceValue } from '@/components/decision'
import { BigFigure, DetailsFold, KpiTile, ServiceTile, StateDonut } from '@/components/infographic'
import { LiveFeed, buildFeed } from '@/components/gov/LiveFeed'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { monsoonService, notifiedServicesService, projectService, wardService, aiService } from '@/services'
import { buildCityPosition } from '@/domains'
import { getAIProvider, type ExecutiveBrief, type ExecutiveBriefSection } from '@/ai'
import { useDrawerStore } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import { DEMO_NOW, FY_ELAPSED_PCT } from '@/utils/deterministic'
import { formatCrore, formatDateTime, formatNumber, formatPercent } from '@/utils/format'
import type { AIResponse } from '@/types/ai'
import { DOMAIN_LABEL, type Severity } from '@/types/common'
import { SHADE, type Shade } from '@/components/ui/shade'
import { cn } from '@/utils/cn'
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from '@/types/operations'
import { t } from '@/i18n'

/**
 * Executive Overview — the corporation's own record of its position, and the
 * screen every principal who may read it lands on after sign-in.
 *
 * The layout is the one the NMMC and Thane (TMC) platforms in this programme use, so
 * the two read as one family: a six-figure status strip, then the city health
 * index beside revenue & finance and service delivery, then the ward picture,
 * capital works, the map and the live column below.
 *
 * Presented as an administrative return rather than as a dashboard. The
 * distinction drives every layout decision here:
 *
 *  - **Columns, read downward.** A tile mosaic asks the reader to scan for the
 *    number they want. A departmental return puts figures in a column so they
 *    can be read in order and compared against the one above. The two
 *    columns at the head are the city's condition and what the administration
 *    is carrying — which is how a commissioner's morning briefing is actually
 *    structured.
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

/** Severity → card shade, for the risk and brief-section cards (`@/components/ui/shade`). */
const SEVERITY_SHADE: Record<Severity, Shade> = {
  critical: 'red',
  high: 'orange',
  medium: 'amber',
  low: 'blue',
  info: 'teal',
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
    t('Executive Overview'),
    t('City-level operational position across every domain - health index, revenue & finance and service delivery.'),
  )

  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))
  const readinessQuery = useServiceQuery(queryKeys.monsoon('exec-readiness'), (u) => monsoonService.readiness(u))
  const projectsQuery = useServiceQuery(queryKeys.projects('exec-overview'), (u) => projectService.list(u, { pageSize: 300 }))
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
  // Distinct from `serviceHealthQuery` above: that is COMPLAINT-resolution SLA
  // - how fast a grievance already lodged is closed. This is the notified-
  // service register - certificates, licences and permits a citizen applies
  // FOR, against their own published statutory timeline. Weighted by volume
  // so a high-traffic service lagging moves the headline more than a rarely
  // used one doing the same.
  const notifiedServicesQuery = useServiceQuery(queryKeys.notifiedServices('exec-overview'), (u) =>
    notifiedServicesService.list(u),
  )

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
      setBriefError(err instanceof Error ? err.message : t('The executive brief could not be generated.'))
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
      .catch((err: unknown) => setBriefError(err instanceof Error ? err.message : t('The brief could not be saved.')))
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
      .catch(() => setBriefError(t('The brief could not be copied to the clipboard.')))
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

  const notifiedServices = mapDefined(notifiedServicesQuery.data)
  const notifiedApplications30d = notifiedServices.reduce((s, x) => s + x.applications30d, 0)
  const notifiedWithinPeriodPct = notifiedApplications30d > 0
    ? Math.round(
        (notifiedServices.reduce((s, x) => s + x.issuedWithinStatutoryPeriodPct * x.applications30d, 0) / notifiedApplications30d) * 10,
      ) / 10
    : 0

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

  // "Need attention" is every ward not reading operational, so the count agrees
  // with the state donut beside it (a degraded ward is not a ward to ignore).
  const atRiskWards = cityPosition.wardPerformance.filter((w) => w.state === 'degraded' || w.state === 'at-risk' || w.state === 'critical').length
  // The ten riskiest wards; the full register is in the table below.
  const riskiestWards = useMemo(
    () =>
      [...cityPosition.wardPerformance]
        .sort((x, y) => y.risk - x.risk)
        .slice(0, 10)
        // The register label reads "<code> · <ward name>"; the bar axis needs only the name.
        .map((w) => ({ label: w.label.split('·').pop()?.trim() ?? w.label, value: w.risk })),
    [cityPosition],
  )
  const onTrackProjects = Math.max(0, cityPosition.projects.total - cityPosition.projects.atRisk - cityPosition.projects.delayed)
  const projectStatus = [
    { id: 'on-track', label: t('On track'), value: onTrackProjects, colour: CHART_COLOURS.positive },
    { id: 'at-risk', label: t('At risk'), value: cityPosition.projects.atRisk, colour: CHART_COLOURS.warn },
    { id: 'delayed', label: t('Delayed'), value: cityPosition.projects.delayed, colour: CHART_COLOURS.critical },
  ]

  const healthTone =
    cityPosition.healthScore >= 78
      ? 'positive'
      : cityPosition.healthScore >= 60
        ? 'default'
        : cityPosition.healthScore >= 45
          ? 'warn'
          : 'critical'

  // Published figures, stated beside the modelled ones for scale only. The
  // property-tax evidence is Brihanmumbai's own; the budget and service figures
  // are read from the corporation record and shown only where it carries them.
  const isBmc = corporation.id === 'bmc'
  // One definition of revenue realisation for every screen (finance.data.ts),
  // so the Executive, the Cockpit and the Revenue pages read the same figure.
  const realisation = revenueRealisation()
  const revenueRealisationPct = realisation.pct

  return (
    <PageBody>
      <PageHeader breadcrumbs={[{ label: t('Command Centre') }, { label: t('Executive Overview') }]} />

      {/* ── Status strip ───────────────────────────────────────────────
          The identity band sits above the top bar, rendered once by the
          shell. What stays on the page is the part that is this page's data
          rather than the corporation's letterhead: the six figures a
          commissioner reads first. */}
      {/* One card per figure, each tinted by what it means (see
          `@/components/ui/shade`): health by its score, alerts red,
          incidents amber, decisions blue, services at risk green when none
          and red when any, citizens affected teal. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label={t('City health index')}
          value={`${cityPosition.healthScore}/100`}
          icon={<HeartPulse className="h-5 w-5" />}
          shade={cityPosition.healthScore >= 78 ? 'green' : cityPosition.healthScore >= 45 ? 'amber' : 'red'}
        />
        <KpiTile
          label={t('Critical alerts')}
          value={cityPosition.criticalAlerts}
          icon={<AlertOctagon className="h-5 w-5" />}
          shade="red"
        />
        <KpiTile
          label={t('Active incidents')}
          value={cityPosition.activeIncidents}
          icon={<Siren className="h-5 w-5" />}
          shade="amber"
        />
        <KpiTile
          label={t('Priority decisions')}
          value={cityPosition.priorityDecisions}
          icon={<ClipboardList className="h-5 w-5" />}
          shade="blue"
        />
        <KpiTile
          label={t('Services at risk')}
          value={cityPosition.servicesAtRisk}
          icon={<ShieldAlert className="h-5 w-5" />}
          shade={cityPosition.servicesAtRisk > 0 ? 'red' : 'green'}
        />
        <KpiTile
          label={t('Citizens affected')}
          value={cityPosition.citizensAffected.toLocaleString('en-IN')}
          icon={<Users className="h-5 w-5" />}
          shade="teal"
        />
      </div>

      {/* The honesty line. Every figure on this screen is modelled; only the
          lines marked "For context" are published. */}
      <p className="flex items-center gap-2 rounded-[2px] border border-intel-200 bg-intel-50 px-3 py-1.5 text-[0.6875rem] text-intel-800">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-bold">{t('Modelled demonstration data')}</span>{' '}
          {t('- not {0} records. Lines marked "For context" are published figures.', corporation.shortName)}
        </span>
      </p>

      {/* ── Two columns ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — the city's condition ------------------------- */}
        <div className="flex flex-col gap-3 xl:col-span-6">
          <GovPanel title={t('City health index')} subtitle={t('Weighted composite')} tone="amber" dense>
            {/* The composite, stated twice on purpose: the dial is the reading
                an officer takes in at a glance, the polygon is its SHAPE. A
                75 carried by one strong component and a 75 that is even across
                six are the same number and a different city, and only the
                second drawing separates them. */}
            <div className="flex flex-col items-center gap-3 border-b border-ink-100 px-3 py-3 sm:flex-row sm:items-stretch">
              <div className="flex shrink-0 flex-col items-center justify-center gap-2 sm:w-[9rem] sm:border-r sm:border-ink-100 sm:pr-3">
                <ScoreDial score={cityPosition.healthScore} size={124} label={t('of 100')} caption={t('Composite score')} />
                <StateBadge state={cityPosition.state} size="sm" />
              </div>
              <div className="h-[190px] min-w-0 flex-1">
                <RadarChart
                  data={cityPosition.healthComponents.map((c) => ({ label: c.label, value: c.score }))}
                  unit="/100"
                  colour={
                    healthTone === 'critical'
                      ? CHART_COLOURS.critical
                      : healthTone === 'warn'
                        ? CHART_COLOURS.warn
                        : healthTone === 'positive'
                          ? CHART_COLOURS.positive
                          : CHART_COLOURS.primary
                  }
                />
              </div>
            </div>

            {/* The weighting is published, not summarised. A composite whose
                arithmetic is hidden is an opinion; one whose components,
                weights and contributions are on the page is a measurement an
                officer can challenge. */}
            <div className="scrollbar-slim min-w-0 flex-1 overflow-x-auto border-b border-ink-100">
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
                      <td className="numeric px-2 py-[0.3125rem] text-right text-ink-500 tabular-nums">{(c.weight * 100).toFixed(0)}%</td>
                      <td className="numeric px-2 py-[0.3125rem] text-right text-ink-700 tabular-nums">{c.score.toFixed(0)}</td>
                      <td className="numeric px-2.5 py-[0.3125rem] text-right font-semibold text-ink-900 tabular-nums">{c.contribution.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2">
              <p className="mb-1 text-[0.5625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
                {t('Thirty-day trend against the 75/100 target')}
              </p>
              {/* Sized by the container - `TrendChart` fills its parent
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
        </div>

        {/* Column 2 — what the administration is carrying ----------- */}
        <div className="flex flex-col gap-3 xl:col-span-6">
          <GovPanel title={t('Revenue & finance')} subtitle={t('This financial year')} tone="amber" dense>
            {/* Realisation is collected over the year's target - the figure the
                reading beside it states. Just past the half-year a share a
                little over half is expected, so the tone reads it against the
                elapsed share of the year (about 53% at the demo date). */}
            <GovStat
              label={t('Revenue realisation')}
              value={formatPercent(revenueRealisationPct)}
              reading={t('{0} collected of {1} target', formatCrore(realisation.collectedCrore), formatCrore(realisation.targetCrore))}
              tone={revenueRealisationPct >= FY_ELAPSED_PCT ? 'positive' : revenueRealisationPct >= FY_ELAPSED_PCT * 0.77 ? 'warn' : 'critical'}
            />
            <div className="px-3 py-2">
              <ProgressBar value={revenueRealisationPct} showValue />
            </div>
            <GovRow label={t('Arrears outstanding')} value={formatCrore(cityPosition.revenue.arrearsCrore)} tone="warn" />
            <GovRow
              label={t('Budget utilisation')}
              value={formatPercent(cityPosition.budget.utilisationPct)}
              note={t('{0} of {1} revised', formatCrore(cityPosition.budget.actualCrore), formatCrore(cityPosition.budget.revisedCrore))}
            />
            {corporation.budgetCrore !== null ? (
              <p className="border-t border-ink-100 bg-surface-sunken px-3 py-1.5 text-[0.625rem] leading-snug text-ink-500">
                {t(
                  'For context: the General Body approved a budget of {0} for FY {1} (published).',
                  formatCrore(corporation.budgetCrore),
                  corporation.budgetFinancialYear ?? '',
                )}
              </p>
            ) : null}
            {isBmc ? (
              <p className="bg-surface-sunken px-3 pb-1.5 text-[0.625rem] leading-snug text-ink-500">
                {t('For context (published): property tax collected')}{' '}
                <EvidenceValue evidenceId="ev-ptax-fy26-navbharat" className="font-semibold text-ink-700" />{' '}
                {t('in FY 2025-26; the FY 2026-27 budget estimates')}{' '}
                <EvidenceValue evidenceId="ev-ptax-be-2026-27" className="font-semibold text-ink-700" />
                {t('. The property-tax line above is modelled.')}
              </p>
            ) : null}
          </GovPanel>

          <GovPanel title={t('Service delivery')} subtitle={t('Complaints vs. notified services')} tone="amber" dense>
            {notifiedServicesQuery.isLoading ? (
              <LoadingState variant="inline" />
            ) : notifiedServicesQuery.error ? (
              <ErrorState detail={notifiedServicesQuery.error.message} onRetry={() => notifiedServicesQuery.refetch()} />
            ) : (
              <GovRow
                label={t('Notified services within statutory period')}
                note={t('{0} services · proactive applications, not grievances', notifiedServices.length)}
                value={formatPercent(notifiedWithinPeriodPct)}
                tone={notifiedWithinPeriodPct >= 85 ? 'positive' : notifiedWithinPeriodPct >= 70 ? 'warn' : 'critical'}
              />
            )}
            <p className="border-b border-ink-100 bg-surface-sunken px-3 py-1 text-[0.5625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">
              {t('Complaint resolution SLA, by category')}
            </p>
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
        </div>
      </div>

      {/* ── Ward position: state share · riskiest wards ────────────────
          Below the return, the same city broken down by its ward offices. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <GovPanel title={t('Wards by operating state')} subtitle={t('Share of all ward offices')} tone="green" dense>
          <div className="p-3">
            <StateDonut states={cityPosition.wardPerformance.map((w) => w.state)} unitLabel={t('wards')} />
          </div>
        </GovPanel>

        <GovPanel
          title={t('Wards by risk')}
          subtitle={t('{0} of {1} need attention - degraded or worse', atRiskWards, cityPosition.wardPerformance.length)}
          tone="red"
          dense
        >
          <div className="h-[230px] p-2">
            <RankedBarChart data={riskiestWards} unit="/100" />
          </div>
          <DetailsFold summary={t('Show the full ward register')}>
            <DataTable
              rows={cityPosition.wardPerformance}
              columns={wardColumns}
              rowKey={(r) => r.wardId}
              searchable
              searchPlaceholder={t('Search wards')}
              dense
              maxHeight="320px"
              stickyHeader
              initialSort={{ columnId: 'risk', direction: 'desc' }}
              onRowClick={(r) => openDrawer({ kind: 'ward', id: r.wardId })}
              ariaLabel={t('Ward performance')}
            />
          </DetailsFold>
        </GovPanel>
      </div>

      {/* ── Infrastructure standing: one tile per service ─────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ServiceTile
          icon={<Droplets className="h-4 w-4" />}
          label={t('Water supply')}
          value={t('{0}/{1} MLD', cityPosition.water.supplyMld.toFixed(0), cityPosition.water.demandMld.toFixed(0))}
          meter={(cityPosition.water.supplyMld / Math.max(1, cityPosition.water.demandMld)) * 100}
          note={t('{0} zone(s) at risk', cityPosition.water.zonesAtRisk)}
          tone={cityPosition.water.zonesAtRisk > 0 ? 'warn' : 'positive'}
          shade="blue"
        />
        <ServiceTile
          icon={<CloudRain className="h-4 w-4" />}
          label={t('Monsoon readiness (season review)')}
          value={`${cityPosition.monsoon.readinessScore}/100`}
          meter={cityPosition.monsoon.readinessScore}
          note={t('{0} chronic waterlogging location(s) - carried into the pre-monsoon plan for next year', cityPosition.monsoon.chronicLocations)}
          tone={cityPosition.monsoon.readinessScore >= 75 ? 'positive' : cityPosition.monsoon.readinessScore >= 55 ? 'warn' : 'critical'}
          shade="amber"
        />
        <ServiceTile
          icon={<Timer className="h-4 w-4" />}
          label={t('Emergency response')}
          value={t('{0} min', cityPosition.emergency.avgResponseMinutes.toFixed(0))}
          note={t('{0} station(s) below standard', cityPosition.emergency.stationsBelowStandard)}
          tone={cityPosition.emergency.stationsBelowStandard > 0 ? 'warn' : 'positive'}
          shade="red"
        />
        <ServiceTile
          icon={<Trash2 className="h-4 w-4" />}
          label={t('Waste collection coverage')}
          value={formatPercent(cityPosition.waste.coveragePct)}
          meter={cityPosition.waste.coveragePct}
          note={t('{0} hotspot(s)', cityPosition.waste.hotspots)}
          tone={cityPosition.waste.coveragePct >= 90 ? 'positive' : 'warn'}
          shade="green"
        />
      </div>

      {corporation.waterSupplyMLD !== null ? (
        <p className="-mt-1 text-[0.625rem] leading-snug text-ink-500">
          {t(
            'For context (published): about {0} MLD of water is supplied daily; sewage treatment capacity is about {1} MLD; about {2} TPD of solid waste is collected.',
            corporation.waterSupplyMLD ?? '-',
            corporation.sewageTreatmentMLD ?? '-',
            corporation.solidWasteTPD ?? '-',
          )}
        </p>
      ) : null}

      {/* ── Capital works · where: the ward risk map ─────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GovPanel title={t('Capital works')} subtitle={t('{0} live', cityPosition.projects.total)} tone="green" dense>
          <div className="flex items-center gap-3 p-3">
            <div className="h-[130px] w-[130px] shrink-0">
              <DonutChart
                data={projectStatus.map((row) => ({ label: row.label, value: row.value, colour: row.colour }))}
                centreValue={formatNumber(cityPosition.projects.total)}
                centreLabel={t('works')}
              />
            </div>
            <ul className="flex-1 space-y-1.5 text-[0.75rem]">
              {projectStatus.map((row) => (
                <li key={row.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.colour }} aria-hidden />
                  <span className="flex-1 text-ink-700">{row.label}</span>
                  <span className="numeric font-bold text-ink-900 tabular-nums">{row.value}</span>
                </li>
              ))}
              <li className="border-t border-ink-100 pt-1.5">
                <BigFigure value={formatCrore(cityPosition.projects.sanctionedCrore)} caption={t('sanctioned value')} />
              </li>
            </ul>
          </div>
          <DetailsFold summary={t('Show the highest-risk works')}>
            {projectsQuery.isLoading ? (
              <LoadingState variant="inline" />
            ) : projectsQuery.error ? (
              <ErrorState detail={projectsQuery.error.message} onRetry={() => projectsQuery.refetch()} />
            ) : topAtRiskProjects.length === 0 ? (
              <p className="px-3 py-3 text-[0.6875rem] text-ink-400">{t('No projects above the risk threshold.')}</p>
            ) : (
              topAtRiskProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDrawer({ kind: 'project', id: p.id })}
                  className="flex w-full items-center justify-between gap-2 border-t border-ink-100 px-3 py-1.5 text-left hover:bg-govt-50/60"
                >
                  <span className="min-w-0 truncate text-[0.6875rem] text-ink-700">{p.name}</span>
                  <Badge tone={p.riskScore >= 70 ? 'critical' : p.riskScore >= 55 ? 'risk' : 'warn'} className="shrink-0">
                    {p.riskScore}
                  </Badge>
                </button>
              ))
            )}
          </DetailsFold>
        </GovPanel>

        <div className="lg:col-span-2">
          <GovPanel title={t('Ward risk map')} subtitle={t('Select a ward to open its profile')} tone="red" dense>
            <DivisionGeoMap
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
      </div>

      {/* ── What needs attention · what just happened ──────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <GovPanel title={t('Matters requiring attention')} subtitle={t('{0} open', cityPosition.topRisks.length)} tone="critical" dense>
          {cityPosition.topRisks.length === 0 ? (
            <p className="px-3 py-6 text-center text-[0.75rem] text-ink-400">{t('No open risks.')}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
              {cityPosition.topRisks.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openDrawer({ kind: 'intelligence', id: item.id })}
                    className={cn(
                      'flex h-full w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-shadow hover:shadow-sm',
                      SHADE[SEVERITY_SHADE[item.severity]].tile,
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <SeverityBadge severity={item.severity} />
                      <span className="truncate text-[0.625rem] font-semibold tracking-wide text-ink-500 uppercase">
                        {DOMAIN_LABEL[item.domain]}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-[0.75rem] leading-snug font-semibold text-ink-800">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GovPanel>

        <GovPanel title={t('Latest updates')} subtitle={t('{0} live', feed.length)} tone="green" dense>
          <LiveFeed
            entries={feed}
            now={DEMO_NOW}
            height="min(22rem, calc(100vh - 20rem))"
            onSelect={(entry) => {
              const [kind, id] = entry.id.split(':')
              if (kind === 'intel') openDrawer({ kind: 'intelligence', id: id ?? '' })
              else if (kind === 'incident') openDrawer({ kind: 'incident', id: id ?? '' })
              else if (kind === 'alert') navigate(ROUTES.alerts)
              else if (entry.route) navigate(entry.route)
            }}
          />
        </GovPanel>
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
              <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5', SHADE.teal.tile)}>
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
                  <div key={section.id} className={cn('rounded-lg border p-3', SHADE[SEVERITY_SHADE[section.severity]].tile)}>
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
                <div className="rounded-lg border border-warn-200 bg-warn-50/50 p-2.5 text-[0.6875rem] text-warn-700">
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
