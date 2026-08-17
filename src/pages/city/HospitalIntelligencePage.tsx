import { useState } from 'react'
import { Building2, HeartPulse } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  MetricGrid,
  Select,
  StateBadge,
  toneForScore,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { ChartFrame, MiniBar, RankedBarChart } from '@/components/charts'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService } from '@/services/health.service'
import { useFilterStore } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { WARDS, WARD_BY_ID, wardName } from '@/data/reference'
import type { Hospital } from '@/types/city-domains'
import { formatCompact, formatPercent } from '@/utils/format'
import { greatCircleKm } from '@/utils/geo'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Hospital capacity, condition and accessibility intelligence.
 *
 * No patient record of any kind is modelled anywhere in this platform - this
 * screen renders only facility-level aggregate operational figures (beds,
 * staffing, equipment, accessibility).
 */

function build$HOSPITAL_TYPE_LABEL(): Record<Hospital['type'], string> {
  return {
  major: t('Major'),
  peripheral: t('Peripheral'),
  speciality: t('Speciality'),
  maternity: t('Maternity'),
  dispensary: t('Dispensary'),
}
}
let HOSPITAL_TYPE_LABEL: Record<Hospital['type'], string> = build$HOSPITAL_TYPE_LABEL()
registerLayer(() => {
  HOSPITAL_TYPE_LABEL = build$HOSPITAL_TYPE_LABEL()
})
const HOSPITAL_TYPES = Object.keys(HOSPITAL_TYPE_LABEL) as Array<Hospital['type']>

const SURGE_OCCUPANCY_THRESHOLD = 90
const SURGE_LOAD_INDEX_THRESHOLD = 85
const LOW_ACCESSIBILITY_THRESHOLD = 70

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

export function HospitalIntelligencePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)
  const corporation = useActiveCorporation()
  const [typeFilter, setTypeFilter] = useState<'all' | Hospital['type']>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  usePageMasthead(t('Hospital Intelligence'))

  const hospitalsQuery = useServiceQuery(queryKeys.health('hospitals-all'), (u) => healthService.hospitals(u))

  if (hospitalsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Hospital Intelligence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (hospitalsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Hospital Intelligence') }]} />
        <ErrorState detail={hospitalsQuery.error.message} onRetry={() => hospitalsQuery.refetch()} />
      </PageBody>
    )
  }

  const hospitals = hospitalsQuery.data ?? []
  if (hospitals.length === 0) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Hospital Intelligence') }]} />
        <EmptyState title={t('No facilities available')} detail="No hospital records were returned for the current scope." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const filtered = hospitals.filter((h) => {
    if (typeFilter !== 'all' && h.type !== typeFilter) return false
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(h.wardId)) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (!h.name.toLowerCase().includes(q) && !wardName(h.wardId).toLowerCase().includes(q)) return false
    }
    return true
  })

  /**
   * Capacity within the current scope, not across the corporation. These read
   * `hospitals` before: narrowing to a ward emptied the facility table and the
   * map while the bed, ICU and headroom tiles above them went on reporting
   * every facility in the city - so the screen said "Ward 3" and showed the
   * corporation's capacity underneath it.
   */
  const totalBeds = filtered.reduce((s, h) => s + h.bedsTotal, 0)
  const occupiedBeds = filtered.reduce((s, h) => s + h.bedsOccupied, 0)
  const occupancyPct = totalBeds > 0 ? round1((occupiedBeds / totalBeds) * 100) : 0
  const icuTotal = filtered.reduce((s, h) => s + h.icuTotal, 0)
  const icuOccupied = filtered.reduce((s, h) => s + h.icuOccupied, 0)
  const icuOccupancyPct = icuTotal > 0 ? round1((icuOccupied / icuTotal) * 100) : 0
  const headroom = icuTotal - icuOccupied
  const headroomPct = icuTotal > 0 ? round1((headroom / icuTotal) * 100) : 0

  const surging = [...filtered]
    .filter((h) => h.occupancyPct >= SURGE_OCCUPANCY_THRESHOLD || h.emergencyLoadIndex >= SURGE_LOAD_INDEX_THRESHOLD)
    .sort((a, b) => b.occupancyPct - a.occupancyPct)

  // Resolved within the current scope first. Falling straight through to
  // `hospitals[0]` would open the facility panel on a hospital in a different
  // ward from the one the operator has selected.
  const selected =
    filtered.find((h) => h.id === selectedId) ?? surging[0] ?? filtered[0] ?? hospitals.find((h) => h.id === selectedId) ?? null

  // Deliberately over the FULL register: this section compares flood-exposed
  // wards against the rest of the corporation, and is labelled as city-wide.
  // Narrowing it to one ward would leave it comparing a ward with itself.
  const floodWardIds = new Set(WARDS.filter((w) => w.floodProne).map((w) => w.id))
  const inFloodWards = hospitals.filter((h) => floodWardIds.has(h.wardId))
  const notInFloodWards = hospitals.filter((h) => !floodWardIds.has(h.wardId))
  const avgAccessFlood = inFloodWards.length > 0 ? round1(inFloodWards.reduce((s, h) => s + h.accessibilityIndex, 0) / inFloodWards.length) : 0
  const avgAccessOther = notInFloodWards.length > 0 ? round1(notInFloodWards.reduce((s, h) => s + h.accessibilityIndex, 0) / notInFloodWards.length) : 0
  const lowAccessFlood = inFloodWards.filter((h) => h.accessibilityIndex < LOW_ACCESSIBILITY_THRESHOLD).sort((a, b) => a.accessibilityIndex - b.accessibilityIndex)

  /**
   * The facility serving a ward that holds none of its own, and how far away it
   * is. Straight-line between ward centroids - enough to name the facility
   * honestly, and never presented as a routed travel distance.
   */
  const isBmc = corporation.id === 'bmc'

  const nearestFacility = ((): { wardId: string; hospital: Hospital; km: number } | null => {
    if (filtered.length > 0) return null
    if (filters.wardIds.length !== 1) return null
    const wardId = filters.wardIds[0] as string
    const ward = WARD_BY_ID.get(wardId)
    if (!ward || hospitals.length === 0) return null
    let best: { hospital: Hospital; km: number } | null = null
    for (const hospital of hospitals) {
      const km = greatCircleKm(ward.centroid, hospital.location)
      if (!best || km < best.km) best = { hospital, km }
    }
    return best ? { wardId, hospital: best.hospital, km: best.km } : null
  })()

  // Map-layer context, deliberately over the full register: blanking every
  // ward but the selected one removes what makes the selection legible.
  const bedsByWard = new Map<string, number>()
  for (const h of hospitals) bedsByWard.set(h.wardId, (bedsByWard.get(h.wardId) ?? 0) + h.bedsTotal)

  const wardMarkerIndex = new Map<string, number>()
  const markers: MapMarker[] = filtered.map((h) => {
    const idx = wardMarkerIndex.get(h.wardId) ?? 0
    wardMarkerIndex.set(h.wardId, idx + 1)
    const point = jitteredWardPoint(h.wardId, idx)
    return {
      id: h.id,
      x: point.x,
      y: point.y,
      label: h.name,
      detail: t('{0} · {1}/{2} beds · {3}', HOSPITAL_TYPE_LABEL[h.type], h.bedsOccupied, h.bedsTotal, wardName(h.wardId)),
      kind: 'hospital',
      onClick: () => setSelectedId(h.id),
    }
  })

  const columns: Array<Column<Hospital>> = [
    { id: 'name', header: t('Facility'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{HOSPITAL_TYPE_LABEL[r.type]}</Badge>, sortValue: (r) => r.type, hideBelow: 'md' },
    { id: 'ward', header: t('Ward'), cell: (r) => wardName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    {
      id: 'beds',
      header: t('Beds (occ. / total)'),
      cell: (r) => (
        <div className="min-w-[6.5rem]">
          <div className="numeric flex items-baseline gap-1 text-xs">
            <span className="font-semibold text-ink-800">{r.bedsOccupied}</span>
            <span className="text-ink-400">/ {r.bedsTotal}</span>
          </div>
          <MiniBar value={r.occupancyPct} width={76} className="mt-0.5" />
        </div>
      ),
      sortValue: (r) => r.occupancyPct,
    },
    { id: 'icu', header: t('ICU (occ. / total)'), cell: (r) => `${r.icuOccupied} / ${r.icuTotal}`, sortValue: (r) => (r.icuTotal > 0 ? r.icuOccupied / r.icuTotal : 0), hideBelow: 'lg', align: 'right' },
    {
      id: 'load',
      header: t('Emergency load'),
      cell: (r) => <Badge tone={toneForScore(r.emergencyLoadIndex, false)}>{r.emergencyLoadIndex}</Badge>,
      sortValue: (r) => r.emergencyLoadIndex,
    },
    { id: 'staffing', header: t('Staffing'), cell: (r) => formatPercent(r.staffingPct), sortValue: (r) => r.staffingPct, align: 'right', hideBelow: 'lg' },
    { id: 'equipment', header: t('Equipment serviceable'), cell: (r) => formatPercent(r.equipmentServiceablePct), sortValue: (r) => r.equipmentServiceablePct, align: 'right', hideBelow: 'xl' },
    { id: 'access', header: t('Accessibility'), cell: (r) => <Badge tone={toneForScore(r.accessibilityIndex, true)}>{r.accessibilityIndex}</Badge>, sortValue: (r) => r.accessibilityIndex, hideBelow: 'md' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Hospital Intelligence') }]}
      />

      <MetricGrid columns={6}>
        <MetricCard
          label={t('Functional beds')}
          value={formatCompact(totalBeds)}
          support={`${filtered.length} facilities`}
          icon={<Building2 className="h-4 w-4" />}
          background="red"
          footer={
            isBmc && corporation.majorHospitalsCount ? (
              <span className="text-[0.625rem] leading-snug text-ink-400">
                {t('For context: BMC\'s own facility network runs {0} specialised major hospitals (including four medical colleges), {1} health posts, {2} dispensaries and {3} maternity homes.', corporation.majorHospitalsCount, corporation.healthPostsCount ?? '-', corporation.dispensariesCount ?? '-', corporation.maternityHomesCount ?? '-')}
              </span>
            ) : undefined
          }
        />
        <MetricCard label={t('Occupied beds')} value={formatCompact(occupiedBeds)} support={formatPercent(occupancyPct)} tone={occupancyPct >= SURGE_OCCUPANCY_THRESHOLD ? 'critical' : occupancyPct >= 80 ? 'warn' : 'default'} background="amber" />
        <MetricCard label={t('Bed occupancy')} value={formatPercent(occupancyPct)} tone={occupancyPct >= SURGE_OCCUPANCY_THRESHOLD ? 'critical' : occupancyPct >= 80 ? 'warn' : 'default'} background="green" />
        <MetricCard label={t('ICU occupancy')} value={formatPercent(icuOccupancyPct)} support={t('{0} of {1} beds', icuOccupied, icuTotal)} tone={icuOccupancyPct >= 92 ? 'critical' : icuOccupancyPct >= 80 ? 'warn' : 'default'} />
        <MetricCard label={t('Critical care headroom')} value={headroom} unit={t('ICU beds')} support={t('{0} of ICU capacity', formatPercent(headroomPct))} tone={headroomPct < 10 ? 'critical' : headroomPct < 20 ? 'warn' : 'positive'} icon={<HeartPulse className="h-4 w-4" />} />
        <MetricCard
          label={t('Major hospitals')}
          value={hospitals.filter((h) => h.type === 'major').length}
          support={t('BMC-run general & specialised hospitals')}
          footer={<span className="text-[0.625rem] leading-snug text-ink-400">{t("BMC's Public Health Department reports 5 major/specialised hospitals, including 4 medical colleges (Aug 2025); this register is anchored to that count.")}</span>}
        />
      </MetricGrid>

      {/* Two columns, read downward. The facility register, the facility an
          officer has opened and the flood-exposure comparison carry the width;
          the surge exceptions and the coverage map stand beside them. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
      <GovPanel title={t('Facility register')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Sortable, filterable by type and ward. Select a row to inspect service availability.')}
        </p>
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          <FilterBar show={['ward', 'search']} searchPlaceholder="Search facility or ward" compact />
          <div className="flex items-center gap-1.5">
            <Label className="mb-0 whitespace-nowrap">{t('Type')}</Label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | Hospital['type'])}
              className="w-auto min-w-[9rem]"
              options={[{ value: 'all', label: t('All types') }, ...HOSPITAL_TYPES.map((entry) => ({ value: entry, label: HOSPITAL_TYPE_LABEL[entry] }))]}
              aria-label={t('Filter by facility type')}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          /* A ward with no municipal facility of its own is a real answer, and
             the nearest facility is what makes it a different answer from the
             next such ward. Without it every ward without a hospital rendered
             the same sentence - indistinguishable from a filter that did not
             apply. */
          nearestFacility ? (
            <EmptyState
              className="m-3"
              title={t('No municipal facility in {0}', wardName(nearestFacility.wardId))}
              detail={t('The nearest is {0} in {1}, about {2} km away - {3} beds, {4} occupied. Residents of this {5} are served from there.', nearestFacility.hospital.name, wardName(nearestFacility.hospital.wardId), nearestFacility.km.toFixed(1), nearestFacility.hospital.bedsTotal, formatPercent(nearestFacility.hospital.occupancyPct), corporation.wardTerminology.toLowerCase())}
            />
          ) : (
            <EmptyState className="m-3" title={t('No facilities match the current filters')} detail="Adjust the type, ward or search term above." />
          )
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => setSelectedId(r.id)}
            activeRowKey={selected?.id}
            pageSize={12}
            searchable={false}
            initialSort={{ columnId: 'beds', direction: 'desc' }}
            ariaLabel="Hospital facility register"
          />
        )}
      </GovPanel>

      {selected ? (
        <GovPanel
          title={selected.name}
          subtitle={t('{0} facility · {1}', HOSPITAL_TYPE_LABEL[selected.type], wardName(selected.wardId))}
          tone="red"
        >
          <p className="mb-3 text-xs leading-relaxed text-ink-500">
            {t('Service availability reflects the current reporting period; a curtailed service means it is not currently being offered at this facility, not that the facility is closed.')}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="label-institutional mb-1.5">{t('Services available')}</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.servicesAvailable.length === 0 ? (
                  <span className="text-xs text-ink-400">{t('None recorded')}</span>
                ) : (
                  selected.servicesAvailable.map((s) => <Badge key={s} tone="positive">{s}</Badge>)
                )}
              </div>
            </div>
            <div>
              <p className="label-institutional mb-1.5">{t('Services curtailed')}</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.servicesUnavailable.length === 0 ? (
                  <span className="text-xs text-ink-400">{t('None - full service line-up currently offered')}</span>
                ) : (
                  selected.servicesUnavailable.map((s) => <Badge key={s} tone="muted">{s}</Badge>)
                )}
              </div>
            </div>
          </div>
          <MetricGrid columns={4} className="mt-4">
            <MetricCard label={t('Staffing')} value={formatPercent(selected.staffingPct)} support={t('Against sanctioned strength')} size="sm" />
            <MetricCard label={t('Equipment serviceable')} value={formatPercent(selected.equipmentServiceablePct)} size="sm" />
            <MetricCard label={t('Accessibility index')} value={selected.accessibilityIndex} unit="/100" size="sm" />
            <MetricCard label={t('Emergency load index')} value={selected.emergencyLoadIndex} unit="/100" size="sm" />
          </MetricGrid>
        </GovPanel>
      ) : null}

      <GovPanel title={t('Accessibility and flood exposure')} tone="amber">
        <p className="mb-3 text-xs leading-relaxed text-ink-500">
          {t('Comparing hospital accessibility between flood-prone / low-lying wards and other wards.')}
        </p>
        <MetricGrid columns={3}>
          <MetricCard label={t('Facilities in flood-exposed wards')} value={inFloodWards.length} support={t('of {0} facilities city-wide', hospitals.length)} />
          <MetricCard label={t('Avg. accessibility, flood-exposed wards')} value={avgAccessFlood} unit="/100" tone={avgAccessFlood < avgAccessOther ? 'warn' : 'default'} />
          <MetricCard label={t('Avg. accessibility, other wards')} value={avgAccessOther} unit="/100" />
        </MetricGrid>
        {lowAccessFlood.length > 0 ? (
          <div className="mt-4">
            <ChartFrame
              title={t('Lowest accessibility, flood-exposed wards')}
              unit={t('Accessibility index (0–100, lower is worse)')}
              timeframe="Current position"
              height={Math.max(140, lowAccessFlood.length * 26)}
            >
              <RankedBarChart data={lowAccessFlood.slice(0, 10).map((h) => ({ label: h.name.length > 20 ? `${h.name.slice(0, 18)}…` : h.name, value: h.accessibilityIndex }))} higherIsWorse={false} />
            </ChartFrame>
          </div>
        ) : null}
        <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-400">
          {t('Wards are flagged flood-prone based on structural, low-lying exposure - the same flag monsoon intelligence uses. The lower accessibility figures observed at facilities within these wards reflect a modelled')}{' '}<span className="font-medium text-ink-600">exposure</span>{' '}{t('- the ward&apos;s susceptibility to access disruption during flooding - and are not a prediction of when or whether any specific facility will become inaccessible.')}
        </p>
      </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          {surging.length > 0 ? (
            <GovPanel title={t('Facilities above the surge threshold')} tone="amber">
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {t('Flagged at {0}% bed occupancy or an emergency load index of {1} or higher.', SURGE_OCCUPANCY_THRESHOLD, SURGE_LOAD_INDEX_THRESHOLD)}
              </p>
              <ul className="divide-y divide-warn-200/60">
                {surging.slice(0, 8).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(h.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left transition-colors hover:bg-warn-100/40"
                    >
                      <span className="min-w-0 truncate text-xs font-medium text-ink-800">
                        {h.name} <span className="font-normal text-ink-500">· {wardName(h.wardId)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge tone="warn">{formatPercent(h.occupancyPct)} occupied</Badge>
                        <Badge tone={toneForScore(h.emergencyLoadIndex, false)}>{t('Load {0}', h.emergencyLoadIndex)}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </GovPanel>
          ) : null}

          <GovPanel title={t('Facility map and ward coverage')} tone="red">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('Marker positions are illustrative, placed within each facility\'s ward. The coverage layer shows functional beds per 10,000 ward residents.')}
            </p>
            <CityMap
              layers={[
                {
                  id: 'bed-coverage',
                  label: t('Bed Coverage'),
                  valueFor: (wardId) => {
                    const ward = WARDS.find((w) => w.id === wardId)
                    if (!ward || ward.population === 0) return undefined
                    const beds = bedsByWard.get(wardId) ?? 0
                    const perTenK = (beds / ward.population) * 10_000
                    return Math.min(100, Math.round((perTenK / 40) * 100))
                  },
                  higherIsWorse: false,
                  unit: ' (scaled; ~40 beds/10k pop. = 100)',
                  description: t('Functional hospital beds per 10,000 ward residents, scaled 0–100 for map shading. Higher is better coverage.'),
                },
              ]}
              markers={markers}
              height={400}
            />
          </GovPanel>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default HospitalIntelligencePage
