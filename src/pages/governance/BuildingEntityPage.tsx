import { useMemo, useState } from 'react'
import { AlertTriangle, Building2, Gavel, Landmark, Stamp } from 'lucide-react'
import { PageBody, PageHeader, SplitLayout } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  type Column,
} from '@/components/ui'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { buildingService, enforcementService, licenceService, revenueService } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName } from '@/data/reference'
import { LICENCE_CATEGORY_LABEL } from '@/types/civic-services'
import { ENCROACHMENT_CATEGORY_LABEL, ENFORCEMENT_STATUS_LABEL } from '@/types/enforcement'
import type { BuildingRecord } from '@/types/city-domains'
import { formatCrore, formatDate, formatPercent } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/governance/BuildingEntityPage.tsx
 *
 * A Building ID read as one entity, per the target architecture's call for a
 * canonical Building &rarr; Property &rarr; Licence &rarr; Enforcement graph.
 *
 * Built honestly rather than aspirationally: the platform holds individual
 * building RECORDS (Building Intelligence) but property assessment and
 * licensing are held at ward × segment aggregate, not at the individual
 * premises level - so what this page can actually join a selected building
 * against today is its WARD'S position in those registers, not a verified
 * record-to-record match. Every cross-domain panel below says so. A true
 * building-to-property-to-licence join needs a shared canonical identifier
 * threaded through all three domains, which is a data-model investment
 * (see the architecture note on the canonical municipal data model), not a
 * screen this page can manufacture on its own.
 */

export function BuildingEntityPage(): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  usePageMasthead(
    t('Building Entity'),
    t('One building, read against its ward’s property, licensing and enforcement position - the shape a canonical Building ID would eventually let this platform join precisely.'),
  )

  const buildingsQuery = useServiceQuery(queryKeys.buildings('all'), (u) => buildingService.buildings(u))
  const buildings = useMemo(() => buildingsQuery.data ?? [], [buildingsQuery.data])
  const selected = useMemo(() => buildings.find((b) => b.id === selectedId) ?? buildings[0] ?? null, [buildings, selectedId])

  const propertyQuery = useServiceQuery(
    queryKeys.finance(`property:${selected?.wardId ?? 'none'}`),
    (u) => revenueService.propertySegments(u, selected?.wardId),
    { enabled: Boolean(selected) },
  )
  const licenceQuery = useServiceQuery(
    queryKeys.licensing(selected?.wardId ?? 'none'),
    (u) => licenceService.registers(u, selected?.wardId),
    { enabled: Boolean(selected) },
  )
  const enforcementQuery = useServiceQuery(
    queryKeys.enforcement(`ward:${selected?.wardId ?? 'none'}`),
    (u) => enforcementService.cases(u, { wardId: selected?.wardId }),
    { enabled: Boolean(selected) },
  )

  if (buildingsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Planning & Development')} breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Building Entity') }]} />
        <LoadingState variant="table" rows={10} />
      </PageBody>
    )
  }
  if (buildingsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('Planning & Development')} breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Building Entity') }]} />
        <ErrorState detail={buildingsQuery.error.message} onRetry={() => void buildingsQuery.refetch()} />
      </PageBody>
    )
  }

  const columns: Array<Column<BuildingRecord>> = [
    {
      id: 'name',
      header: t('Building'),
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{b.name}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-500">{b.reference} · {wardName(b.wardId)}</p>
        </div>
      ),
      sortValue: (b) => b.name,
      searchValue: (b) => `${b.name} ${b.reference}`,
      width: 'minmax(14rem,2fr)',
    },
    {
      id: 'dilapidation',
      header: t('Dilapidation'),
      cell: (b) => (b.dilapidationCategory ? <Badge tone={b.dilapidationCategory === 'C1' ? 'critical' : 'warn'} size="sm">{b.dilapidationCategory}</Badge> : <span className="text-ink-400">-</span>),
      sortValue: (b) => b.dilapidationCategory ?? '',
      hideBelow: 'md',
    },
    {
      id: 'permission',
      header: t('Permission'),
      cell: (b) => <span className="text-ink-700">{b.permissionStatus}</span>,
      sortValue: (b) => b.permissionStatus,
      hideBelow: 'lg',
    },
  ]

  const relevantLicenceCategories = selected?.type === 'commercial' || selected?.type === 'mixed'
    ? (['shop-establishment', 'eating-house', 'trade-storage'] as const)
    : selected?.type === 'industrial'
      ? (['factory', 'trade-storage'] as const)
      : (['shop-establishment'] as const)

  const enforcement = (enforcementQuery.data ?? []).filter((c) => c.category === 'unauthorised-construction')

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Planning & Development')}
        breadcrumbs={[{ label: t('Planning & Development') }, { label: t('Building Entity') }]}
        hideProvenance
      />
      <DemonstrationNotice />

      <Card tone="info" className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-govt-800">{t('A ward-level join today, a canonical Building ID tomorrow')}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('Property assessment and licensing are held per ward-and-segment, not per individual premises, so the panels below show the selected building’s WARD position in those registers - a genuine cross-domain view, but not yet a verified record-to-record match. A shared canonical identifier across Building, Property and Licence records is what would make this join precise.')}
          </p>
        </div>
      </Card>

      <SplitLayout
        asideWidth="lg"
        aside={
          <>
            {!selected ? (
              <EmptyState title={t('No buildings on record')} />
            ) : (
              <>
                <Card className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-govt-600" aria-hidden />
                    <p className="text-[0.9375rem] font-semibold text-ink-900">{selected.name}</p>
                  </div>
                  <p className="text-[0.75rem] text-ink-500">{selected.reference} · {wardName(selected.wardId)}</p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <div><dt className="label-institutional">{t('Type')}</dt><dd className="mt-0.5 text-xs font-medium text-ink-800 capitalize">{selected.type}</dd></div>
                    <div><dt className="label-institutional">{t('Year built')}</dt><dd className="mt-0.5 text-xs font-medium text-ink-800">{selected.yearBuilt}</dd></div>
                    <div><dt className="label-institutional">{t('Floors')}</dt><dd className="mt-0.5 text-xs font-medium text-ink-800">{selected.floors}</dd></div>
                    <div><dt className="label-institutional">{t('Occupancy units')}</dt><dd className="mt-0.5 text-xs font-medium text-ink-800">{selected.occupancyUnits}</dd></div>
                    <div><dt className="label-institutional">{t('Structural audit')}</dt><dd className="mt-0.5 text-xs font-medium text-ink-800 capitalize">{selected.structuralAudit}</dd></div>
                    <div><dt className="label-institutional">{t('Last inspected')}</dt><dd className="mt-0.5 text-xs font-medium text-ink-800">{formatDate(selected.lastInspectedAt)}</dd></div>
                  </dl>
                </Card>

                <Card flush className="mt-3 flex flex-col">
                  <CardHeader icon={<Landmark className="h-4 w-4" />} title={t('Ward property position')} bordered />
                  {propertyQuery.isLoading ? (
                    <LoadingState variant="metrics" />
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {(propertyQuery.data ?? []).map((seg) => (
                        <li key={seg.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                          <span className="text-xs text-ink-700 capitalize">{seg.segment}</span>
                          <span className="numeric text-xs text-ink-600">{formatCrore(seg.assessedValueCrore)} · {formatPercent(seg.collectionEfficiencyPct)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card flush className="mt-3 flex flex-col">
                  <CardHeader icon={<Stamp className="h-4 w-4" />} title={t('Ward licence position')} description={t('Categories plausible for this building’s use type.')} bordered />
                  {licenceQuery.isLoading ? (
                    <LoadingState variant="metrics" />
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {(licenceQuery.data ?? [])
                        .filter((l) => (relevantLicenceCategories as readonly string[]).includes(l.category))
                        .map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                            <span className="text-xs text-ink-700">{LICENCE_CATEGORY_LABEL[l.category]}</span>
                            <span className="numeric text-xs text-ink-600">{l.active} {t('active')} · {formatPercent(l.charterCompliancePct)}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </Card>

                <Card flush className="mt-3 flex flex-col">
                  <CardHeader icon={<Gavel className="h-4 w-4" />} title={t('Ward unauthorised-construction notices')} bordered />
                  {enforcementQuery.isLoading ? (
                    <LoadingState variant="metrics" />
                  ) : enforcement.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-ink-500">{t('No unauthorised-construction notices recorded in this ward.')}</p>
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {enforcement.slice(0, 5).map((c) => (
                        <li key={c.id} className="px-4 py-2.5">
                          <p className="truncate text-xs text-ink-700">{c.locationDescription}</p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[0.6875rem] text-ink-400">{ENCROACHMENT_CATEGORY_LABEL[c.category]}</span>
                            <Badge tone="warn" size="sm">{ENFORCEMENT_STATUS_LABEL[c.status]}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </>
        }
        main={
          <Card flush>
            <CardHeader
              bordered
              icon={<AlertTriangle className="h-4 w-4" />}
              title={t('Building register')}
              description={t('Select a building to read its consolidated ward-level entity view.')}
            />
            {buildings.length === 0 ? (
              <EmptyState title={t('No buildings on record')} />
            ) : (
              <DataTable
                rows={buildings}
                columns={columns}
                rowKey={(b) => b.id}
                pageSize={14}
                onRowClick={(b) => setSelectedId(b.id)}
                activeRowKey={selected?.id}
              />
            )}
          </Card>
        }
        reverseOnMobile
      />
    </PageBody>
  )
}

export default BuildingEntityPage
