import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Droplets,
  FileSearch,
  Gauge,
  HeartPulse,
  LayoutGrid,
  MapPin,
  Scale,
  Trash2,
  Users,
  Waves,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfidenceBadge,
  DefinitionList,
  DefinitionRow,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  ScoreDial,
  Select,
  SeverityBadge,
  StateBadge,
  Tabs,
  TrendBadge,
  toneForScore,
  SCORE_TONE_TEXT,
} from '@/components/ui'
import { MetricCard, IncidentCard, IntelligenceCard, ProjectCard } from '@/components/cards'
import { ChartFrame, ContributionBars, CategoryBarChart, HeatmapMatrix, MiniBar, RankedBarChart, CHART_COLOURS } from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { useServiceQuery, useQueryParamState, useBoundedSelection } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { wardService } from '@/services'
import type { ComparisonRow } from '@/services'
import { WARD_INDEX_WEIGHTS } from '@/domains'
import { useCurrentUser } from '@/stores/auth.store'
import { useContextStore, useDrawerStore } from '@/stores/ui.store'
import { officerDisplayName } from '@/data/reference'
import type { Ward } from '@/types/organisation'
import type { DataFreshness, IntelligenceDomain } from '@/types/common'
import type { IntelligenceItem } from '@/types/intelligence'
import { COMPLAINT_CATEGORY_LABEL, ASSET_CATEGORY_LABEL } from '@/types/operations'
import { DISEASE_LABEL } from '@/types/city-domains'
import { cn } from '@/utils/cn'
import {
  formatCompact,
  formatCrore,
  formatDelta,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  titleCase,
} from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Ward Intelligence - the ward as a single coherent operational picture.
 *
 * Three tabs: an assembled Ward Overview across every domain, an explainable
 * Risk & Performance Index (never presented as a bare number), and a
 * multi-ward comparison. The ward selector at the top governs every tab and
 * is kept in sync with both the shared context store and the `?ward=` query
 * parameter, so a link to this page reopens in exactly the same context.
 */

type WardTab = 'overview' | 'index' | 'compare'

/**
 * The ward this screen opens on, and whether anybody actually asked for it.
 *
 * `chosen` is true when the ward came from a link, from the operator's current
 * selection, or from the ward they are posted to - and false when the screen
 * simply had to open on something and took the first row. The distinction is
 * load-bearing: the ward selection is now shared with the command bar and with
 * every page's filter bar (`applyWardSelection` in `src/stores/ui.store.ts`),
 * so publishing an arbitrary first ward would silently narrow the whole
 * platform to a ward nobody picked, just because this page was visited.
 */
function resolveWardId(
  wardParam: string,
  contextWardId: string | null,
  homeWardId: string | undefined,
  wards: Ward[],
): { id: string; chosen: boolean } {
  if (wardParam && wards.some((w) => w.id === wardParam)) return { id: wardParam, chosen: true }
  if (contextWardId && wards.some((w) => w.id === contextWardId)) return { id: contextWardId, chosen: true }
  if (homeWardId && wards.some((w) => w.id === homeWardId)) return { id: homeWardId, chosen: true }
  return { id: wards[0]?.id ?? '', chosen: false }
}

export function WardIntelligencePage(): React.JSX.Element {
  const user = useCurrentUser()
  const [tab, setTab] = useState<WardTab>('overview')
  const [wardParam, setWardParam] = useQueryParamState('ward', '')
  const contextWardId = useContextStore((s) => s.wardId)
  const setContextWard = useContextStore((s) => s.setWard)

  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))
  const wards = wardsQuery.data ?? []
  const { id: resolvedWardId, chosen: wardWasChosen } = resolveWardId(wardParam, contextWardId, user?.wardId, wards)

  useEffect(() => {
    if (!resolvedWardId) return
    if (wardParam !== resolvedWardId) setWardParam(resolvedWardId)
    // Only a ward somebody asked for is published to the shared selection.
    // The fallback ward this screen opens on is a presentation default, and
    // publishing it would filter every other page in the platform to a ward
    // the operator never chose.
    if (wardWasChosen && contextWardId !== resolvedWardId) setContextWard(resolvedWardId)
  }, [resolvedWardId, wardWasChosen, wardParam, contextWardId, setWardParam, setContextWard])

  function selectWard(id: string): void {
    setWardParam(id)
    setContextWard(id)
  }

  const breadcrumbs = [{ label: t('City Intelligence') }, { label: t('Ward Intelligence') }]
  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 60,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  if (wardsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Ward Intelligence')} breadcrumbs={breadcrumbs} />
        <LoadingState variant="metrics" />
        <LoadingState variant="block" />
      </PageBody>
    )
  }
  if (wardsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Ward Intelligence')} breadcrumbs={breadcrumbs} />
        <ErrorState detail={wardsQuery.error.message} onRetry={() => wardsQuery.refetch()} />
      </PageBody>
    )
  }
  if (wards.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Ward Intelligence')} breadcrumbs={breadcrumbs} />
        <EmptyState
          title={t('No authorised wards')}
          detail="Your assigned role does not currently hold view access to any ward. Contact Access Governance if this is unexpected."
        />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const selectedWard = wards.find((w) => w.id === resolvedWardId) ?? wards[0]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('Ward Intelligence')}
        description={t('A coherent operational picture of every ward - citizen services, infrastructure condition, public health signal and capital delivery - together with an explainable composite risk index and a side-by-side comparison across wards.')}
        breadcrumbs={breadcrumbs}
        freshness={freshness}
        controls={
          wards.length > 1 ? (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-ink-400" aria-hidden />
              <Select
                value={resolvedWardId}
                onChange={(e) => selectWard(e.target.value)}
                options={wards.map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` }))}
                className="w-auto min-w-[15rem]"
                aria-label={t('Select ward')}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info" icon={<MapPin className="h-3 w-3" />}>
                {selectedWard.code} - {selectedWard.name.split(' · ')[0]}
              </Badge>
              <span className="text-[0.6875rem] text-ink-400">
                {t('Your assigned role is scoped to this ward only. Sign in as a different demonstration profile to view other wards.')}
              </span>
            </div>
          )
        }
      />

      <Tabs
        variant="underline"
        value={tab}
        onChange={(id) => setTab(id as WardTab)}
        ariaLabel="Ward Intelligence sections"
        items={[
          { id: 'overview', label: t('Ward Overview'), icon: <LayoutGrid className="h-3.5 w-3.5" /> },
          { id: 'index', label: t('Risk & Performance Index'), icon: <Gauge className="h-3.5 w-3.5" /> },
          {
            id: 'compare',
            label: t('Compare Wards'),
            icon: <Scale className="h-3.5 w-3.5" />,
            disabled: wards.length < 2,
          },
        ]}
      />

      {tab === 'overview' ? <WardOverviewTab wardId={resolvedWardId} wards={wards} onSelectWard={selectWard} /> : null}
      {tab === 'index' ? <RiskIndexTab wardId={resolvedWardId} wardLabel={selectedWard.name.split(' · ')[0] ?? selectedWard.code} /> : null}
      {tab === 'compare' ? <CompareTab wards={wards} /> : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default WardIntelligencePage

/* ==========================================================================
   Tab 1 - Ward Overview
   ========================================================================== */

function WardOverviewTab({
  wardId,
  wards,
  onSelectWard,
}: {
  wardId: string
  wards: Ward[]
  onSelectWard: (id: string) => void
}): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const profileQuery = useServiceQuery(queryKeys.wardProfile(wardId), (u) => wardService.profile(u, wardId))

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-4">
        <LoadingState variant="metrics" />
        <LoadingState variant="block" rows={6} />
      </div>
    )
  }
  if (profileQuery.error) {
    return <ErrorState detail={profileQuery.error.message} onRetry={() => profileQuery.refetch()} />
  }
  const profile = profileQuery.data
  if (!profile) {
    return <EmptyState title={t('No ward profile')} detail="A composite profile could not be assembled for this ward." />
  }

  const { ward } = profile

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow={`${ward.code} · ${ward.region}`}
          title={ward.name.split(' · ')[0] ?? ward.name}
          description={t('{0} residents · {1} km² · {2} households · Ward Officer: {3}', formatCompact(ward.population), ward.areaSqKm, formatCompact(ward.households), officerDisplayName(ward.wardOfficerId))}
          actions={<StateBadge state={profile.state} size="sm" />}
        />
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-5 lg:border-r lg:border-ink-100 lg:pr-5">
            <ScoreDial score={profile.healthScore} label="/100" caption={t('Operational health')} />
            <ScoreDial score={profile.riskScore} label="/100" caption={t('Composite risk')} higherIsBetter={false} />
          </div>
          <MetricGrid columns={4} className="flex-1">
            <MetricCard
              label={t('Open complaints')}
              value={profile.services.complaints.open}
              support={t('{0} SLA-breached', profile.services.complaints.slaBreached)}
              tone={profile.services.complaints.slaBreached > 0 ? 'warn' : 'default'}
              icon={<Users className="h-4 w-4" />}
            />
            <MetricCard
              label={t('Road condition index')}
              value={profile.roads.conditionIndex}
              unit="/100"
              support={t('{0} high-priority defects', profile.roads.openDefects)}
            />
            <MetricCard
              label={t('Monsoon readiness')}
              value={profile.drainage.readinessScore}
              unit="/100"
              support={t('{0} chronic locations', profile.drainage.floodSpots)}
              tone={profile.drainage.readinessScore < 60 ? 'warn' : 'default'}
            />
            <MetricCard
              label={t('Capital works at risk')}
              value={profile.projects.atRisk}
              support={t('of {0} active works', profile.projects.total)}
              tone={profile.projects.atRisk > 0 ? 'warn' : 'default'}
            />
          </MetricGrid>
        </div>
      </Card>

      {/* Citizen Services -------------------------------------------------- */}
      <Card>
        <CardHeader
          icon={<Users className="h-4 w-4" />}
          title={t('Citizen Services')}
          description={t('Complaint volumes, SLA compliance and repeat-complaint rate by service category.')}
        />
        <MetricGrid columns={4} className="mt-3">
          <MetricCard size="sm" label={t('Open')} value={profile.services.complaints.open} />
          <MetricCard
            size="sm"
            label={t('SLA-breached')}
            value={profile.services.complaints.slaBreached}
            tone={profile.services.complaints.slaBreached > 0 ? 'critical' : 'default'}
          />
          <MetricCard size="sm" label={t('Resolved rate')} value={formatPercent(profile.services.complaints.resolvedRate)} />
          <MetricCard
            size="sm"
            label={t('Repeat rate')}
            value={formatPercent(profile.services.complaints.repeatRate)}
            tone={profile.services.complaints.repeatRate > 15 ? 'warn' : 'default'}
          />
        </MetricGrid>
        {profile.services.byCategory.length > 0 ? (
          <div className="mt-4">
            <ChartFrame
              title={t('SLA compliance by category')}
              unit={t('%, higher is better')}
              timeframe="Current reporting period"
              height={Math.max(120, profile.services.byCategory.length * 28)}
            >
              <RankedBarChart
                data={profile.services.byCategory.map((c) => ({
                  label: COMPLAINT_CATEGORY_LABEL[c.category],
                  value: c.slaCompliancePct,
                }))}
                unit="%"
                higherIsWorse={false}
              />
            </ChartFrame>
          </div>
        ) : null}
        {profile.services.worstCategory ? (
          <p className="mt-3 rounded-md border border-warn-200 bg-warn-50/60 px-3 py-2 text-xs leading-relaxed text-warn-700">
            {t('Weakest category:')}{' '}<span className="font-semibold">{COMPLAINT_CATEGORY_LABEL[profile.services.worstCategory.category]}</span>{' '}
            at {formatPercent(profile.services.worstCategory.slaCompliancePct)}{' '}{t('SLA compliance,')}{' '}{profile.services.worstCategory.open}{' '}{t('open, average resolution')}{' '}{formatDuration(profile.services.worstCategory.avgResolutionHours)}.
          </p>
        ) : null}
        {profile.recentComplaints.length > 0 ? (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="label-institutional mb-1.5">{t('Recent complaints')}</p>
            <ul className="divide-y divide-ink-50">
              {profile.recentComplaints.slice(0, 6).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-ink-700">
                    <span className="font-mono text-ink-400">{c.reference}</span> {c.summary}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <SeverityBadge severity={c.severity} />
                    {c.slaBreached ? <Badge tone="critical">{t('SLA breached')}</Badge> : <Badge tone="muted">{titleCase(c.status)}</Badge>}
                    <span className="text-ink-400">{formatRelative(c.raisedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* Infrastructure ------------------------------------------------------ */}
      <Card>
        <CardHeader
          icon={<Droplets className="h-4 w-4" />}
          title={t('Infrastructure')}
          description={t('Water supply, solid waste, road condition, drainage readiness and municipal asset condition.')}
        />
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-ink-100 p-3">
            <p className="label-institutional mb-2 flex items-center gap-1.5">
              <Droplets className="h-3.5 w-3.5" />{' '}{t('Water supply')}{profile.water ? ` · ${profile.water.zoneName}` : ''}
            </p>
            {profile.water ? (
              <>
                <MetricGrid columns={2}>
                  <MetricCard
                    size="sm"
                    label={t('Supply vs demand')}
                    value={formatNumber(profile.water.supplyMld)}
                    unit="MLD"
                    support={t('of {0} MLD demand', formatNumber(profile.water.demandMld))}
                  />
                  <MetricCard size="sm" label={t('Reliability')} value={profile.water.reliabilityScore} unit="/100" />
                </MetricGrid>
                <DefinitionList className="mt-2">
                  <DefinitionRow label={t('Pressure')}>{profile.water.pressureM} m</DefinitionRow>
                  <DefinitionRow label={t('Supply hours')}>{t('{0} h/day', profile.water.supplyHours)}</DefinitionRow>
                  <DefinitionRow label={t('Non-revenue water')}>{formatPercent(profile.water.nrwPct)}</DefinitionRow>
                  <DefinitionRow label={t('Quality compliance')}>{formatPercent(profile.water.qualityCompliancePct)}</DefinitionRow>
                  <DefinitionRow label={t('Tanker trips/day')}>{profile.water.tankerTripsPerDay}</DefinitionRow>
                </DefinitionList>
                {profile.water.anomalies.length > 0 ? (
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-warn-700">{profile.water.anomalies.join(' · ')}</p>
                ) : null}
              </>
            ) : (
              <EmptyState compact title={t('No water zone mapped')} detail="This ward is not currently mapped to a water distribution zone record." />
            )}
          </div>

          <div className="rounded-lg border border-ink-100 p-3">
            <p className="label-institutional mb-2 flex items-center gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />{' '}{t('Solid waste')}
            </p>
            {profile.waste ? (
              <DefinitionList>
                <DefinitionRow label={t('Coverage')}>{formatPercent(profile.waste.coveragePct)}</DefinitionRow>
                <DefinitionRow label={t('Segregation at source')}>{formatPercent(profile.waste.segregationPct)}</DefinitionRow>
                <DefinitionRow label={t('Missed collections (7d)')}>{profile.waste.missedCollections7d}</DefinitionRow>
                <DefinitionRow label={t('Hotspots')}>{profile.waste.hotspots}</DefinitionRow>
                <DefinitionRow label={t('Vehicles deployed')}>{profile.waste.vehiclesDeployed}</DefinitionRow>
                <DefinitionRow label={t('State')}>
                  <StateBadge state={profile.waste.state} />
                </DefinitionRow>
              </DefinitionList>
            ) : (
              <EmptyState compact title={t('No waste performance record')} detail="No solid waste performance record is mapped to this ward." />
            )}
          </div>

          <div className="rounded-lg border border-ink-100 p-3">
            <p className="label-institutional mb-2">{t('Road network')}</p>
            <div className="flex items-baseline gap-2">
              <span className={cn('numeric text-2xl font-semibold', SCORE_TONE_TEXT[toneForScore(profile.roads.conditionIndex)])}>
                {profile.roads.conditionIndex}
              </span>
              <span className="text-xs text-ink-500">/100 condition index · {profile.roads.openDefects}{' '}{t('high-priority defects')}</span>
            </div>
            {profile.roads.topDefects.length > 0 ? (
              <ul className="mt-2.5 space-y-1.5">
                {profile.roads.topDefects.slice(0, 4).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-[0.6875rem]">
                    <span className="truncate text-ink-600">
                      {titleCase(d.type)} · {titleCase(d.status)}
                    </span>
                    <SeverityBadge severity={d.severity} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[0.6875rem] text-ink-400">{t('No high-priority defects currently recorded.')}</p>
            )}
          </div>

          <div className="rounded-lg border border-ink-100 p-3">
            <p className="label-institutional mb-2 flex items-center gap-1.5">
              <Waves className="h-3.5 w-3.5" />{' '}{t('Drainage & flood readiness')}
            </p>
            <DefinitionList>
              <DefinitionRow label={t('Blockage risk')}>{profile.drainage.riskScore}/100</DefinitionRow>
              <DefinitionRow label={t('Monsoon readiness')}>{profile.drainage.readinessScore}/100</DefinitionRow>
              <DefinitionRow label={t('Desilting completion')}>{formatPercent(profile.drainage.desiltingPct)}</DefinitionRow>
              <DefinitionRow label={t('Pump readiness')}>{formatPercent(profile.drainage.pumpReadiness)}</DefinitionRow>
              <DefinitionRow label={t('Chronic flood spots')}>{profile.drainage.floodSpots}</DefinitionRow>
            </DefinitionList>
            {profile.drainage.gaps.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {profile.drainage.gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-warn-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {g}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="label-institutional mb-2">{t('Municipal assets')}</p>
          <MetricGrid columns={4}>
            <MetricCard size="sm" label={t('Total assets')} value={profile.assets.total} />
            <MetricCard size="sm" label={t('Poor condition')} value={profile.assets.poorCondition} tone={profile.assets.poorCondition > 0 ? 'warn' : 'default'} />
            <MetricCard size="sm" label={t('Past design life')} value={profile.assets.pastDesignLife} />
            <MetricCard
              size="sm"
              label={t('Inspections overdue')}
              value={profile.assets.inspectionsOverdue}
              tone={profile.assets.inspectionsOverdue > 0 ? 'critical' : 'default'}
            />
          </MetricGrid>
          <p className="mt-2 text-[0.6875rem] text-ink-500">{t('Replacement value at risk: {0}', formatCrore(profile.assets.replacementValueCrore))}</p>
          {profile.assets.items.length > 0 ? (
            <ul className="mt-2 divide-y divide-ink-50">
              {profile.assets.items.slice(0, 5).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-ink-700">
                    {a.name} <span className="text-ink-400">· {ASSET_CATEGORY_LABEL[a.category]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <MiniBar value={a.conditionIndex} width={44} />
                    <span className="numeric font-semibold text-ink-700">{a.conditionIndex}</span>
                    <StateBadge state={a.state} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      {/* Health & Environment -------------------------------------------- */}
      <Card>
        <CardHeader
          icon={<HeartPulse className="h-4 w-4" />}
          title={t('Health & Environment')}
          description={t('Aggregate outbreak signal strength by disease indicator. No patient-level data of any kind is modelled.')}
        />
        {profile.health.topSignals.length === 0 ? (
          <EmptyState compact className="mt-3" title={t('No elevated signals')} detail="No outbreak signal above the reporting threshold is currently recorded for this ward." />
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {profile.health.topSignals.map((sig) => (
              <div key={sig.id} className="rounded-lg border border-ink-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-800">{DISEASE_LABEL[sig.disease]}</span>
                  <ConfidenceBadge confidence={sig.confidence} />
                </div>
                <p className={cn('numeric mt-1.5 text-xl font-semibold', SCORE_TONE_TEXT[toneForScore(sig.outbreakSignal, false)])}>
                  {sig.outbreakSignal}
                  <span className="ml-0.5 text-xs font-normal text-ink-400">/100</span>
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                  {t('{0} cases this period · {1} vs prior', sig.casesReported, formatDelta(sig.changePct))}
                </p>
                {sig.correlates.length > 0 ? (
                  <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-400">{t('Correlates observed: {0}', sig.correlates.join(', '))}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Delivery & Finance ------------------------------------------------ */}
      <Card>
        <CardHeader
          icon={<Banknote className="h-4 w-4" />}
          title={t('Delivery & Finance')}
          description={t('Capital works portfolio, revenue realisation and budget utilisation for the ward.')}
        />
        <MetricGrid columns={4} className="mt-3">
          <MetricCard size="sm" label={t('Sanctioned')} value={formatCrore(profile.projects.sanctionedCrore)} />
          <MetricCard size="sm" label={t('Paid to date')} value={formatCrore(profile.projects.paidCrore)} />
          <MetricCard size="sm" label={t('Collection efficiency')} value={formatPercent(profile.finance.collectionEfficiencyPct)} />
          <MetricCard size="sm" label={t('Budget utilisation')} value={formatPercent(profile.finance.budgetUtilisationPct)} />
        </MetricGrid>
        <DefinitionList className="mt-3">
          <DefinitionRow label={t('Revenue target vs collected')}>
            {formatCrore(profile.finance.revenueCollectedCrore)} of {formatCrore(profile.finance.revenueTargetCrore)}
          </DefinitionRow>
          <DefinitionRow label={t('Arrears')}>{formatCrore(profile.finance.arrearsCrore)}</DefinitionRow>
          <DefinitionRow label={t('Capital budget')}>
            {t('{0} spent of {1} allocated', formatCrore(profile.finance.budgetSpentCrore), formatCrore(profile.finance.budgetAllocatedCrore))}
          </DefinitionRow>
        </DefinitionList>
        {profile.projects.items.length > 0 ? (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="label-institutional mb-2">
              {t('Capital works - {0} delayed, {1} at risk of {2}', profile.projects.delayed, profile.projects.atRisk, profile.projects.total)}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {profile.projects.items.slice(0, 4).map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </div>
        ) : null}
        {profile.workforce.length > 0 || profile.contractors.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ink-100 pt-3 lg:grid-cols-2">
            {profile.workforce.length > 0 ? (
              <div>
                <p className="label-institutional mb-1.5">{t('Workforce')}</p>
                <ul className="divide-y divide-ink-50">
                  {profile.workforce.slice(0, 5).map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <span className="text-ink-700">{w.cadre}</span>
                      <span className="numeric text-ink-500">
                        {w.deployed}/{w.sanctioned}{' '}{t('deployed ·')}{' '}{formatPercent(w.vacancyPct)} vacant
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {profile.contractors.length > 0 ? (
              <div>
                <p className="label-institutional mb-1.5">{t('Contractors active in ward')}</p>
                <ul className="divide-y divide-ink-50">
                  {profile.contractors.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <span className="min-w-0 truncate text-ink-700">{c.name}</span>
                      <span className="numeric shrink-0 text-ink-500">
                        {t('{0} contract(s) · perf. {1}/100', c.activeContracts, c.performanceIndex)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* Map, incidents ----------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('Ward location')} description={t('Illustrative spatial position within the city; shading shows composite risk across all wards. Click another ward to change context.')} />
          <div className="mt-3">
            <CityMap
              layers={[{ id: 'risk', label: t('Composite Risk'), valueFor: (id) => wards.find((w) => w.id === id)?.riskScore, higherIsWorse: true, unit: '/100' }]}
              selectedWardId={wardId}
              onWardSelect={onSelectWard}
              height={320}
            />
          </div>
        </Card>
        <Card flush>
          <CardHeader className="px-4 pt-4 pb-3" title={t('Open incidents')} description={t('Incidents recorded against this ward not yet resolved or reviewed.')} />
          {profile.incidents.length === 0 ? (
            <EmptyState compact className="mx-4 mb-4" title={t('No open incidents')} detail="No unresolved incident is currently recorded for this ward." />
          ) : (
            <div className="scrollbar-slim max-h-80 space-y-2 overflow-y-auto p-4 pt-0">
              {profile.incidents.map((i) => (
                <IncidentCard key={i.id} incident={i} onClick={() => openDrawer({ kind: 'incident', id: i.id })} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card flush>
        <CardHeader className="px-4 pt-4 pb-3" title={t('Open intelligence')} description={t('Active intelligence items raised against this ward, across every domain.')} />
        {profile.openIntelligence.length === 0 ? (
          <EmptyState compact className="mx-4 mb-4" title={t('No open intelligence')} detail="No open intelligence item is currently recorded for this ward." />
        ) : (
          <div className="grid grid-cols-1 gap-2 p-4 pt-0 sm:grid-cols-2">
            {profile.openIntelligence.map((item) => (
              <IntelligenceCard key={item.id} item={item} compact onClick={() => openDrawer({ kind: 'intelligence', id: item.id })} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ==========================================================================
   Tab 2 - Risk & Performance Index
   ========================================================================== */

function build$WARD_INDEX_LABELS(): Record<keyof typeof WARD_INDEX_WEIGHTS, string> {
  return {
  serviceDelivery: t('Citizen service delivery'),
  infrastructureCondition: t('Infrastructure condition'),
  floodExposure: t('Flood and drainage exposure'),
  publicHealth: t('Public health signal'),
  deliveryPerformance: t('Capital delivery performance'),
  revenuePerformance: t('Revenue realisation'),
}
}
let WARD_INDEX_LABELS: Record<keyof typeof WARD_INDEX_WEIGHTS, string> = build$WARD_INDEX_LABELS()
registerLayer(() => {
  WARD_INDEX_LABELS = build$WARD_INDEX_LABELS()
})

const COMPONENT_EVIDENCE_DOMAINS: Record<string, IntelligenceDomain[]> = {
  serviceDelivery: ['wards'],
  infrastructureCondition: ['roads', 'waste', 'assets', 'water'],
  floodExposure: ['monsoon', 'stormwater'],
  publicHealth: ['health'],
  deliveryPerformance: ['projects'],
  revenuePerformance: ['revenue', 'budget'],
}

function evidenceForComponent(componentId: string, items: IntelligenceItem[]): string | undefined {
  const domains = COMPONENT_EVIDENCE_DOMAINS[componentId] ?? []
  const match = items.find((i) => domains.includes(i.domain) && i.evidenceIds.length > 0)
  const fallback = items.find((i) => i.evidenceIds.length > 0)
  return match?.evidenceIds[0] ?? fallback?.evidenceIds[0]
}

function RiskIndexTab({ wardId, wardLabel }: { wardId: string; wardLabel: string }): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const riskQuery = useServiceQuery(['bmc-mii', 'ward-risk-index', wardId], (u) => wardService.riskIndex(u, wardId))
  const profileQuery = useServiceQuery(queryKeys.wardProfile(wardId), (u) => wardService.profile(u, wardId))

  if (riskQuery.isLoading || profileQuery.isLoading) {
    return (
      <div className="space-y-4">
        <LoadingState variant="metrics" />
        <LoadingState variant="block" rows={6} />
      </div>
    )
  }
  if (riskQuery.error) {
    return <ErrorState detail={riskQuery.error.message} onRetry={() => riskQuery.refetch()} />
  }
  const riskIndex = riskQuery.data
  if (!riskIndex) {
    return <EmptyState title={t('No risk index available')} detail="A risk index could not be computed for this ward." />
  }
  const profile = profileQuery.data

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow={t('Ward Risk & Performance Index')}
          title={t('{0} - composite index', wardLabel)}
          description={t('A weighted composite across six components. Every component is explainable: its raw score, its published weight and its contribution to the total are shown below. The composite is a risk index - a higher score is worse.')}
        />
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <ScoreDial score={riskIndex.score} size={112} label="/100" caption={t('Composite index')} higherIsBetter={false} />
          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <TrendBadge
                trend={{
                  direction: riskIndex.trendPct > 0.4 ? 'up' : riskIndex.trendPct < -0.4 ? 'down' : 'flat',
                  changePct: riskIndex.trendPct,
                  polarity: 'positive',
                  comparisonLabel: 'ward health trend, vs previous period',
                }}
              />
              <ConfidenceBadge
                confidence={riskIndex.confidence}
                rationale={t('Confidence reflects the depth of underlying service, project and asset records held for this ward.')}
              />
            </div>
            <p className="text-xs leading-relaxed text-ink-500">
              {t('The index rises when service delivery, infrastructure condition, flood exposure, public health signal, capital delivery or revenue performance deteriorate. It is recomputed from the same published weights for every ward, so composite scores are directly comparable across the city.')}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Component contribution')} description={t('Each component\'s raw score (0–100, higher is worse), its published weight and its resulting contribution to the composite.')} />
        <ContributionBars
          className="mt-3"
          items={riskIndex.components.map((c) => ({ id: c.id, label: c.label, contribution: c.contribution, weight: c.weight, rawScore: c.score, explanation: c.explanation }))}
        />
        <div className="mt-4 space-y-2 border-t border-ink-100 pt-3">
          {riskIndex.components.map((c) => {
            const evId = evidenceForComponent(c.id, profile?.openIntelligence ?? [])
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-600">
                  {c.label} <span className="text-ink-400">{t('· {0} period movement, tracking ward health trend', formatDelta(c.trendPct))}</span>
                </span>
                {evId ? (
                  <Button size="xs" variant="outline" icon={<FileSearch className="h-3 w-3" />} onClick={() => openDrawer({ kind: 'evidence', id: evId })}>
                    {t('Evidence')}
                  </Button>
                ) : (
                  <span className="text-[0.6875rem] text-ink-400">{t('No linked evidence record')}</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card tone="warn">
        <CardHeader icon={<AlertTriangle className="h-4 w-4" />} title={t('Why this ward is deteriorating')} description={t('Institutional explanation of the components currently exceeding their attention threshold.')} />
        <ul className="mt-2 space-y-2">
          {riskIndex.deteriorationReasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warn-500" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title={t('Index methodology')} description={t('The composite weighting is fixed and identical for every ward, published here for transparency.')} />
        <DefinitionList className="mt-2">
          {(Object.keys(WARD_INDEX_WEIGHTS) as Array<keyof typeof WARD_INDEX_WEIGHTS>).map((key) => (
            <DefinitionRow key={key} label={WARD_INDEX_LABELS[key]}>
              {formatPercent(WARD_INDEX_WEIGHTS[key] * 100, 0)} weight
            </DefinitionRow>
          ))}
        </DefinitionList>
      </Card>
    </div>
  )
}

/* ==========================================================================
   Tab 3 - Compare Wards
   ========================================================================== */

function CompareTab({ wards }: { wards: Ward[] }): React.JSX.Element {
  const selection = useBoundedSelection(wards.slice(0, 2).map((w) => w.id), 4)
  const [chartMetric, setChartMetric] = useState<string>('health')

  const sortedSelected = [...selection.selected].sort()
  const compareQuery = useServiceQuery(
    ['bmc-mii', 'ward-compare', sortedSelected.join(',')],
    (u) => wardService.compare(u, selection.selected),
    { enabled: selection.selected.length >= 2 },
  )

  const selectorPanel = (
    <Card>
      <CardHeader title={t('Select wards to compare')} description={t('Choose between 2 and 4 wards. {0} of 4 selected.', selection.selected.length)} />
      <div className="scrollbar-slim mt-3 max-h-56 overflow-y-auto rounded-md border border-ink-100 p-2">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {wards.map((w) => (
            <Checkbox
              key={w.id}
              checked={selection.isSelected(w.id)}
              onChange={() => selection.toggle(w.id)}
              disabled={!selection.isSelected(w.id) && selection.atLimit}
              label={`${w.code} - ${w.name.split(' · ')[0]}`}
            />
          ))}
        </div>
      </div>
      {selection.selected.length < 2 ? <p className="mt-2 text-[0.6875rem] text-warn-700">{t('Select at least two wards to see a comparison.')}</p> : null}
    </Card>
  )

  if (wards.length < 2) {
    return (
      <EmptyState
        title={t('Comparison unavailable')}
        detail="Your authorised scope covers a single ward. Ward comparison requires view access to at least two wards."
      />
    )
  }
  if (selection.selected.length < 2) {
    return <div className="space-y-4">{selectorPanel}</div>
  }
  if (compareQuery.isLoading) {
    return (
      <div className="space-y-4">
        {selectorPanel}
        <LoadingState variant="table" rows={8} />
      </div>
    )
  }
  if (compareQuery.error) {
    return (
      <div className="space-y-4">
        {selectorPanel}
        <ErrorState detail={compareQuery.error.message} onRetry={() => compareQuery.refetch()} />
      </div>
    )
  }

  const rows: ComparisonRow[] = compareQuery.data ?? []
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {selectorPanel}
        <EmptyState title={t('No comparison data')} detail="No comparison rows were returned for the selected wards." />
      </div>
    )
  }

  const selectedWards = selection.selected.map((id) => wards.find((w) => w.id === id)).filter((w): w is Ward => Boolean(w))
  const chartRow = rows.find((r) => r.id === chartMetric) ?? rows[0]

  const heatmapValues: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const values = selectedWards.map((w) => row.values[w.id] ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const cell: Record<string, number> = {}
    for (const w of selectedWards) {
      const v = row.values[w.id] ?? 0
      const normalised = ((v - min) / range) * 100
      cell[w.id] = row.higherIsBetter ? normalised : 100 - normalised
    }
    heatmapValues[row.id] = cell
  }

  return (
    <div className="space-y-4">
      {selectorPanel}

      <Card flush>
        <CardHeader
          className="px-4 pt-4 pb-3"
          title={t('Comparison table')}
          description={t('The best figure per row is shown in positive tone, the worst in critical tone, respecting whether higher is better for that metric.')}
        />
        <div className="scrollbar-slim overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-ink-100 bg-surface-sunken">
                <th className="label-institutional px-3 py-2">{t('Metric')}</th>
                {selectedWards.map((w) => (
                  <th key={w.id} className="label-institutional px-3 py-2 text-right">
                    {w.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {rows.map((row) => {
                const values = selectedWards.map((w) => row.values[w.id] ?? 0)
                const best = row.higherIsBetter ? Math.max(...values) : Math.min(...values)
                const worst = row.higherIsBetter ? Math.min(...values) : Math.max(...values)
                const spread = best !== worst
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap text-ink-700">{row.label}</td>
                    {selectedWards.map((w) => {
                      const v = row.values[w.id] ?? 0
                      const isBest = spread && v === best
                      const isWorst = spread && v === worst
                      return (
                        <td
                          key={w.id}
                          className={cn(
                            'numeric px-3 py-2 text-right font-semibold',
                            isBest && 'text-ok-700',
                            isWorst && 'text-crit-700',
                            !isBest && !isWorst && 'text-ink-700',
                          )}
                        >
                          {formatNumber(v, v % 1 === 0 ? 0 : 1)}
                          {row.unit}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t('Relative standing')}
          description={t('Each cell shows relative standing across the selected wards on a 0–100 scale, normalised per metric (100 = best performer for that metric). See the table above for exact figures.')}
        />
        <div className="mt-3" style={{ height: Math.max(260, rows.length * 26) }}>
          <HeatmapMatrix
            rows={rows.map((r) => ({ id: r.id, label: r.label }))}
            columns={selectedWards.map((w) => ({ id: w.id, label: w.code }))}
            higherIsBetter
            values={heatmapValues}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t('Grouped comparison')}
          description={t('Compare a single metric across the selected wards.')}
          actions={
            <Select
              value={chartMetric}
              onChange={(e) => setChartMetric(e.target.value)}
              options={rows.map((r) => ({ value: r.id, label: r.label }))}
              className="w-auto min-w-[13rem]"
              aria-label={t('Metric to chart')}
            />
          }
        />
        {chartRow ? (
          <div className="mt-3">
            <ChartFrame title={chartRow.label} unit={chartRow.unit || 'value'} timeframe="Current reporting period" height={240}>
              <CategoryBarChart
                data={selectedWards.map((w) => ({ label: w.code, value: chartRow.values[w.id] ?? 0 }))}
                series={[{ key: 'value', label: chartRow.label, colour: CHART_COLOURS.primary }]}
                layout="vertical"
                unit={chartRow.unit}
              />
            </ChartFrame>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
