import { useMemo, useState } from 'react'
import { AlertOctagon, Info, PackageSearch } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { projectService, wardService } from '@/services'
import { useDrawerStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { ROUTES } from '@/config/navigation'
import { ASSET_CATEGORY_LABEL, type AssetCategory, type MunicipalAsset } from '@/types/operations'
import type { ProjectCategory, ProjectStatus } from '@/types/finance'
import { departmentName, wardName } from '@/data/reference'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCrore, formatNumber, formatRelative } from '@/utils/format'
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
  Select,
  type Column,
} from '@/components/ui'
import { SeverityBadge } from '@/components/ui/badges'
import { MetricCard } from '@/components/cards'
import { ChartFrame, DonutChart, MiniBar, RankedBarChart } from '@/components/charts'
import { CityMap } from '@/components/map/CityMap'
import { t } from '@/i18n'

/**
 * Asset Intelligence - the municipal asset register.
 *
 * There is no dedicated `assetService`. `wardService.profile` does expose
 * `assets: MunicipalAsset[]` per ward, so the full register is assembled by
 * requesting every authorised ward's profile in parallel and concatenating
 * `profile.assets` - entirely through `wardService`, never `@/data/*`. The
 * lifecycle-exposure cross-reference additionally reads `projectService.list`
 * to test whether a matching capital project already addresses an asset's
 * category in its ward.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-4200),
  refreshIntervalMinutes: 10080,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

const CONDITION_THRESHOLD = 45
const CURRENT_YEAR = new Date(isoFromAnchor(0)).getFullYear()

/** Loose mapping from asset category to the capital-project category most
 * likely to fund its replacement or rehabilitation - used only to test
 * whether a programme entry exists, never to assert one does not. */
const ASSET_TO_PROJECT_CATEGORY: Partial<Record<AssetCategory, ProjectCategory>> = {
  'water-asset': 'water-supply',
  'pumping-station': 'stormwater',
  drain: 'stormwater',
  road: 'roads',
  bridge: 'roads',
  building: 'buildings',
  hospital: 'health',
  school: 'education',
  'waste-facility': 'solid-waste',
  vehicle: 'solid-waste',
  park: 'environment',
}
const PROGRAMME_STATUSES: ProjectStatus[] = ['planned', 'tendered', 'awarded', 'in-progress']

function ageOf(asset: MunicipalAsset): number {
  return CURRENT_YEAR - asset.installedYear
}

function pastDesignLife(asset: MunicipalAsset): boolean {
  return ageOf(asset) > asset.designLifeYears
}

export function AssetIntelligencePage(): React.JSX.Element {
  // The shell's masthead carries the screen's name; the page states the wording.
  usePageMasthead(
    t('Asset Intelligence'),
    t('The municipal asset register - condition, age against design life and lifecycle exposure across every asset category. Assembled from every ward\'s asset holding within your authorised scope.'),
  )

  const openDrawer = useDrawerStore((s) => s.open)
  const [categoryFilter, setCategoryFilter] = useState<'all' | AssetCategory>('all')
  const [wardFilter, setWardFilter] = useState<string>('all')

  const assetsQuery = useServiceQuery(queryKeys.wards('all-assets'), async (user) => {
    const wards = await wardService.list(user)
    const profiles = await Promise.all(wards.map((w) => wardService.profile(user, w.id)))
    return profiles.flatMap((p) => p.assets.items)
  })
  const wardsQuery = useServiceQuery(queryKeys.wards(), (user) => wardService.list(user))
  const projectsQuery = useServiceQuery(queryKeys.projects({ scope: 'asset-lifecycle' }), (user) => projectService.list(user, { pageSize: 200 }))

  const assets = assetsQuery.data ?? []
  const projects = projectsQuery.data?.items ?? []

  const filtered = useMemo(
    () =>
      assets.filter(
        (a) => (categoryFilter === 'all' || a.category === categoryFilter) && (wardFilter === 'all' || a.wardId === wardFilter),
      ),
    [assets, categoryFilter, wardFilter],
  )

  function hasMatchingProgramme(asset: MunicipalAsset): boolean {
    const category = ASSET_TO_PROJECT_CATEGORY[asset.category]
    if (!category) return false
    return projects.some((p) => p.category === category && p.wardIds.includes(asset.wardId) && PROGRAMME_STATUSES.includes(p.status))
  }

  const summary = useMemo(() => {
    const replacementValue = filtered.reduce((s, a) => s + a.replacementValueCrore, 0)
    const pastLife = filtered.filter(pastDesignLife).length
    const belowThreshold = filtered.filter((a) => a.conditionIndex < CONDITION_THRESHOLD).length
    const inspectionsOverdue = filtered.filter((a) => a.nextInspectionDue < isoFromAnchor(0)).length
    const criticalAtRisk = filtered.filter((a) => a.criticality === 'critical' && (pastDesignLife(a) || a.conditionIndex < CONDITION_THRESHOLD)).length
    return {
      total: filtered.length,
      replacementValue: Math.round(replacementValue * 10) / 10,
      pastLife,
      belowThreshold,
      inspectionsOverdue,
      criticalAtRisk,
    }
  }, [filtered])

  const lifecycleExposed = useMemo(
    () => filtered.filter((a) => pastDesignLife(a) && a.conditionIndex < CONDITION_THRESHOLD && !hasMatchingProgramme(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, projects],
  )

  const categories = Array.from(new Set(assets.map((a) => a.category)))
  const conditionByCategory = useMemo(
    () =>
      categories
        .map((cat) => {
          const inCat = filtered.filter((a) => a.category === cat)
          const avg = inCat.length > 0 ? inCat.reduce((s, a) => s + a.conditionIndex, 0) / inCat.length : 0
          return { label: ASSET_CATEGORY_LABEL[cat], value: Math.round(avg * 10) / 10 }
        })
        .sort((a, b) => a.value - b.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, categories.join(',')],
  )

  const countByCategory = useMemo(() => {
    const counts = new Map<AssetCategory, number>()
    for (const a of filtered) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
    return Array.from(counts.entries()).map(([category, value]) => ({ label: ASSET_CATEGORY_LABEL[category], value }))
  }, [filtered])

  const conditionByWard = useMemo(() => {
    const byWard = new Map<string, number[]>()
    for (const a of filtered) {
      const bucket = byWard.get(a.wardId) ?? []
      bucket.push(a.conditionIndex)
      byWard.set(a.wardId, bucket)
    }
    return new Map(Array.from(byWard.entries()).map(([wardId, values]) => [wardId, values.reduce((s, v) => s + v, 0) / values.length]))
  }, [filtered])

  const columns: Array<Column<MunicipalAsset>> = [
    {
      id: 'name',
      header: t('Asset'),
      cell: (row) => <span className="font-medium text-ink-800">{row.name}</span>,
      sortValue: (row) => row.name,
      searchValue: (row) => row.name,
      width: '16rem',
    },
    {
      id: 'category',
      header: t('Category'),
      cell: (row) => <Badge tone="neutral">{ASSET_CATEGORY_LABEL[row.category]}</Badge>,
      sortValue: (row) => ASSET_CATEGORY_LABEL[row.category],
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (row) => wardName(row.wardId),
      sortValue: (row) => wardName(row.wardId),
      hideBelow: 'md',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => departmentName(row.departmentId),
      sortValue: (row) => departmentName(row.departmentId),
      optional: true,
    },
    {
      id: 'installed',
      header: t('Installed'),
      cell: (row) => <span className="numeric">{row.installedYear}</span>,
      sortValue: (row) => row.installedYear,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'design-life',
      header: t('Design life'),
      cell: (row) => <span className="numeric">{row.designLifeYears} yrs</span>,
      sortValue: (row) => row.designLifeYears,
      align: 'right',
      optional: true,
    },
    {
      id: 'age',
      header: t('Age vs design life'),
      cell: (row) => (
        <span className={`numeric ${pastDesignLife(row) ? 'font-semibold text-crit-700' : 'text-ink-600'}`}>
          {ageOf(row)} / {row.designLifeYears} yrs
        </span>
      ),
      sortValue: (row) => ageOf(row) - row.designLifeYears,
      align: 'right',
    },
    {
      id: 'condition',
      header: t('Condition index'),
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <MiniBar value={row.conditionIndex} />
          <span className="numeric w-8 text-right font-semibold">{row.conditionIndex}</span>
        </div>
      ),
      sortValue: (row) => row.conditionIndex,
      align: 'right',
    },
    {
      id: 'criticality',
      header: t('Criticality'),
      cell: (row) => <SeverityBadge severity={row.criticality} />,
      sortValue: (row) => row.criticality,
      hideBelow: 'lg',
    },
    {
      id: 'replacement',
      header: t('Replacement value'),
      cell: (row) => <span className="numeric">{formatCrore(row.replacementValueCrore, 2)}</span>,
      sortValue: (row) => row.replacementValueCrore,
      align: 'right',
      hideBelow: 'xl',
    },
    {
      id: 'last-inspected',
      header: t('Last inspected'),
      cell: (row) => <span className="text-[0.6875rem] text-ink-500">{formatRelative(row.lastInspectedAt)}</span>,
      sortValue: (row) => row.lastInspectedAt,
      optional: true,
    },
    {
      id: 'next-inspection',
      header: t('Next inspection due'),
      cell: (row) => {
        const overdue = row.nextInspectionDue < isoFromAnchor(0)
        return <span className={`text-[0.6875rem] ${overdue ? 'font-semibold text-crit-700' : 'text-ink-500'}`}>{formatRelative(row.nextInspectionDue)}</span>
      },
      sortValue: (row) => row.nextInspectionDue,
    },
    {
      id: 'observations',
      header: t('Open observations'),
      cell: (row) => <span className="numeric text-ink-500">{row.openObservations}</span>,
      sortValue: (row) => row.openObservations,
      align: 'right',
      optional: true,
    },
  ]

  const anyLoading = assetsQuery.isLoading || wardsQuery.isLoading
  const anyError = assetsQuery.error ?? wardsQuery.error

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Governance & Finance')}
        breadcrumbs={[{ label: t('Governance & Finance') }, { label: t('Asset Intelligence') }]}
        freshness={FRESHNESS}
        actions={
          <LinkButton to={ROUTES.buildings} variant="outline" icon={<PackageSearch className="h-3.5 w-3.5" />}>
            {t('Open Building Intelligence')}
          </LinkButton>
        }
        controls={
          <>
            <Select
              aria-label={t('Filter by category')}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              options={[{ value: 'all', label: t('All categories') }, ...Object.entries(ASSET_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]}
              className="w-auto"
            />
            <Select
              aria-label={t('Filter by ward')}
              value={wardFilter}
              onChange={(e) => setWardFilter(e.target.value)}
              options={[{ value: 'all', label: t('All wards') }, ...(wardsQuery.data ?? []).map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` }))]}
              className="w-auto"
            />
          </>
        }
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? <ErrorState detail={anyError.message} onRetry={() => { void assetsQuery.refetch() }} /> : null}

      {!anyLoading && !anyError && assets.length === 0 ? (
        <EmptyState title={t('No assets available')} detail="No municipal assets were returned for your authorised scope." />
      ) : null}

      {!anyLoading && !anyError && assets.length > 0 ? (
        <>
          <Card>
            <CardHeader title={t('Register summary')} description={t('Scoped to the filters selected above.')} />
            <MetricGrid columns={5} className="mt-4">
              <MetricCard label={t('Assets tracked')} value={formatNumber(summary.total)} support={`${categories.length} categories`} />
              <MetricCard label={t('Replacement value')} value={formatCrore(summary.replacementValue)} />
              <MetricCard label={t('Past design life')} value={formatNumber(summary.pastLife)} support={t('{0} below condition threshold', summary.belowThreshold)} tone={summary.pastLife > 0 ? 'warn' : 'default'} />
              <MetricCard
                label={t('Critical assets at risk')}
                value={formatNumber(summary.criticalAtRisk)}
                support={t('Critical criticality, degraded or past design life')}
                tone={summary.criticalAtRisk > 0 ? 'critical' : 'default'}
              />
              <MetricCard label={t('Inspections overdue')} value={formatNumber(summary.inspectionsOverdue)} tone={summary.inspectionsOverdue > 0 ? 'warn' : 'default'} />
            </MetricGrid>
          </Card>

          {/* Two columns. Lifecycle exposure, the register it is drawn from and
              the spatial view of that same register read down the wide column;
              the two distributions and the standing note on the
              cross-reference stand beside them. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <Card tone="critical" flush>
            <CardHeader
              bordered
              icon={<AlertOctagon className="h-4 w-4" />}
              title={t('Lifecycle exposure - {0} asset{1}', lifecycleExposed.length, lifecycleExposed.length === 1 ? '' : 's')}
              description={t('A three-condition rule: an asset appears here only when (1) its age exceeds its design life, and (2) its condition index falls below the review threshold of 45, and (3) no capital project of a matching category is currently planned, tendered, awarded or in progress in its ward.')}
            />
            {lifecycleExposed.length === 0 ? (
              <EmptyState title={t('No assets meet all three conditions')} detail="No asset in the current scope is simultaneously past design life, below the condition threshold and without a matching programme entry." compact className="m-4" />
            ) : (
              <div className="scrollbar-slim max-h-80 overflow-y-auto p-2">
                {lifecycleExposed.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openDrawer({ kind: 'asset', id: a.id })}
                    aria-label={t('Open asset {0}', a.name)}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-crit-50/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink-800">{a.name}</p>
                      <p className="mt-0.5 truncate text-[0.625rem] text-ink-500">
                        {ASSET_CATEGORY_LABEL[a.category]} · {wardName(a.wardId)} · {departmentName(a.departmentId)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <Badge tone="critical">{t('Past design life')}</Badge>
                      <Badge tone="critical">{t('Condition {0}', a.conditionIndex)}</Badge>
                      <Badge tone="critical">{t('No programme entry')}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card flush>
            <CardHeader bordered title={t('Asset register')} description={t('Sortable, filterable and paginated. Row click opens the asset\'s full record.')} />
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(row) => row.id}
              pageSize={12}
              stickyHeader
              maxHeight="30rem"
              searchPlaceholder="Search assets"
              onRowClick={(row) => openDrawer({ kind: 'asset', id: row.id })}
              rowAccent={(row) => (
                <span className={`w-[3px] rounded-full ${row.conditionIndex < 30 ? 'bg-crit-500' : row.conditionIndex < CONDITION_THRESHOLD ? 'bg-risk-500' : 'bg-ok-500'}`} />
              )}
            />
          </Card>

          <Card flush>
            <CardHeader bordered title={t('Asset condition - spatial view')} description={t('Illustrative ward map shaded by average asset condition index for the current scope.')} />
            <div className="p-4">
              <CityMap
                layers={[
                  {
                    id: 'asset-condition',
                    label: t('Asset Condition'),
                    valueFor: (wardId) => conditionByWard.get(wardId),
                    higherIsWorse: false,
                    unit: '',
                    description: t('Average municipal asset condition index for the current category and ward scope.'),
                  },
                ]}
                height={420}
              />
            </div>
          </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
            <Card>
              <ChartFrame title={t('Assets by category')} unit="assets" timeframe="Current scope" freshness={FRESHNESS} height={230}>
                <DonutChart data={countByCategory} unit="assets" centreValue={formatNumber(filtered.length)} centreLabel="Assets" />
              </ChartFrame>
            </Card>
            <Card>
              <ChartFrame
                title={t('Condition distribution by category')}
                unit={t('condition index')}
                timeframe="Current scope"
                description={t('Average condition index (0–100, higher is better) by asset category, weakest first.')}
                freshness={FRESHNESS}
                height={230}
              >
                <RankedBarChart data={conditionByCategory} unit="" higherIsWorse={false} />
              </ChartFrame>
            </Card>

            <Card tone="info">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-600" />
                {t('The capital-project cross-reference used for lifecycle exposure matches an asset\'s category and ward against active or planned projects of a corresponding category. It identifies the apparent absence of a matching programme entry within the platform\'s own project data; it does not confirm the absence of a departmental replacement plan held outside this system.')}
              </p>
            </Card>
          </div>
          </div>
        </>
      ) : null}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default AssetIntelligencePage
