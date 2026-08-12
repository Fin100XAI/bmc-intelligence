import { useMemo } from 'react'
import { Trees, Scissors, Sprout, MapPinned } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  StateBadge,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { CategoryBarChart, CHART_COLOURS, DonutChart, RankedBarChart } from '@/components/charts'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { gardensService } from '@/services'
import { useFilterStore } from '@/stores/ui.store'
import { wardName, wardShortName } from '@/data/reference'
import {
  OPEN_SPACE_KIND_LABEL,
  type OpenSpace,
  type OpenSpaceKind,
  type TreeWardPosition,
} from '@/types/civic-services'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/city/GardensIntelligencePage.tsx
 *
 * Gardens, open space and the Tree Authority.
 *
 * Open space per thousand residents is the figure a development plan is
 * actually judged against, and it is the one most easily lost sight of: a
 * corporation can add gardens every year and still fall behind if population
 * grows faster.
 *
 * The Tree Authority half of this page exists because of one specific failure
 * mode. Felling permissions are granted on the condition of compensatory
 * planting, and a permission granted without the planting that conditioned it
 * is the only finding here that matters. So this page never shows permissions
 * granted without showing compensatory planting completed beside it - the two
 * figures are meaningless apart, and separating them is how the shortfall goes
 * unnoticed.
 */

const KIND_COLOUR: Record<OpenSpaceKind, string> = {
  garden: CHART_COLOURS.positive,
  playground: CHART_COLOURS.primary,
  'recreation-ground': CHART_COLOURS.intel,
  'traffic-island': CHART_COLOURS.warn,
  plaza: CHART_COLOURS.neutral,
}

const CONDITION_THRESHOLD = 55

export function GardensIntelligencePage(): React.JSX.Element {
  const filters = useFilterStore((s) => s.filters)

  const spacesQuery = useServiceQuery(queryKeys.gardens('open-spaces'), (u) => gardensService.openSpaces(u))
  const treesQuery = useServiceQuery(queryKeys.gardens('trees'), (u) => gardensService.treePositions(u))

  const spaces = useMemo(() => spacesQuery.data ?? [], [spacesQuery.data])
  const trees = useMemo(() => treesQuery.data ?? [], [treesQuery.data])

  const filtered = useMemo(
    () =>
      spaces.filter((s) => {
        if (filters.wardIds.length > 0 && !filters.wardIds.includes(s.wardId)) return false
        if (filters.search.trim()) {
          const q = filters.search.trim().toLowerCase()
          if (!s.name.toLowerCase().includes(q) && !wardName(s.wardId).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [spaces, filters],
  )

  if (spacesQuery.isLoading || treesQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Gardens & Open Space')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Gardens & Open Space') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (spacesQuery.error || treesQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} title={t('Gardens & Open Space')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Gardens & Open Space') }]} />
        <ErrorState
          detail={(spacesQuery.error ?? treesQuery.error)?.message}
          onRetry={() => { void spacesQuery.refetch(); void treesQuery.refetch() }}
        />
      </PageBody>
    )
  }

  const totalArea = Math.round(filtered.reduce((s, x) => s + x.areaHectares, 0) * 10) / 10
  const belowCondition = filtered.filter((s) => s.conditionScore < CONDITION_THRESHOLD).length
  const encroached = filtered.filter((s) => s.encroachmentReported).length
  const accessible = filtered.filter((s) => s.hasAccessibleEntrance).length
  const accessiblePct = filtered.length ? Math.round((accessible / filtered.length) * 1000) / 10 : 0

  const pendingFelling = trees.reduce((s, treeWardPosition) => s + treeWardPosition.fellingApplicationsPending, 0)
  const granted = trees.reduce((s, treeWardPosition) => s + treeWardPosition.fellingPermissionsGranted12m, 0)
  const required = trees.reduce((s, treeWardPosition) => s + treeWardPosition.compensatoryPlantingRequired, 0)
  const completed = trees.reduce((s, treeWardPosition) => s + treeWardPosition.compensatoryPlantingCompleted, 0)
  const plantingShortfall = Math.max(0, required - completed)
  const plantingPct = required > 0 ? Math.round((completed / required) * 1000) / 10 : 0

  const byKind = (Object.keys(OPEN_SPACE_KIND_LABEL) as OpenSpaceKind[])
    .map((k) => ({ kind: k, count: filtered.filter((s) => s.kind === k).length }))
    .filter((x) => x.count > 0)

  const leastOpenSpace = [...trees].sort((a, b) => a.openSpacePerThousandHa - b.openSpacePerThousandHa).slice(0, 10)

  const plantingByWard = [...trees]
    .sort((a, b) => (a.compensatoryPlantingCompleted / Math.max(1, a.compensatoryPlantingRequired)) - (b.compensatoryPlantingCompleted / Math.max(1, b.compensatoryPlantingRequired)))
    .slice(0, 8)
    .map((treeWardPosition) => ({
      label: wardShortName(treeWardPosition.wardId),
      required: treeWardPosition.compensatoryPlantingRequired,
      completed: treeWardPosition.compensatoryPlantingCompleted,
    }))

  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: DEMO_NOW.toISOString(),
    refreshIntervalMinutes: 10080,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const spaceColumns: Array<Column<OpenSpace>> = [
    {
      id: 'name',
      header: t('Open space'),
      cell: (r) => (
        <span className="font-medium text-ink-900">
          {r.name}
          {r.encroachmentReported ? <Badge tone="critical" size="sm" className="ml-1.5">{t('Encroachment')}</Badge> : null}
        </span>
      ),
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
      width: 'minmax(13rem,1.6fr)',
    },
    { id: 'ward', header: t('Ward'), cell: (r) => wardShortName(r.wardId), sortValue: (r) => wardName(r.wardId), hideBelow: 'sm' },
    { id: 'kind', header: t('Kind'), cell: (r) => <Badge tone="neutral" size="sm">{OPEN_SPACE_KIND_LABEL[r.kind]}</Badge>, sortValue: (r) => r.kind, hideBelow: 'md' },
    { id: 'area', header: t('Area'), cell: (r) => <span className="numeric">{r.areaHectares} ha</span>, sortValue: (r) => r.areaHectares, align: 'right' },
    {
      id: 'maintenance',
      header: t('Maintenance'),
      cell: (r) => (r.maintenance === 'departmental' ? 'Departmental' : r.maintenance === 'caretaker' ? 'Caretaker' : 'Adopted'),
      sortValue: (r) => r.maintenance,
      hideBelow: 'xl',
    },
    {
      id: 'condition',
      header: t('Condition'),
      cell: (r) => (
        <span className={r.conditionScore < CONDITION_THRESHOLD ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
          {r.conditionScore}
        </span>
      ),
      sortValue: (r) => r.conditionScore,
      align: 'right',
    },
    {
      id: 'access',
      header: t('Step-free entry'),
      cell: (r) => (r.hasAccessibleEntrance ? <Badge tone="positive" size="sm">{t('Yes')}</Badge> : <Badge tone="warn" size="sm">{t('No')}</Badge>),
      sortValue: (r) => (r.hasAccessibleEntrance ? 1 : 0),
      hideBelow: 'lg',
    },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
    { id: 'inspected', header: t('Last inspected'), cell: (r) => formatDate(r.lastInspectedAt), sortValue: (r) => r.lastInspectedAt, hideBelow: 'xl' },
  ]

  const treeColumns: Array<Column<TreeWardPosition>> = [
    { id: 'ward', header: t('Ward'), cell: (r) => <span className="font-medium text-ink-900">{wardName(r.wardId)}</span>, sortValue: (r) => wardName(r.wardId), searchValue: (r) => wardName(r.wardId), width: 'minmax(10rem,1.3fr)' },
    { id: 'surveyed', header: t('Trees surveyed'), cell: (r) => <span className="numeric">{formatNumber(r.treesSurveyed)}</span>, sortValue: (r) => r.treesSurveyed, align: 'right', hideBelow: 'md' },
    { id: 'canopy', header: t('Canopy cover'), cell: (r) => <span className="numeric">{r.canopyCoverPct}%</span>, sortValue: (r) => r.canopyCoverPct, align: 'right' },
    {
      id: 'openSpace',
      header: t('Open space / 1,000 residents'),
      cell: (r) => <span className="numeric">{r.openSpacePerThousandHa.toFixed(3)} ha</span>,
      sortValue: (r) => r.openSpacePerThousandHa,
      align: 'right',
      hideBelow: 'lg',
    },
    { id: 'pending', header: t('Felling pending'), cell: (r) => <span className="numeric">{r.fellingApplicationsPending}</span>, sortValue: (r) => r.fellingApplicationsPending, align: 'right', hideBelow: 'xl' },
    { id: 'granted', header: t('Permissions (12m)'), cell: (r) => <span className="numeric">{r.fellingPermissionsGranted12m}</span>, sortValue: (r) => r.fellingPermissionsGranted12m, align: 'right', hideBelow: 'md' },
    {
      id: 'compensatory',
      header: t('Compensatory planting (done / required)'),
      cell: (r) => {
        const pct = r.compensatoryPlantingCompleted / Math.max(1, r.compensatoryPlantingRequired)
        return (
          <span className={pct < 0.7 ? 'numeric font-semibold text-crit-600' : 'numeric text-ink-700'}>
            {formatNumber(r.compensatoryPlantingCompleted)}{' '}
            <span className="text-ink-400">/ {formatNumber(r.compensatoryPlantingRequired)}</span>
          </span>
        )
      },
      sortValue: (r) => r.compensatoryPlantingCompleted / Math.max(1, r.compensatoryPlantingRequired),
      align: 'right',
    },
    { id: 'survival', header: t('Survival rate'), cell: (r) => <span className="numeric">{r.survivalRatePct}%</span>, sortValue: (r) => r.survivalRatePct, align: 'right', hideBelow: 'lg' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        title={t('Gardens & Open Space')}
        description={t('Gardens, playgrounds and recreation grounds, open space per resident, and the Tree Authority\'s position on felling permissions against the compensatory planting that conditioned them.')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Gardens & Open Space') }]}
        freshness={freshness}
      />

      <DemonstrationNotice />

      <FilterBar show={['ward', 'search']} searchPlaceholder="Search gardens and open spaces" />

      <MetricGrid columns={4}>
        <MetricCard label={t('Open spaces')} value={filtered.length} support={t('{0} hectares maintained', totalArea)} icon={<Trees className="h-4 w-4" />} origin="demonstration" />
        <MetricCard
          label={t('Below condition threshold')}
          value={belowCondition}
          support={t('Condition under {0} of 100', CONDITION_THRESHOLD)}
          tone={belowCondition > 0 ? 'warn' : 'positive'}
        />
        <MetricCard
          label={t('Step-free entrances')}
          value={accessiblePct}
          unit="%"
          support={t('{0} of {1} spaces', accessible, filtered.length)}
          tone={accessiblePct < 60 ? 'warn' : 'positive'}
          icon={<MapPinned className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Encroachment reported')}
          value={encroached}
          support={t('Open spaces with a reported encroachment')}
          tone={encroached > 0 ? 'critical' : 'positive'}
        />
      </MetricGrid>

      <Card tone={plantingPct < 70 ? 'warn' : 'default'} className="flex items-start gap-3">
        <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-govt-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold text-ink-900">
            {t('{0} felling permissions granted · {1} of {2} compensatory trees planted', formatNumber(granted), formatNumber(completed), formatNumber(required))}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {t('{0} {1} applications are pending decision.', plantingShortfall > 0
              ? `${formatNumber(plantingShortfall)} trees remain unplanted against permissions already granted. A permission is conditional on the planting that was required for it, so this shortfall is an outstanding obligation of the Tree Authority rather than a target it has yet to reach.`
              : 'Compensatory planting is complete against every permission granted in the last twelve months.', formatNumber(pendingFelling))}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col">
          <p className="label-institutional mb-2">{t('Open space by kind')}</p>
          <div style={{ height: 200 }}>
            <DonutChart
              data={byKind.map((k) => ({ label: OPEN_SPACE_KIND_LABEL[k.kind], value: k.count, colour: KIND_COLOUR[k.kind] }))}
              centreValue={String(filtered.length)}
              centreLabel="spaces"
            />
          </div>
        </Card>

        <Card flush className="flex flex-col lg:col-span-2">
          <CardHeader
            bordered
            title={t('Compensatory planting shortfall by ward')}
            description={t('Trees required against permissions granted, and trees actually planted. Read together, never apart.')}
          />
          <div className="px-4 pb-4" style={{ height: 220 }}>
            <CategoryBarChart
              data={plantingByWard}
              showLegend
              series={[
                { key: 'required', label: t('Required'), colour: CHART_COLOURS.neutral },
                { key: 'completed', label: t('Planted'), colour: CHART_COLOURS.positive },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card flush>
        <CardHeader
          bordered
          icon={<MapPinned className="h-4 w-4" />}
          title={t('Wards with least open space per resident')}
          description={t('Hectares of maintained open space per thousand residents - the figure a development plan is judged against.')}
        />
        <div className="px-4 pb-4" style={{ height: Math.max(210, leastOpenSpace.length * 26) }}>
          <RankedBarChart
            data={leastOpenSpace.map((treeWardPosition) => ({ label: wardShortName(treeWardPosition.wardId), value: Math.round(treeWardPosition.openSpacePerThousandHa * 1000) / 1000 }))}
            unit=" ha"
            higherIsWorse={false}
          />
        </div>
      </Card>

      <Card flush>
        <CardHeader
          bordered
          icon={<Scissors className="h-4 w-4" />}
          title={t('Tree Authority position by ward')}
          description={t('Canopy, felling permissions and compensatory planting. Permissions and planting are never shown apart.')}
        />
        {trees.length === 0 ? (
          <EmptyState title={t('No ward positions in scope')} />
        ) : (
          <DataTable rows={trees} columns={treeColumns} rowKey={(r) => r.wardId} pageSize={12} />
        )}
      </Card>

      <Card flush>
        <CardHeader
          bordered
          icon={<Trees className="h-4 w-4" />}
          title={t('Open space register')}
          description={t('Every garden, playground and recreation ground within your authorised ward scope.')}
        />
        {filtered.length === 0 ? (
          <EmptyState title={t('No open spaces match the current filters')} detail="Clear a filter to widen the register." />
        ) : (
          <DataTable rows={filtered} columns={spaceColumns} rowKey={(r) => r.id} pageSize={15} />
        )}
      </Card>
    </PageBody>
  )
}

export default GardensIntelligencePage
