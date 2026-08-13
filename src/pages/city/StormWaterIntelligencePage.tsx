import { useState } from 'react'
import { AlertTriangle, Droplets, Gauge, ScanSearch, Siren, Waves } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  MetricGrid,
  StateBadge,
  toneForScore,
  type Column,
  type ScoreTone,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, CHART_COLOURS, ChartFrame, ContributionBars, MiniBar } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { monsoonService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import { wardName, wardShortName } from '@/data/reference'
import type {
  DesiltingContractorPosition,
  DesiltingWorkOrder,
  PumpingStation,
  PumpUnit,
  StormWaterDrain,
  WorkVerification,
} from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { cn } from '@/utils/cn'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatDate, formatNumber, formatPercent } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Storm Water Intelligence - nallahs, closed drains, culverts and the
 * pumping stations that discharge them, read against the pre-monsoon
 * desilting cycle and explained through the published blockage-risk
 * drivers carried on every reach.
 */

function build$DRAIN_TYPE_LABEL(): Record<StormWaterDrain['type'], string> {
  return {
  'major-nallah': t('Major Nallah'),
  'minor-nallah': t('Minor Nallah'),
  'closed-drain': t('Closed Drain'),
  culvert: t('Culvert'),
}
}
let DRAIN_TYPE_LABEL: Record<StormWaterDrain['type'], string> = build$DRAIN_TYPE_LABEL()
registerLayer(() => {
  DRAIN_TYPE_LABEL = build$DRAIN_TYPE_LABEL()
})

/**
 * How a claim of completed work has been checked. The ordering here is the
 * ordering an officer reads it in: what can be shown, what was photographed,
 * what rests on the contractor's own record, and what is contested.
 */
function build$VERIFICATION_LABEL(): Record<WorkVerification, string> {
  return {
  'machine-verified': t('Machine verified'),
  'photo-verified': t('Photo verified'),
  'claimed-unverified': t('Claimed, unverified'),
  disputed: t('Disputed'),
}
}
let VERIFICATION_LABEL: Record<WorkVerification, string> = build$VERIFICATION_LABEL()
registerLayer(() => {
  VERIFICATION_LABEL = build$VERIFICATION_LABEL()
})

function build$PUMP_STATUS_LABEL(): Record<PumpUnit['status'], string> {
  return {
  running: t('Running'),
  standby: t('Standby'),
  fault: t('Fault'),
  maintenance: t('Under maintenance'),
}
}
let PUMP_STATUS_LABEL: Record<PumpUnit['status'], string> = build$PUMP_STATUS_LABEL()
registerLayer(() => {
  PUMP_STATUS_LABEL = build$PUMP_STATUS_LABEL()
})

const PUMP_STATUS_TONE: Record<PumpUnit['status'], ScoreTone> = {
  running: 'positive',
  standby: 'neutral',
  fault: 'critical',
  maintenance: 'warn',
}

const VERIFICATION_TONE: Record<WorkVerification, ScoreTone> = {
  'machine-verified': 'positive',
  'photo-verified': 'neutral',
  'claimed-unverified': 'warn',
  disputed: 'critical',
}

/**
 * The share of recorded quantum a corporation should be able to corroborate
 * before the programme reads as accounted for. Not a statutory figure - it is
 * the threshold this platform uses to decide when to say so on screen.
 */
const VERIFICATION_EXPECTATION_PCT = 70

const PRE_MONSOON_DESILTING_TARGET = 100
const DESILTING_OPERATIONAL_THRESHOLD = 92
const PUMP_READINESS_THRESHOLD = 80

const FRESHNESS: DataFreshness = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-95),
  refreshIntervalMinutes: 180,
  origin: 'demonstration',
  sourceState: 'operational',
  stale: false,
}

export function StormWaterIntelligencePage(): React.JSX.Element {
  usePageMasthead(
    t('Storm Water Intelligence'),
    t('Nallahs, closed drains and culverts across the storm water drainage network, read against pre-monsoon desilting targets and published blockage-risk drivers, together with the pumping station readiness that governs discharge during high-intensity rainfall.'),
  )

  const filters = useFilterStore((s) => s.filters)
  const [selectedDrainId, setSelectedDrainId] = useState<string | null>(null)

  const drainsQuery = useServiceQuery(queryKeys.monsoon('drains'), (u) => monsoonService.drains(u))
  const pumpsQuery = useServiceQuery(queryKeys.monsoon('pumping-stations'), (u) => monsoonService.pumpingStations(u))
  const readinessQuery = useServiceQuery(queryKeys.monsoon('readiness'), (u) => monsoonService.readiness(u))
  const programmeQuery = useServiceQuery(queryKeys.monsoon('desilting-programme'), (u) => monsoonService.desiltingProgramme(u))
  const ordersQuery = useServiceQuery(queryKeys.monsoon('desilting-orders'), (u) => monsoonService.desiltingOrders(u))
  const unitsQuery = useServiceQuery(queryKeys.monsoon('pump-units'), (u) => monsoonService.pumpUnits(u))
  const fleetQuery = useServiceQuery(queryKeys.monsoon('pump-fleet'), (u) => monsoonService.pumpFleet(u))

  const breadcrumbs = [{ label: t('City Intelligence') }, { label: t('Storm Water Intelligence') }]

  if (
    drainsQuery.isLoading ||
    pumpsQuery.isLoading ||
    readinessQuery.isLoading ||
    programmeQuery.isLoading ||
    ordersQuery.isLoading ||
    unitsQuery.isLoading ||
    fleetQuery.isLoading
  ) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }

  const anyError =
    drainsQuery.error ?? pumpsQuery.error ?? readinessQuery.error ?? programmeQuery.error ?? ordersQuery.error ?? unitsQuery.error ?? fleetQuery.error
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void drainsQuery.refetch()
            void pumpsQuery.refetch()
            void readinessQuery.refetch()
            void programmeQuery.refetch()
            void ordersQuery.refetch()
            void unitsQuery.refetch()
            void fleetQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const drains = drainsQuery.data ?? []
  const pumps = pumpsQuery.data ?? []
  const readiness = readinessQuery.data ?? []
  const programme = programmeQuery.data ?? null
  const allOrders = ordersQuery.data ?? []
  const allUnits = unitsQuery.data ?? []
  const fleet = fleetQuery.data ?? null

  if (drains.length === 0 && pumps.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={breadcrumbs} />
        <EmptyState title={t('No storm water network data available')} detail="No drain or pumping station records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const filteredDrains = drains.filter((d) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(d.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!d.name.toLowerCase().includes(q) && !wardName(d.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })

  /**
   * The network summary describes the reaches IN SCOPE, so it is computed after
   * the filter. Computed before, a ward selection left "Network length" and
   * "Reaches below target" reporting the corporation's whole drainage network
   * while the register beneath them showed one ward - and the readiness
   * statement above them counted pumping stations the operator had filtered
   * out. On a monsoon-preparedness screen that is not a cosmetic mismatch.
   */
  // --- Network summary --------------------------------------------------
  const scopedPumps = pumps.filter((p) => filters.wardIds.length === 0 || filters.wardIds.includes(p.wardId))
  const totalLengthKm = filteredDrains.reduce((s, d) => s + d.lengthKm, 0)
  const avgDesilting =
    filteredDrains.length > 0 ? filteredDrains.reduce((s, d) => s + d.desiltingCompletionPct, 0) / filteredDrains.length : 0
  const belowThreshold = filteredDrains.filter((d) => d.desiltingCompletionPct < DESILTING_OPERATIONAL_THRESHOLD)
  const totalEncroachment = filteredDrains.reduce((s, d) => s + d.encroachmentReports, 0)
  const pumpsBelowReadiness = scopedPumps.filter((p) => p.readinessIndex < PUMP_READINESS_THRESHOLD)

  const selectedDrain = drains.find((d) => d.id === selectedDrainId) ?? null

  // The order register answers to the same ward selection and search box the
  // drain register does; a filter that moved one and not the other would read
  // as the two disagreeing about the same reach.
  const filteredOrders = allOrders.filter((o) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(o.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (
        !o.drainName.toLowerCase().includes(q) &&
        !o.reference.toLowerCase().includes(q) &&
        !o.contractorName.toLowerCase().includes(q) &&
        !wardName(o.wardId).toLowerCase().includes(q)
      ) {
        return false
      }
    }
    return true
  })

  // --- Map layers ---------------------------------------------------------
  const drainRiskByWard = new Map<string, number[]>()
  for (const d of drains) {
    const list = drainRiskByWard.get(d.wardId) ?? []
    list.push(d.blockageRisk)
    drainRiskByWard.set(d.wardId, list)
  }
  const pumpReadinessByWard = new Map<string, number[]>()
  for (const p of pumps) {
    const list = pumpReadinessByWard.get(p.wardId) ?? []
    list.push(p.readinessIndex)
    pumpReadinessByWard.set(p.wardId, list)
  }
  const average = (values: number[] | undefined): number | undefined =>
    values && values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : undefined

  const wardMarkerIndex = new Map<string, number>()
  const pumpMarkers: MapMarker[] = pumps.map((p) => {
    const idx = wardMarkerIndex.get(p.wardId) ?? 0
    wardMarkerIndex.set(p.wardId, idx + 1)
    const point = jitteredWardPoint(p.wardId, idx)
    return {
      id: p.id,
      x: point.x,
      y: point.y,
      label: p.name,
      detail: `${p.pumpsOperational}/${p.pumpsTotal} pumps operational · Readiness ${p.readinessIndex}/100 · ${wardName(p.wardId)}`,
      kind: 'station',
      severity: p.readinessIndex < 60 ? 'critical' : p.readinessIndex < PUMP_READINESS_THRESHOLD ? 'high' : undefined,
    }
  })

  // --- Desilting progress by ward, ranked worst-first ----------------------
  const desiltingByWard = [...readiness]
    .sort((a, b) => a.desiltingPct - b.desiltingPct)
    .map((r) => ({ label: wardShortName(r.wardId), value: r.desiltingPct }))

  const drainColumns: Array<Column<StormWaterDrain>> = [
    {
      id: 'name',
      header: t('Drain / reach'),
      cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: '14rem',
    },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{DRAIN_TYPE_LABEL[r.type]}</Badge>, sortValue: (r) => r.type, hideBelow: 'md' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'length', header: t('Length'), cell: (r) => `${formatNumber(r.lengthKm, 1)} km`, sortValue: (r) => r.lengthKm, align: 'right', hideBelow: 'lg' },
    {
      id: 'desilting',
      header: t('Desilting %'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.desiltingCompletionPct} />
          <span className={cn('numeric w-9 text-right text-xs font-semibold', r.desiltingCompletionPct < DESILTING_OPERATIONAL_THRESHOLD ? 'text-crit-600' : 'text-ink-700')}>
            {formatNumber(r.desiltingCompletionPct, 0)}%
          </span>
        </div>
      ),
      sortValue: (r) => r.desiltingCompletionPct,
    },
    {
      id: 'blockage',
      header: t('Blockage risk'),
      cell: (r) => <Badge tone={toneForScore(r.blockageRisk, false)}>{r.blockageRisk}/100</Badge>,
      sortValue: (r) => r.blockageRisk,
    },
    { id: 'capacity', header: t('Capacity'), cell: (r) => `${formatNumber(r.capacityCumecs, 1)} cumecs`, sortValue: (r) => r.capacityCumecs, align: 'right', hideBelow: 'xl' },
    { id: 'encroachment', header: t('Encroachment reports'), cell: (r) => r.encroachmentReports, sortValue: (r) => r.encroachmentReports, align: 'right', hideBelow: 'lg' },
    { id: 'inspected', header: t('Last inspected'), cell: (r) => formatDate(r.lastInspectedAt), sortValue: (r) => r.lastInspectedAt, hideBelow: 'md' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const contractorColumns: Array<Column<DesiltingContractorPosition>> = [
    {
      id: 'contractor',
      header: t('Contractor'),
      cell: (r) => <span className="font-medium text-ink-900">{r.contractorName}</span>,
      sortValue: (r) => r.contractorName,
      searchValue: (r) => r.contractorName,
      width: '16rem',
    },
    { id: 'orders', header: t('Reaches'), cell: (r) => r.orders, sortValue: (r) => r.orders, align: 'right' },
    {
      id: 'completion',
      header: t('Completion'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.completionPct} />
          <span className="numeric w-9 text-right text-xs font-semibold text-ink-700">{formatNumber(r.completionPct, 0)}%</span>
        </div>
      ),
      sortValue: (r) => r.completionPct,
    },
    {
      id: 'unverified-share',
      header: t('Uncorroborated'),
      cell: (r) => <Badge tone={toneForScore(100 - r.unverifiedSharePct, true)}>{formatNumber(r.unverifiedSharePct, 0)}%</Badge>,
      sortValue: (r) => r.unverifiedSharePct,
    },
    {
      id: 'unverified-value',
      header: t('Value uncorroborated'),
      cell: (r) => <span className="numeric text-xs font-semibold text-ink-800">{t('₹{0} lakh', formatNumber(r.unverifiedValueLakh, 1))}</span>,
      sortValue: (r) => r.unverifiedValueLakh,
      align: 'right',
    },
    {
      id: 'disputed',
      header: t('Disputed'),
      cell: (r) => (r.disputedOrders > 0 ? <Badge tone="critical">{r.disputedOrders}</Badge> : <span className="text-ink-400">-</span>),
      sortValue: (r) => r.disputedOrders,
      align: 'right',
      hideBelow: 'md',
    },
  ]

  const filteredUnits = allUnits.filter((u) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(u.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (
        !u.stationName.toLowerCase().includes(q) &&
        !u.designation.toLowerCase().includes(q) &&
        !wardName(u.wardId).toLowerCase().includes(q)
      ) {
        return false
      }
    }
    return true
  })

  const unitColumns: Array<Column<PumpUnit>> = [
    {
      id: 'designation',
      header: t('Set'),
      cell: (r) => <span className="numeric text-xs font-semibold text-ink-900">{r.designation}</span>,
      sortValue: (r) => r.designation,
      searchValue: (r) => r.designation,
      width: '7rem',
    },
    {
      id: 'station',
      header: t('Pumping station'),
      cell: (r) => <span className="font-medium text-ink-900">{r.stationName}</span>,
      sortValue: (r) => r.stationName,
      searchValue: (r) => r.stationName,
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'status',
      header: t('Status'),
      cell: (r) => <Badge tone={PUMP_STATUS_TONE[r.status]}>{PUMP_STATUS_LABEL[r.status]}</Badge>,
      sortValue: (r) => r.status,
    },
    {
      id: 'capacity',
      header: t('Capacity'),
      cell: (r) => t('{0} l/s', formatNumber(r.capacityLps, 0)),
      sortValue: (r) => r.capacityLps,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'hours',
      header: t('Hours run (30d)'),
      cell: (r) => formatNumber(r.hoursRun30d),
      sortValue: (r) => r.hoursRun30d,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'telemetry',
      header: t('Reporting'),
      cell: (r) =>
        r.telemetry ? <Badge tone="positive">{t('Telemetry')}</Badge> : <Badge tone="warn">{t('Logged by hand')}</Badge>,
      sortValue: (r) => (r.telemetry ? 1 : 0),
      hideBelow: 'lg',
    },
    {
      id: 'fault',
      header: t('Last fault'),
      cell: (r) => (r.lastFaultAt ? formatDate(r.lastFaultAt) : <span className="text-ink-400">-</span>),
      sortValue: (r) => r.lastFaultAt ?? '',
      hideBelow: 'xl',
    },
  ]

  const orderColumns: Array<Column<DesiltingWorkOrder>> = [
    {
      id: 'reference',
      header: t('Order'),
      cell: (r) => <span className="numeric text-xs font-semibold text-ink-900">{r.reference}</span>,
      sortValue: (r) => r.reference,
      searchValue: (r) => r.reference,
      width: '9rem',
    },
    {
      id: 'reach',
      header: t('Reach'),
      cell: (r) => <span className="font-medium text-ink-900">{r.drainName}</span>,
      sortValue: (r) => r.drainName,
      searchValue: (r) => r.drainName,
      width: '15rem',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'contractor',
      header: t('Contractor'),
      cell: (r) => r.contractorName,
      sortValue: (r) => r.contractorName,
      searchValue: (r) => r.contractorName,
      hideBelow: 'lg',
    },
    {
      id: 'sanctioned',
      header: t('Sanctioned'),
      cell: (r) => t('{0} MT', formatNumber(r.sanctionedQuantumMt)),
      sortValue: (r) => r.sanctionedQuantumMt,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'removed',
      header: t('Recorded removed'),
      cell: (r) => t('{0} MT', formatNumber(r.removedQuantumMt)),
      sortValue: (r) => r.removedQuantumMt,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'completion',
      header: t('Completion'),
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={r.completionPct} />
          <span className={cn('numeric w-9 text-right text-xs font-semibold', r.completionPct < DESILTING_OPERATIONAL_THRESHOLD ? 'text-crit-600' : 'text-ink-700')}>
            {formatNumber(r.completionPct, 0)}%
          </span>
        </div>
      ),
      sortValue: (r) => r.completionPct,
    },
    {
      id: 'trips',
      header: t('Trips (verified / recorded)'),
      cell: (r) => (
        <span className="numeric text-xs font-semibold text-ink-800">
          {formatNumber(r.tripsVerified)} <span className="font-normal text-ink-400">/ {formatNumber(r.tripsRecorded)}</span>
        </span>
      ),
      sortValue: (r) => (r.tripsRecorded === 0 ? 0 : r.tripsVerified / r.tripsRecorded),
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'verification',
      header: t('Verification'),
      cell: (r) => <Badge tone={VERIFICATION_TONE[r.verification]}>{VERIFICATION_LABEL[r.verification]}</Badge>,
      sortValue: (r) => r.verification,
    },
    {
      id: 'unverified-value',
      header: t('Value uncorroborated'),
      cell: (r) =>
        r.unverifiedValueLakh > 0 ? (
          <span className="numeric text-xs font-semibold text-warn-700">{t('₹{0} lakh', formatNumber(r.unverifiedValueLakh, 1))}</span>
        ) : (
          <span className="text-ink-400">-</span>
        ),
      sortValue: (r) => r.unverifiedValueLakh,
      align: 'right',
      hideBelow: 'lg',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const pumpColumns: Array<Column<PumpingStation>> = [
    { id: 'name', header: t('Pumping station'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'pumps',
      header: t('Pumps (operational / installed)'),
      cell: (r) => (
        <span className="numeric text-xs font-semibold text-ink-800">
          {r.pumpsOperational} <span className="font-normal text-ink-400">/ {r.pumpsTotal}</span>
        </span>
      ),
      sortValue: (r) => r.pumpsOperational / r.pumpsTotal,
    },
    {
      id: 'standby',
      header: t('Standby power'),
      cell: (r) => (r.standbyPowerAvailable ? <Badge tone="positive">{t('Available')}</Badge> : <Badge tone="critical">{t('Not available')}</Badge>),
      sortValue: (r) => (r.standbyPowerAvailable ? 1 : 0),
    },
    {
      id: 'readiness',
      header: t('Readiness index'),
      cell: (r) => <Badge tone={toneForScore(r.readinessIndex, true)}>{r.readinessIndex}/100</Badge>,
      sortValue: (r) => r.readinessIndex,
    },
    { id: 'tested', header: t('Last tested'), cell: (r) => formatDate(r.lastTestedAt), sortValue: (r) => r.lastTestedAt, hideBelow: 'md' },
    { id: 'hours', header: t('Hours run (30d)'), cell: (r) => formatNumber(r.hoursRun30d), sortValue: (r) => r.hoursRun30d, align: 'right', hideBelow: 'lg' },
    { id: 'capacity', header: t('Capacity'), cell: (r) => `${formatNumber(r.capacityCumecs, 1)} cumecs`, sortValue: (r) => r.capacityCumecs, align: 'right', hideBelow: 'xl' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={breadcrumbs}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.monsoon} variant="outline" size="xs" icon={<Siren className="h-3.5 w-3.5" />}>
            {t('Open Monsoon Intelligence')}
          </LinkButton>
        }
        controls={<FilterBar show={['ward', 'search']} searchPlaceholder="Search drain, reach or ward" />}
      />

      <MetricGrid columns={5}>
        <MetricCard label={t('Network length')} value={formatNumber(totalLengthKm, 0)} unit="km" icon={<Waves className="h-4 w-4" />} support={t('{0} mapped reaches', filteredDrains.length)} />
        <MetricCard
          label={t('Desilting completion')}
          value={formatPercent(avgDesilting, 0)}
          support={t('Against {0}% pre-monsoon target', PRE_MONSOON_DESILTING_TARGET)}
          tone={avgDesilting < DESILTING_OPERATIONAL_THRESHOLD ? 'warn' : 'positive'}
          progress={{ value: avgDesilting, max: 100 }}
        />
        <MetricCard label={t('Reaches below target')} value={belowThreshold.length} support={t('of {0}, below {1}% threshold', filteredDrains.length, DESILTING_OPERATIONAL_THRESHOLD)} tone={belowThreshold.length > 0 ? 'critical' : 'default'} />
        <MetricCard label={t('Encroachment reports')} value={totalEncroachment} support={t('Recorded against mapped reaches')} tone={totalEncroachment > 0 ? 'warn' : 'default'} icon={<Droplets className="h-4 w-4" />} />
        <MetricCard label={t('Pumps below readiness')} value={pumpsBelowReadiness.length} support={t('of {0}, below {1}% threshold', scopedPumps.length, PUMP_READINESS_THRESHOLD)} tone={pumpsBelowReadiness.length > 0 ? 'critical' : 'default'} icon={<Gauge className="h-4 w-4" />} />
      </MetricGrid>

      {/* Two columns, read downward. The registers the department is held to
          — reaches, the works programme behind them, the dewatering fleet and
          pumping station readiness — carry the width. The readiness
          implication, the drivers behind the selected reach, the network map
          and ward desilting progress read down the column beside. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <Card flush>
            <CardHeader className="px-4 pt-4 pb-3" title={t('Storm water drain register')} description={t('Sortable, searchable by reach or ward. Select a reach to inspect its published risk drivers.')} />
            {filteredDrains.length === 0 ? (
              <EmptyState className="m-4" title={t('No reaches match the current filters')} detail="Adjust the ward or search term above." />
            ) : (
              <DataTable
                rows={filteredDrains}
                columns={drainColumns}
                rowKey={(r) => r.id}
                pageSize={10}
                searchable={false}
                onRowClick={(r) => setSelectedDrainId(r.id === selectedDrainId ? null : r.id)}
                activeRowKey={selectedDrainId ?? undefined}
                initialSort={{ columnId: 'blockage', direction: 'desc' }}
                ariaLabel="Storm water drain register"
              />
            )}
          </Card>

        {/* ------------------------------------------------------------------
            The pre-monsoon works programme.
            The register above answers how much desilting is done. This answers
            the second question, which is the one an audit asks: who was to do
            it, and can the corporation show that what was recorded as done was
            actually done. Completion and corroboration are carried separately
            because they are separately true.
           ------------------------------------------------------------------ */}
        {programme && programme.ordersTotal > 0 ? (
          <>
            <Card
              tone={programme.verifiedSharePct < VERIFICATION_EXPECTATION_PCT || programme.disputedOrders > 0 ? 'warn' : 'positive'}
              className="flex items-start gap-3"
            >
              <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-ink-900">
                  {t('{0} works programme - accountability position', programme.cycleLabel)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  {programme.daysToDeadline < 0
                    ? t(
                        'The cycle closed {0} day(s) ago on {1}. {2}% of the sanctioned quantum is recorded as removed across {3} reach(es), and {4}% of what was recorded can be corroborated by something other than the contractor’s own record. That leaves ₹{5} lakh of recorded work uncorroborated, and {6} order(s) contested.',
                        Math.abs(programme.daysToDeadline),
                        formatDate(programme.deadlineAt),
                        formatNumber(programme.completionPct, 0),
                        programme.ordersTotal,
                        formatNumber(programme.verifiedSharePct, 0),
                        formatNumber(programme.unverifiedValueLakh, 1),
                        programme.disputedOrders,
                      )
                    : t(
                        '{0} day(s) remain to the {1} deadline. {2}% of the sanctioned quantum is recorded as removed across {3} reach(es), and {4}% of what was recorded can be corroborated by something other than the contractor’s own record. ₹{5} lakh of recorded work is uncorroborated, and {6} order(s) are contested.',
                        programme.daysToDeadline,
                        formatDate(programme.deadlineAt),
                        formatNumber(programme.completionPct, 0),
                        programme.ordersTotal,
                        formatNumber(programme.verifiedSharePct, 0),
                        formatNumber(programme.unverifiedValueLakh, 1),
                        programme.disputedOrders,
                      )}
                </p>
                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t(
                    'Corroboration is a measurement, not a decision. Nothing here closes an order or releases a payment - a named officer does that, on the evidence shown.',
                  )}
                </p>
              </div>
            </Card>

            <MetricGrid columns={5}>
              <MetricCard
                label={t('Sanctioned quantum')}
                value={formatNumber(programme.sanctionedQuantumMt)}
                unit="MT"
                support={t('Across {0} reach(es) in the programme', programme.ordersTotal)}
              />
              <MetricCard
                label={t('Recorded removed')}
                value={formatNumber(programme.removedQuantumMt)}
                unit="MT"
                support={t('{0}% of sanctioned', formatNumber(programme.completionPct, 0))}
                progress={{ value: programme.completionPct, max: 100 }}
                tone={programme.completionPct < PRE_MONSOON_DESILTING_TARGET ? 'warn' : 'positive'}
              />
              <MetricCard
                label={t('Corroborated')}
                value={formatPercent(programme.verifiedSharePct, 0)}
                support={t('{0} MT of what was recorded', formatNumber(programme.verifiedQuantumMt))}
                tone={programme.verifiedSharePct < VERIFICATION_EXPECTATION_PCT ? 'critical' : 'positive'}
                progress={{ value: programme.verifiedSharePct, max: 100 }}
                icon={<ScanSearch className="h-4 w-4" />}
              />
              <MetricCard
                label={t('Value uncorroborated')}
                value={formatNumber(programme.unverifiedValueLakh, 1)}
                unit={t('₹ lakh')}
                support={t('of ₹{0} lakh recorded', formatNumber(programme.valueLakh, 1))}
                tone={programme.unverifiedValueLakh > 0 ? 'warn' : 'positive'}
              />
              <MetricCard
                label={t('Contested orders')}
                value={programme.disputedOrders}
                support={t('{0} order(s) below the 100% target', programme.ordersBelowTarget)}
                tone={programme.disputedOrders > 0 ? 'critical' : 'default'}
              />
            </MetricGrid>

            <Card flush>
              <CardHeader
                className="px-4 pt-4 pb-3"
                title={t('Contractor position on the works programme')}
                description={t('Every contractor holding a reach this cycle, heaviest uncorroborated value first. This is the same delivery record Contractor Intelligence reads.')}
              />
              <DataTable
                rows={programme.byContractor}
                columns={contractorColumns}
                rowKey={(r) => r.contractorId}
                pageSize={8}
                searchPlaceholder="Search contractor"
                initialSort={{ columnId: 'unverified-value', direction: 'desc' }}
                ariaLabel="Contractor position on the desilting works programme"
              />
            </Card>

            <Card flush>
              <CardHeader
                className="px-4 pt-4 pb-3"
                title={t('Desilting work order register')}
                description={t('One order per reach in the programme, with the quantum recorded against it and how that record was checked.')}
              />
              {filteredOrders.length === 0 ? (
                <EmptyState className="m-4" title={t('No work orders match the current filters')} detail="Adjust the ward or search term above." />
              ) : (
                <DataTable
                  rows={filteredOrders}
                  columns={orderColumns}
                  rowKey={(r) => r.id}
                  pageSize={10}
                  searchPlaceholder="Search order, reach or contractor"
                  initialSort={{ columnId: 'unverified-value', direction: 'desc' }}
                  ariaLabel="Desilting work order register"
                />
              )}
            </Card>
          </>
        ) : null}

        {/* ------------------------------------------------------------------
            The dewatering fleet, set by set.
            The station register below answers how many pumps a location has and
            how many work. This answers which one is down - which is what the
            control room needs when a subway floods.
           ------------------------------------------------------------------ */}
        {fleet && fleet.unitsTotal > 0 ? (
          <>
            <MetricGrid columns={5}>
              <MetricCard
                label={t('Dewatering sets')}
                value={fleet.unitsTotal}
                support={t('{0} running, {1} on standby', fleet.running, fleet.standby)}
                icon={<Gauge className="h-4 w-4" />}
              />
              <MetricCard
                label={t('Fleet availability')}
                value={formatPercent(fleet.availabilityPct, 0)}
                support={t('{0} in fault, {1} under maintenance', fleet.fault, fleet.maintenance)}
                tone={fleet.availabilityPct < 85 ? 'warn' : 'positive'}
                progress={{ value: fleet.availabilityPct, max: 100 }}
              />
              <MetricCard
                label={t('Available discharge')}
                value={formatNumber(fleet.availableCapacityLps)}
                unit={t('l/s')}
                support={t('of {0} l/s installed', formatNumber(fleet.installedCapacityLps))}
              />
              <MetricCard
                label={t('Sets reporting telemetry')}
                value={formatPercent(fleet.telemetrySharePct, 0)}
                support={t('{0} of {1} sets report their own state', fleet.telemetryUnits, fleet.unitsTotal)}
                tone={fleet.telemetrySharePct < 50 ? 'warn' : 'positive'}
              />
              <MetricCard
                label={t('Stations with no working set')}
                value={fleet.stationsWithNoWorkingUnit}
                support={t('Every set at these locations is unavailable')}
                tone={fleet.stationsWithNoWorkingUnit > 0 ? 'critical' : 'default'}
              />
            </MetricGrid>

            <Card flush>
              <CardHeader
                className="px-4 pt-4 pb-3"
                title={t('Dewatering set register')}
                description={t('Every set in the fleet with its current state, duty over the last 30 days and whether it reports that state itself or is logged by hand at the site.')}
              />
              {filteredUnits.length === 0 ? (
                <EmptyState className="m-4" title={t('No dewatering sets match the current filters')} detail="Adjust the ward or search term above." />
              ) : (
                <DataTable
                  rows={filteredUnits}
                  columns={unitColumns}
                  rowKey={(r) => r.id}
                  pageSize={10}
                  searchPlaceholder="Search set, station or ward"
                  initialSort={{ columnId: 'status', direction: 'asc' }}
                  ariaLabel="Dewatering set register"
                />
              )}
            </Card>
          </>
        ) : null}

        <Card flush>
          <CardHeader className="px-4 pt-4 pb-3" title={t('Pumping station readiness register')} description={t('Pump availability, standby power and duty cycle over the last 30 days.')} />
          <DataTable
            rows={pumps}
            columns={pumpColumns}
            rowKey={(r) => r.id}
            pageSize={10}
            searchPlaceholder="Search pumping station or ward"
            initialSort={{ columnId: 'readiness', direction: 'asc' }}
            ariaLabel="Pumping station readiness register"
          />
        </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <Card tone={belowThreshold.length > 0 || pumpsBelowReadiness.length > 0 ? 'warn' : 'positive'} className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-ink-900">{t('Pre-monsoon readiness implication')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              {t('{0} of {1} drainage reaches remain below the {2}% desilting operational threshold against the {3}% pre-monsoon target, and {4} of {5} pumping stations report readiness below the {6}% operational threshold. Effective discharge capacity at these reaches is constrained accordingly whenever rainfall intensity rises - this is a statement of current network condition, not a forecast of any specific rainfall event.', belowThreshold.length, filteredDrains.length, DESILTING_OPERATIONAL_THRESHOLD, PRE_MONSOON_DESILTING_TARGET, pumpsBelowReadiness.length, scopedPumps.length, PUMP_READINESS_THRESHOLD)}
            </p>
          </div>
        </Card>

          <Card className="min-w-0">
            <CardHeader title={t('Risk driver breakdown')} description={t('Published, weighted contribution to the selected reach\'s blockage-risk score.')} />
            {selectedDrain ? (
              <div className="mt-3">
                <p className="text-[0.8125rem] font-semibold text-ink-900">{selectedDrain.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {wardName(selectedDrain.wardId)} · {DRAIN_TYPE_LABEL[selectedDrain.type]}
                </p>
                <div className="mt-3">
                  <ContributionBars items={selectedDrain.riskDrivers} />
                </div>
              </div>
            ) : (
              <EmptyState compact className="mt-3" title={t('No reach selected')} detail="Select a row in the drain register to inspect its risk drivers." />
            )}
          </Card>


        <Card>
          <CardHeader title={t('Network map')} description={t('Drain-risk and pumping-station-readiness layers, with pumping station markers. Switch layers with the control above the map.')} />
          <div className="mt-3">
            <CityMap
              layers={[
                {
                  id: 'drain-risk',
                  label: t('Drain Blockage Risk'),
                  valueFor: (wardId) => average(drainRiskByWard.get(wardId)),
                  higherIsWorse: true,
                  unit: '/100 blockage risk',
                  description: t('Average blockage-risk score of drains mapped in the ward.'),
                },
                {
                  id: 'pump-readiness',
                  label: t('Pumping Station Readiness'),
                  valueFor: (wardId) => average(pumpReadinessByWard.get(wardId)),
                  higherIsWorse: false,
                  unit: '/100 readiness index',
                  description: t('Average readiness index of pumping stations located in the ward.'),
                },
              ]}
              markers={pumpMarkers}
              height={400}
            />
          </div>
        </Card>

        <Card>
          <ChartFrame
            title={t('Desilting progress by ward')}
            unit={t('% completion')}
            timeframe="Current pre-monsoon cycle"
            description={t('Every ward ranked from lowest to highest desilting completion against the 100% pre-monsoon target.')}
            height={Math.max(340, desiltingByWard.length * 15)}
            footnote={t('{0} reach(es) across {1} ward(s) remain below the {2}% operational threshold used departmentally to trigger priority attention.', belowThreshold.length, new Set(belowThreshold.map((d) => d.wardId)).size, DESILTING_OPERATIONAL_THRESHOLD)}
          >
            <CategoryBarChart
              data={desiltingByWard}
              categoryKey="label"
              layout="horizontal"
              series={[{ key: 'value', label: t('Desilting %'), colour: CHART_COLOURS.primary }]}
              referenceValue={PRE_MONSOON_DESILTING_TARGET}
              referenceLabel="100% target"
            />
          </ChartFrame>
        </Card>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default StormWaterIntelligencePage
