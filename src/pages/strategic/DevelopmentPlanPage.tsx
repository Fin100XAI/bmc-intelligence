import { useMemo, useState } from 'react'
import { LandPlot, Landmark, MapPinned, Ruler } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { developmentPlanService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName } from '@/data/reference'
import { activeCorporation } from '@/config/municipality.config'
import {
  DP_ZONE_TYPE_LABEL,
  RESERVATION_STATUS_LABEL,
  RESERVATION_TYPE_LABEL,
  type DPReservation,
  type DevelopmentPlanZone,
  type ReservationStatus,
  type ReservationType,
} from '@/types/development-plan'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/strategic/DevelopmentPlanPage.tsx
 *
 * The Development Plan's sanctioned ground truth. Urban Planning Intelligence
 * is explicit that its adequacy model runs on ward-level proxies because no
 * parcel-level land-use layer is integrated into the platform; this page is
 * that layer's register, not its replacement - zoning, FSI/TDR position and
 * reservation status, without the composite scenario engine.
 */

const RESERVATION_STATUSES: ReservationStatus[] = [
  'reserved-undeveloped', 'land-acquisition-in-progress', 'title-transferred', 'developed', 'reservation-lifted',
]
const RESERVATION_TYPES: ReservationType[] = [
  'garden', 'school', 'hospital', 'road-widening', 'market', 'affordable-housing', 'parking-lot', 'fire-station',
]

const RESERVATION_STATUS_TONE: Record<ReservationStatus, BadgeTone> = {
  'reserved-undeveloped': 'warn',
  'land-acquisition-in-progress': 'info',
  'title-transferred': 'positive',
  developed: 'positive',
  'reservation-lifted': 'neutral',
}

export function DevelopmentPlanPage(): React.JSX.Element {
  const [reservationTypeFilter, setReservationTypeFilter] = useState<ReservationType | ''>('')
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('')

  usePageMasthead(t('Development Plan 2034'))

  const positionQuery = useServiceQuery(queryKeys.developmentPlan('position'), (u) => developmentPlanService.position(u))
  const zonesQuery = useServiceQuery(queryKeys.developmentPlan('zones'), (u) => developmentPlanService.zones(u))
  const reservationsQuery = useServiceQuery(queryKeys.developmentPlan('reservations'), (u) => developmentPlanService.reservations(u))

  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data])
  const reservations = useMemo(() => reservationsQuery.data ?? [], [reservationsQuery.data])

  const filteredReservations = useMemo(
    () =>
      reservations.filter((r) => {
        if (reservationTypeFilter && r.reservationType !== reservationTypeFilter) return false
        if (statusFilter && r.status !== statusFilter) return false
        return true
      }),
    [reservations, reservationTypeFilter, statusFilter],
  )

  const loading = positionQuery.isLoading || zonesQuery.isLoading || reservationsQuery.isLoading
  const anyError = positionQuery.error ?? zonesQuery.error ?? reservationsQuery.error

  if (loading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Planning & Development')} breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Development Plan 2034') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (anyError) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Planning & Development')} breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Development Plan 2034') }]} />
        <ErrorState
          detail={anyError.message}
          onRetry={() => {
            void positionQuery.refetch()
            void zonesQuery.refetch()
            void reservationsQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const position = positionQuery.data
  const isBmc = activeCorporation.id === 'bmc'

  const zoneColumns: Array<Column<DevelopmentPlanZone>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (z) => <span className="font-medium text-ink-900">{wardName(z.wardId)}</span>,
      sortValue: (z) => wardName(z.wardId),
      searchValue: (z) => wardName(z.wardId),
      width: 'minmax(12rem,1.6fr)',
    },
    {
      id: 'zoneType',
      header: t('Dominant zone'),
      cell: (z) => <Badge tone="neutral" size="sm">{DP_ZONE_TYPE_LABEL[z.zoneType]}</Badge>,
      sortValue: (z) => z.zoneType,
    },
    {
      id: 'area',
      header: t('Area'),
      cell: (z) => <span className="numeric text-ink-700">{formatNumber(z.areaHectares, 1)} ha</span>,
      sortValue: (z) => z.areaHectares,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'fsi',
      header: t('FSI - sanctioned / utilised'),
      cell: (z) => (
        <span className="numeric text-ink-700">
          {formatNumber(z.sanctionedFSI, 2)} <span className="text-ink-400">/</span> {formatNumber(z.avgUtilisedFSI, 2)}
        </span>
      ),
      sortValue: (z) => (z.sanctionedFSI > 0 ? z.avgUtilisedFSI / z.sanctionedFSI : 0),
      align: 'right',
    },
    {
      id: 'tdr',
      header: t('TDR generated / utilised'),
      cell: (z) => (
        <span className="numeric text-ink-700">
          {formatNumber(z.tdrGeneratedSqm)} <span className="text-ink-400">/</span> {formatNumber(z.tdrUtilisedSqm)} {t('sq. m')}
        </span>
      ),
      sortValue: (z) => z.tdrGeneratedSqm,
      align: 'right',
      hideBelow: 'xl',
    },
  ]

  const reservationColumns: Array<Column<DPReservation>> = [
    {
      id: 'ward',
      header: t('Ward'),
      cell: (r) => wardName(r.wardId),
      sortValue: (r) => wardName(r.wardId),
      hideBelow: 'md',
    },
    {
      id: 'type',
      header: t('Reservation'),
      cell: (r) => <Badge tone="neutral" size="sm">{RESERVATION_TYPE_LABEL[r.reservationType]}</Badge>,
      sortValue: (r) => r.reservationType,
    },
    {
      id: 'area',
      header: t('Area'),
      cell: (r) => <span className="numeric text-ink-700">{formatNumber(r.areaSqm)} {t('sq. m')}</span>,
      sortValue: (r) => r.areaSqm,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'owner',
      header: t('Land held by'),
      cell: (r) => <span className="text-ink-700 capitalize">{r.ownerType}</span>,
      sortValue: (r) => r.ownerType,
      hideBelow: 'xl',
    },
    {
      id: 'reserved',
      header: t('Reserved since'),
      cell: (r) => formatDate(r.reservedAt),
      sortValue: (r) => r.reservedAt,
      hideBelow: 'lg',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (r) => <Badge tone={RESERVATION_STATUS_TONE[r.status]} size="sm">{RESERVATION_STATUS_LABEL[r.status]}</Badge>,
      sortValue: (r) => r.status,
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Planning & Development')}
        breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Development Plan 2034') }]}
        hideProvenance
      />

      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('The layer Urban Planning Intelligence runs a proxy in place of')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {isBmc
              ? t('Brihanmumbai’s Development Plan 2034 was sanctioned by the state government on 8 May 2018, together with its companion Development Control and Promotion Regulations, which came into force that September - the DP is the spatial zoning blueprint, the DCPR the rulebook for what may be built in each zone. A reservation bars construction until the Corporation acquires or develops the land; reported figures put roughly half of the Corporation’s own already-acquired reservation properties still without a transferred title, years after acquisition - the single most consequential fact this register carries.', formatDate(position?.planSanctionedAt ?? ''))
              : t('A sanctioned Development Plan governs zoning and reservations for this corporation as it does for every corporation in Maharashtra. This demonstration environment does not hold this corporation’s own sanction date, so the figure below is a modelled placeholder rather than a researched one.')}
          </p>
        </div>
      </Card>

      <MetricGrid columns={5}>
        <MetricCard
          label={t('Plan sanctioned')}
          value={position ? formatDate(position.planSanctionedAt) : '-'}
          icon={<Landmark className="h-4 w-4" />}
          background="red"
          footer={
            isBmc && activeCorporation.dp2034SanctionYear ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('Sanctioned by State Government notification in {0}; Development Plan 2034 and its Development Control and Promotion Regulations came fully into force from 13 November 2019.', activeCorporation.dp2034SanctionYear)}
              </span>
            ) : undefined
          }
        />
        <MetricCard label={t('Wards zoned')} value={position?.zonesMapped ?? 0} icon={<MapPinned className="h-4 w-4" />} background="amber" />
        <MetricCard label={t('Reservations on record')} value={position?.reservationsTotal ?? 0} icon={<LandPlot className="h-4 w-4" />} background="green" />
        <MetricCard
          label={t('Reservations undeveloped')}
          value={position?.reservationsUndeveloped ?? 0}
          icon={<LandPlot className="h-4 w-4" />}
          tone={position && position.reservationsUndeveloped > 0 ? 'warn' : 'default'}
        />
        <MetricCard
          label={t('Acquired without title transfer')}
          value={position?.titleBacklogPct ?? 0}
          unit="%"
          icon={<Ruler className="h-4 w-4" />}
          tone={position && position.titleBacklogPct > 30 ? 'critical' : position && position.titleBacklogPct > 10 ? 'warn' : 'default'}
        />
      </MetricGrid>

      <GovPanel title={t('Ward zoning register')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Dominant sanctioned land-use zone per ward, with the FSI and TDR position.')}
        </p>
        {zones.length === 0 ? (
          <EmptyState title={t('No zoning data on record')} />
        ) : (
          <DataTable rows={zones} columns={zoneColumns} rowKey={(z) => z.wardId} pageSize={12} />
        )}
      </GovPanel>

      <GovPanel title={t('Reservation register')} tone="red" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Land earmarked for a public purpose - construction is barred until the Corporation acquires or develops it, or the reservation is lifted.')}
        </p>
        <div className="flex flex-wrap items-end gap-2 border-b border-ink-100 px-3 py-2.5">
          <div>
            <Label htmlFor="reservation-type-filter">{t('Reservation')}</Label>
            <Select
              id="reservation-type-filter"
              value={reservationTypeFilter}
              onChange={(e) => setReservationTypeFilter(e.target.value as ReservationType | '')}
              options={[
                { value: '', label: t('All reservations') },
                ...RESERVATION_TYPES.map((rt) => ({ value: rt, label: RESERVATION_TYPE_LABEL[rt] })),
              ]}
            />
          </div>
          <div>
            <Label htmlFor="reservation-status-filter">{t('Status')}</Label>
            <Select
              id="reservation-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ReservationStatus | '')}
              options={[
                { value: '', label: t('All statuses') },
                ...RESERVATION_STATUSES.map((s) => ({ value: s, label: RESERVATION_STATUS_LABEL[s] })),
              ]}
            />
          </div>
        </div>
        {filteredReservations.length === 0 ? (
          <EmptyState title={t('No reservations match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filteredReservations} columns={reservationColumns} rowKey={(r) => r.id} pageSize={15} />
        )}
      </GovPanel>
    </PageBody>
  )
}

export default DevelopmentPlanPage
