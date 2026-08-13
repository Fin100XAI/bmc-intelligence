import { useMemo } from 'react'
import { ChevronRight, Info, Target, Trophy } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService, monsoonService, projectService, revenueService, roadsService, wasteService, waterService } from '@/services'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatPercent } from '@/utils/format'
import type { ConfidenceLevel, OperationalState, SeriesPoint } from '@/types/common'
import {
  Badge,
  Card,
  CardHeader,
  ConfidenceBadge,
  DemonstrationNotice,
  ErrorState,
  LoadingState,
  MetricGrid,
  ProgressBar,
  StateBadge,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { ChartFrame, RankedBarChart, TrendChart } from '@/components/charts'
import { usePageMasthead } from '@/stores/masthead.store'
import { t } from '@/i18n'

/**
 * Outcome Intelligence.
 *
 * Input → Activity → Output → Outcome for every programme this platform can
 * assemble from its own service layer. Operational KPIs (an output - "roads
 * resurfaced", "coverage achieved") are not outcomes (the citizen-facing
 * effect - "corridors that stay passable", "wards that stop flooding"). The
 * platform tracks both and reports the outcome without adjustment, including
 * where an intervention has not been effective.
 *
 * "Baseline" throughout is the phased-plan expectation at this point in the
 * financial year (31% elapsed) - the same convention Budget Intelligence and
 * Revenue Intelligence use - not a fabricated prior observation.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-240),
  refreshIntervalMinutes: 1440,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const YEAR_ELAPSED = 0.31

interface OutcomePipeline {
  id: string
  title: string
  domain: string
  input: { label: string; value: string }
  activity: { label: string; value: string }
  output: { label: string; value: string }
  outcomeLabel: string
  achievedPct: number
  targetPct: number
  baselinePct: number
  confidence: ConfidenceLevel
  state: OperationalState
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function stateFromGap(achieved: number, target: number): OperationalState {
  const gap = target - achieved
  if (gap <= 5) return 'operational'
  if (gap <= 15) return 'degraded'
  if (gap <= 30) return 'at-risk'
  return 'critical'
}

function confidenceFromVolume(n: number): ConfidenceLevel {
  if (n >= 15) return 'high'
  if (n >= 5) return 'medium'
  return 'low'
}

function trendPointsFor(pipeline: Pick<OutcomePipeline, 'baselinePct' | 'achievedPct'>): SeriesPoint[] {
  return [
    { label: t('Phased-plan expectation'), value: Math.round(pipeline.baselinePct * 10) / 10 },
    { label: t('Current position'), value: Math.round(pipeline.achievedPct * 10) / 10 },
  ]
}

export function OutcomeIntelligencePage(): React.JSX.Element {
  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(
    t('Outcome Intelligence'),
    t('Input, activity, output and outcome for every programme this platform can assemble end to end from its own operational records - the citizen-facing effect a programme was meant to produce, not merely the work completed on the way to it.'),
  )

  const projectsQuery = useServiceQuery(queryKeys.projects({ scope: 'outcomes' }), (u) => projectService.list(u, { pageSize: 300 }))
  const roadsQuery = useServiceQuery(queryKeys.roads('outcomes'), (u) => roadsService.segments(u))
  const wasteQuery = useServiceQuery(queryKeys.waste('outcomes'), (u) => wasteService.wardPerformance(u))
  const waterQuery = useServiceQuery(queryKeys.water('outcomes'), (u) => waterService.zones(u))
  const monsoonQuery = useServiceQuery(queryKeys.monsoon('outcomes'), (u) => monsoonService.readiness(u))
  const healthQuery = useServiceQuery(queryKeys.health('outcomes'), (u) => healthService.indicators(u))
  const revenueQuery = useServiceQuery(queryKeys.revenue('outcomes'), (u) => revenueService.totals(u))

  const anyLoading =
    projectsQuery.isLoading || roadsQuery.isLoading || wasteQuery.isLoading || waterQuery.isLoading || monsoonQuery.isLoading || healthQuery.isLoading || revenueQuery.isLoading
  const anyError = projectsQuery.error ?? roadsQuery.error ?? wasteQuery.error ?? waterQuery.error ?? monsoonQuery.error ?? healthQuery.error ?? revenueQuery.error

  const pipelines: OutcomePipeline[] = useMemo(() => {
    const out: OutcomePipeline[] = []

    if (projectsQuery.data) {
      const items = projectsQuery.data.items
      const active = items.filter((p) => p.status !== 'completed' && p.status !== 'closed')
      const onTrack = active.filter((p) => p.riskScore < 55)
      const achievedPct = active.length > 0 ? (onTrack.length / active.length) * 100 : 0
      const target = 75
      out.push({
        id: 'projects',
        title: t('Capital project delivery'),
        domain: 'Capital Works',
        input: { label: t('Sanctioned exposure, active works'), value: formatCrore(active.reduce((s, p) => s + p.sanctionedCostCrore, 0)) },
        activity: { label: t('Capital works in execution'), value: `${active.length} active works` },
        output: {
          label: t('Mean physical progress vs phased plan'),
          value: `${Math.round(mean(active.map((p) => p.completionPct)))}% vs ${Math.round(mean(active.map((p) => p.plannedCompletionPct)))}%`,
        },
        outcomeLabel: 'Active works delivering within acceptable risk (composite risk score below 55)',
        achievedPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: confidenceFromVolume(active.length),
        state: stateFromGap(achievedPct, target),
      })
    }

    if (roadsQuery.data) {
      const segments = roadsQuery.data
      const critical = segments.filter((s) => s.emergencyRoute || s.hospitalAccess)
      const meeting = critical.filter((s) => s.conditionIndex >= 65)
      const achievedPct = critical.length > 0 ? (meeting.length / critical.length) * 100 : 0
      const target = 90
      out.push({
        id: 'roads',
        title: t('Road network serviceability'),
        domain: 'Roads',
        input: { label: t('Network under management'), value: `${Math.round(segments.reduce((s, r) => s + r.lengthKm, 0))} km, ${segments.length} segments` },
        activity: { label: t('Emergency / hospital-access segments'), value: `${critical.length} segments` },
        output: { label: t('Mean network condition index'), value: `${Math.round(mean(segments.map((s) => s.conditionIndex)))}/100` },
        outcomeLabel: 'Emergency and hospital-access corridors meeting the 65-point condition standard',
        achievedPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: confidenceFromVolume(critical.length),
        state: stateFromGap(achievedPct, target),
      })
    }

    if (wasteQuery.data) {
      const rows = wasteQuery.data
      const meetingSegregation = rows.filter((r) => r.segregationPct >= 60)
      const achievedPct = rows.length > 0 ? (meetingSegregation.length / rows.length) * 100 : 0
      const target = 75
      out.push({
        id: 'waste',
        title: t('Solid waste processing'),
        domain: 'Solid Waste',
        input: { label: t('Waste generated citywide'), value: `${Math.round(rows.reduce((s, r) => s + r.generationTpd, 0))} TPD` },
        activity: { label: t('Collection vehicles deployed'), value: `${rows.reduce((s, r) => s + r.vehiclesDeployed, 0)} vehicles` },
        output: { label: t('Mean collection coverage'), value: formatPercent(mean(rows.map((r) => r.coveragePct))) },
        outcomeLabel: 'Wards meeting the 60% segregation-at-source target',
        achievedPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: confidenceFromVolume(rows.length),
        state: stateFromGap(achievedPct, target),
      })
    }

    if (waterQuery.data) {
      const zones = waterQuery.data
      const reliable = zones.filter((z) => z.deficitMld / Math.max(z.demandMld, 1) < 0.05)
      const achievedPct = zones.length > 0 ? (reliable.length / zones.length) * 100 : 0
      const target = 80
      out.push({
        id: 'water',
        title: t('Water supply reliability'),
        domain: 'Water Supply',
        input: { label: t('Assessed demand, all zones'), value: `${Math.round(zones.reduce((s, z) => s + z.demandMld, 0))} MLD, ${zones.length} zones` },
        activity: { label: t('Bulk supply delivered'), value: `${Math.round(zones.reduce((s, z) => s + z.supplyMld, 0))} MLD` },
        output: { label: t('Mean water quality compliance'), value: formatPercent(mean(zones.map((z) => z.qualityCompliancePct))) },
        outcomeLabel: 'Zones supplied within 5% of assessed demand',
        achievedPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: confidenceFromVolume(zones.length),
        state: stateFromGap(achievedPct, target),
      })
    }

    if (monsoonQuery.data) {
      const rows = monsoonQuery.data
      const totalSpots = rows.reduce((s, r) => s + r.floodSpots, 0)
      const totalMitigated = rows.reduce((s, r) => s + r.spotsMitigated, 0)
      const achievedPct = totalSpots > 0 ? (totalMitigated / totalSpots) * 100 : 100
      const target = 80
      out.push({
        id: 'monsoon',
        title: t('Monsoon preparedness'),
        domain: 'Monsoon & Flood',
        input: { label: t('Pumps and response teams allocated'), value: `${rows.reduce((s, r) => s + r.dewateringPumps, 0)} pumps, ${rows.reduce((s, r) => s + r.teamsAllocated, 0)} teams` },
        activity: { label: t('Mean pre-monsoon desilting completion'), value: formatPercent(mean(rows.map((r) => r.desiltingPct))) },
        output: { label: t('Mean ward readiness score'), value: `${Math.round(mean(rows.map((r) => r.readinessScore)))}/100` },
        outcomeLabel: 'Chronic waterlogging locations mitigated ahead of the season',
        achievedPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: confidenceFromVolume(rows.length),
        state: stateFromGap(achievedPct, target),
      })
    }

    if (healthQuery.data) {
      const rows = healthQuery.data
      const contained = rows.filter((r) => r.outbreakSignal < 55)
      const achievedPct = rows.length > 0 ? (contained.length / rows.length) * 100 : 100
      const target = 85
      out.push({
        id: 'health',
        title: t('Public health surveillance responsiveness'),
        domain: 'Public Health',
        input: { label: t('Ward-disease indicators monitored'), value: `${rows.length} indicators` },
        activity: { label: t('Highest current outbreak signal'), value: `${Math.max(0, ...rows.map((r) => r.outbreakSignal))}/100` },
        output: { label: t('Mean outbreak signal across all indicators'), value: `${Math.round(mean(rows.map((r) => r.outbreakSignal)))}/100` },
        outcomeLabel: 'Aggregate signals held below the 55-point elevated threshold',
        achievedPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: confidenceFromVolume(rows.length),
        state: stateFromGap(achievedPct, target),
      })
    }

    if (revenueQuery.data) {
      const totals = revenueQuery.data
      const target = 42
      out.push({
        id: 'revenue',
        title: t('Revenue realisation'),
        domain: 'Revenue',
        input: { label: t('Annual revenue target'), value: formatCrore(totals.target) },
        activity: { label: t('Collected to date'), value: formatCrore(totals.collected) },
        output: { label: t('Collection efficiency, year to date'), value: formatPercent(totals.efficiencyPct) },
        outcomeLabel: 'Collection efficiency against the year-to-date institutional benchmark',
        achievedPct: totals.efficiencyPct,
        targetPct: target,
        baselinePct: target * YEAR_ELAPSED,
        confidence: 'high',
        state: stateFromGap(totals.efficiencyPct, target),
      })
    }

    return out
  }, [projectsQuery.data, roadsQuery.data, wasteQuery.data, waterQuery.data, monsoonQuery.data, healthQuery.data, revenueQuery.data])

  const onTrack = pipelines.filter((p) => p.achievedPct >= p.targetPct - 5)
  const behind = pipelines.filter((p) => p.achievedPct < p.targetPct - 20)
  const developing = pipelines.filter((p) => !onTrack.includes(p) && !behind.includes(p))

  const rankedGaps = [...pipelines]
    .map((p) => ({ label: p.title, value: Math.round((p.targetPct - p.achievedPct) * 10) / 10 }))
    .sort((a, b) => b.value - a.value)

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Urban Intelligence')}
        breadcrumbs={[{ label: t('Strategic Urban Intelligence') }, { label: t('Outcome Intelligence') }]}
        freshness={FRESHNESS}
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? (
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void projectsQuery.refetch()
            void roadsQuery.refetch()
            void wasteQuery.refetch()
            void waterQuery.refetch()
            void monsoonQuery.refetch()
            void healthQuery.refetch()
            void revenueQuery.refetch()
          }}
        />
      ) : null}

      {/* ── Two columns ─────────────────────────────────────────────
          The programme chains are the record and read down the wide column,
          one under the next, so a reader compares the same four stages in the
          same four places. What ranks and qualifies them — the portfolio
          classification, the gap ordering, and the standing caution that an
          output is not an outcome — sits alongside. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          {!anyLoading && !anyError ? (
            <>
              <Card>
                <CardHeader icon={<Trophy className="h-4 w-4" />} title={t('Portfolio summary')} description={t('Every programme classified against its own target, not a uniform bar.')} />
                <MetricGrid columns={3} className="mt-3">
                  <MetricCard label={t('On track')} value={onTrack.length} tone="positive" support={t('Within 5 points of target')} />
                  <MetricCard label={t('Developing')} value={developing.length} tone="warn" support={t('Between on-track and materially behind')} />
                  <MetricCard label={t('Behind target')} value={behind.length} tone={behind.length > 0 ? 'critical' : 'default'} support={t('More than 20 points short')} />
                </MetricGrid>
              </Card>

              {pipelines.map((p) => (
              <Card key={p.id} flush>
                <CardHeader
                  className="px-4 pt-4"
                  eyebrow={p.domain}
                  title={p.title}
                  actions={
                    <div className="flex items-center gap-1.5">
                      <ConfidenceBadge confidence={p.confidence} />
                      <StateBadge state={p.state} />
                    </div>
                  }
                />

                <div className="scrollbar-slim flex items-stretch gap-0 overflow-x-auto px-4 py-3">
                  {[
                    { stageName: 'Input', caption: p.input.label, value: p.input.value },
                    { stageName: 'Activity', caption: p.activity.label, value: p.activity.value },
                    { stageName: 'Output', caption: p.output.label, value: p.output.value },
                    { stageName: 'Outcome', caption: p.outcomeLabel, value: formatPercent(p.achievedPct) },
                  ].map((stage, i) => (
                    <div key={stage.stageName} className="flex items-stretch">
                      <div className={'flex w-48 shrink-0 flex-col rounded-[2px] border p-2.5 ' + (i === 3 ? 'border-intel-300 bg-intel-50/50' : 'border-ink-100 bg-surface-sunken')}>
                        <span className={'text-[0.625rem] font-semibold tracking-wide uppercase ' + (i === 3 ? 'text-intel-700' : 'text-ink-400')}>{stage.stageName}</span>
                        <span className="numeric mt-1 text-sm font-semibold text-ink-900">{stage.value}</span>
                        <span className="mt-1 text-[0.6875rem] leading-snug text-ink-600">{stage.caption}</span>
                      </div>
                      {i < 3 ? (
                        <div className="flex w-5 shrink-0 items-center justify-center">
                          <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-ink-100 px-4 py-3 lg:grid-cols-[1fr_1fr]">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-ink-500">
                        <Target className="h-3 w-3" />{' '}{t('Achieved vs target')}
                      </span>
                      <span className="numeric font-semibold text-ink-800">
                        {formatPercent(p.achievedPct)} <span className="font-normal text-ink-400">{t('of {0} target', formatPercent(p.targetPct))}</span>
                      </span>
                    </div>
                    <ProgressBar value={p.achievedPct} max={Math.max(p.targetPct, p.achievedPct, 1)} showValue={false} />
                    <p className="mt-1.5 text-[0.6875rem] text-ink-400">
                      {t('Baseline: phased-plan expectation at this point in the year ({0}).', formatPercent(p.baselinePct))}
                    </p>
                  </div>
                  <div className="h-28">
                    <ChartFrame title={t('Baseline vs current')} unit="%" timeframe="This financial year" height={90}>
                      <TrendChart points={trendPointsFor(p)} unit="%" variant="line" referenceValue={p.targetPct} referenceLabel="Target" />
                    </ChartFrame>
                  </div>
                </div>

                {p.state === 'critical' || p.state === 'at-risk' ? (
                  <p className="border-t border-warn-200 bg-warn-50/40 px-4 py-2 text-[0.6875rem] leading-relaxed text-warn-700">
                    {t('This outcome is materially behind target. The gap is reported here without adjustment - it does not indicate that no intervention has been made, only that the measured effect has not yet moved the outcome to the target position.')}
                  </p>
                ) : null}
              </Card>
              ))}

              <Badge tone="muted" className="w-fit">
                {t('{0} programme{1} tracked end to end', pipelines.length, pipelines.length === 1 ? '' : 's')}
              </Badge>
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          {!anyLoading && !anyError ? (
            <Card>
              <ChartFrame title={t('Ranked gap to target')} unit={t('percentage points short')} timeframe="Current reporting position" height={Math.max(180, pipelines.length * 26)}>
                <RankedBarChart data={rankedGaps} higherIsWorse unit=" pp" />
              </ChartFrame>
            </Card>
          ) : null}

          <Card tone="info">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
              {t('Operational KPIs are not outcomes. Coverage achieved, kilometres resurfaced or works completed are outputs - what was done. An outcome is what that output changed for a resident - whether a corridor stays passable, a ward stops flooding, a signal is contained. This platform tracks both, and reports the outcome without adjustment, including where an intervention has demonstrably not been effective.')}
            </p>
          </Card>

          <DemonstrationNotice />
        </div>
      </div>
    </PageBody>
  )
}

export default OutcomeIntelligencePage
