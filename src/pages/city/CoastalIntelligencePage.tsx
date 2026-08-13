import { useState } from 'react'
import { AlertTriangle, ArrowRight, Cloud, Droplets, Landmark, ShieldCheck, Siren, Trees, Waves } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Label,
  LinkButton,
  LoadingState,
  MetricGrid,
  Select,
  StateBadge,
  toneForScore,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { ChartFrame, CompositionBar, MiniBar, RankedBarChart } from '@/components/charts'
import { CityMap, wardMapPoint } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { hasCoastalJurisdiction, municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { CORPORATIONS, type CorporationRef } from '@/config/corporations'
import { coastalService } from '@/services/coastal.service'
import { monsoonService } from '@/services/monsoon.service'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useDrawerStore, useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { wardName } from '@/data/reference'
import type { CoastalSegment, TideWindow } from '@/types/city-domains'
import type { DataFreshness } from '@/types/common'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatDate, formatDateTime } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Coastal and shoreline segment intelligence - beaches, seawalls, mangroves,
 * creeks and promenades - read alongside tide behaviour and modelled
 * monsoon flood exposure.
 *
 * Most of Maharashtra's municipal corporations are landlocked.
 * For those, `hasCoastalJurisdiction` is false, the coastal queries are never
 * issued, and the page renders the not-applicable position instead: a coastal
 * module is a statement about what a corporation is responsible for, and
 * showing shoreline erosion or mangrove cover to a corporation with no
 * shoreline would be an invented jurisdiction, not a gap in the data.
 */

function build$COASTAL_TYPE_LABEL(): Record<CoastalSegment['type'], string> {
  return {
  beach: t('Beach'),
  seawall: t('Seawall'),
  mangrove: t('Mangrove'),
  creek: t('Creek'),
  promenade: t('Promenade'),
}
}
let COASTAL_TYPE_LABEL: Record<CoastalSegment['type'], string> = build$COASTAL_TYPE_LABEL()
registerLayer(() => {
  COASTAL_TYPE_LABEL = build$COASTAL_TYPE_LABEL()
})
const COASTAL_TYPES = Object.keys(COASTAL_TYPE_LABEL) as Array<CoastalSegment['type']>

function build$PROTECTION_LABEL(): Record<CoastalSegment['protectionStatus'], string> {
  return {
  protected: t('Protected'),
  'partially-protected': t('Partially Protected'),
  unprotected: t('Unprotected'),
}
}
let PROTECTION_LABEL: Record<CoastalSegment['protectionStatus'], string> = build$PROTECTION_LABEL()
registerLayer(() => {
  PROTECTION_LABEL = build$PROTECTION_LABEL()
})
const PROTECTION_TONE: Record<CoastalSegment['protectionStatus'], 'positive' | 'warn' | 'critical'> = {
  protected: 'positive',
  'partially-protected': 'warn',
  unprotected: 'critical',
}
const PROTECTION_COLOUR: Record<CoastalSegment['protectionStatus'], string> = {
  protected: 'var(--color-ok-500)',
  'partially-protected': 'var(--color-warn-500)',
  unprotected: 'var(--color-crit-500)',
}
const PROTECTION_STATUSES = Object.keys(PROTECTION_LABEL) as Array<CoastalSegment['protectionStatus']>

/** High vulnerability threshold used to flag segments in the tide cross-reference panel. */
const HIGH_VULNERABILITY_THRESHOLD = 65

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

// Query keys for this domain: `@/app/queryClient` does not yet define a
// `coastal` key factory (this page's data source landed after that file was
// last touched), so literal keys following the same `['bmc-mii', domain,
// scope]` convention are used here instead of editing a file outside this
// page's ownership.
const COASTAL_SEGMENTS_KEY = ['bmc-mii', 'coastal', 'segments'] as const
const COASTAL_SUMMARY_KEY = ['bmc-mii', 'coastal', 'summary'] as const

/* ==========================================================================
   Not-applicable position - corporations with no coastal jurisdiction
   ========================================================================== */

/** How many of the deployable corporations actually hold a coastal jurisdiction. */
const COASTAL_CORPORATION_COUNT = CORPORATIONS.filter(hasCoastalJurisdiction).length

/**
 * How the corporation's physical form is described in the not-applicable copy.
 * Each phrase completes "... is <phrase>", and each is true of every
 * corporation carrying that form type. The coastal and creek-side entries are
 * never reached here - they are the two forms that hold a coastal jurisdiction
 * - but the map stays exhaustive so a new form type cannot slip through.
 */
const FORM_PHRASE: Record<CorporationRef['form']['type'], string> = {
  coastal: 'a sea-facing corporation',
  'creek-side': 'a corporation with tidal creek frontage',
  riverine: 'a river-basin corporation',
  lakeside: 'a lake-and-river corporation',
  inland: 'a fully inland corporation',
  hill: 'a hill corporation',
}

/** The modules that carry the water this corporation is actually responsible for. */
function build$WATER_MODULE_ROUTES(): Array<{
  to: string
  label: string
  icon: React.JSX.Element
  detail: string
}> {
  return [
  {
    to: ROUTES.stormwater,
    label: t('Storm Water Intelligence'),
    icon: <Cloud className="h-4 w-4" />,
    detail:
      t('Nallahs, drains, culverts and pumping station readiness - the network that carries rainfall off the city and into these water bodies.'),
  },
  {
    to: ROUTES.monsoon,
    label: t('Monsoon Intelligence'),
    icon: <Siren className="h-4 w-4" />,
    detail:
      t('Flood risk, ward readiness and compound-event scenarios, including the river and drain behaviour that governs inundation here.'),
  },
  {
    to: ROUTES.environment,
    label: t('Environment Intelligence'),
    icon: <Trees className="h-4 w-4" />,
    detail:
      t('Air, noise and environmental compliance, including the discharge and pollution position on the corporation\'s own water bodies.'),
  },
]
}
let WATER_MODULE_ROUTES: Array<{
  to: string
  label: string
  icon: React.JSX.Element
  detail: string
}> = build$WATER_MODULE_ROUTES()
registerLayer(() => {
  WATER_MODULE_ROUTES = build$WATER_MODULE_ROUTES()
})

function CoastalNotApplicable({ corporation }: { corporation: CorporationRef }): React.JSX.Element {
  const waterBodies = corporation.form.waterBodies

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Coastal Intelligence') }]}
        meta={<Badge tone="neutral">{t('Not applicable to this corporation')}</Badge>}
      />

      <Card tone="info">
        <div className="flex items-start gap-3.5">
          <span
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-govt-100 text-govt-700 ring-1 ring-govt-200 ring-inset"
            aria-hidden
          >
            <Landmark className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{t('No coastal zone falls under this jurisdiction')}</h2>
            <p className="mt-1.5 max-w-3xl text-[0.8125rem] leading-relaxed text-ink-700">
              {t('{0} is {1} in the {2} division. Its municipal limits contain no sea shoreline and no tidal creek, so the corporation holds no coastal zone jurisdiction: no beaches, seawalls, mangrove belts or shoreline promenades sit on its asset register, and no Coastal Regulation Zone obligation applies to it.', corporation.name, FORM_PHRASE[corporation.form.type], corporation.division)}
            </p>
            <p className="mt-2.5 max-w-3xl text-[0.8125rem] leading-relaxed text-ink-700">
              {t('This screen is deliberately empty of figures. Shoreline vulnerability, mangrove cover or tide windows rendered here would describe a coast this corporation does not have. A module is a statement about what an institution is answerable for, and the platform does not manufacture jurisdiction to fill a screen.')}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Droplets className="h-4 w-4" />}
          title={t('Water bodies this corporation does manage')}
          description={t('The rivers, creeks, lakes and reservoirs recorded against this corporation in the reference roster. These are its published water features, not a coastal inventory.')}
        />
        {waterBodies.length > 0 ? (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {waterBodies.map((body) => (
              <li
                key={body}
                className="flex items-start gap-2 rounded-lg border border-ink-100 bg-surface-sunken px-3 py-2.5"
              >
                <Waves className="mt-0.5 h-3.5 w-3.5 shrink-0 text-govt-500" aria-hidden />
                <span className="min-w-0 text-[0.8125rem] leading-snug text-ink-800">{body}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="mt-3"
            compact
            icon={<Droplets className="h-4 w-4" />}
            title={t('No named water bodies recorded')}
            detail={`The reference roster carries no published rivers, creeks or lakes for ${municipality.shortName}. Nothing has been invented in their place.`}
          />
        )}
        {corporation.form.greenBelt ? (
          <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
            {t('Protected green cover on record: {0}.', corporation.form.greenBelt)}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="h-4 w-4" />}
          title={t('Where this corporation\'s water is covered')}
          description={t('The three modules that carry the drainage, flood and environmental position for the water bodies above. Nothing on this page is duplicated there - these are the surfaces that hold the real work.')}
        />
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {WATER_MODULE_ROUTES.map((module) => (
            <div
              key={module.to}
              className="flex min-w-0 flex-col rounded-lg border border-ink-100 bg-surface-sunken p-3.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-govt-50 text-govt-600 ring-1 ring-govt-100 ring-inset"
                  aria-hidden
                >
                  {module.icon}
                </span>
                <p className="min-w-0 truncate text-[0.8125rem] font-semibold text-ink-900">{module.label}</p>
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-600">{module.detail}</p>
              <LinkButton
                to={module.to}
                variant="outline"
                size="xs"
                className="mt-3 self-start"
                iconRight={<ArrowRight className="h-3 w-3" />}
              >
                {t('Open')}
              </LinkButton>
            </div>
          ))}
        </div>
      </Card>

      <Card tone="sunken">
        <p className="text-[0.6875rem] leading-relaxed text-ink-500">
          {t('Coastal Intelligence is enabled only where the corporation&apos;s recorded physical form is coastal or creek-side. {0} of the {1} municipal corporations this build can be deployed against meet that test; the rest, this one among them, see this position instead. Switching the active corporation from the deployment selector in the command bar re-evaluates it.', COASTAL_CORPORATION_COUNT, CORPORATIONS.length)}
        </p>
      </Card>

      <DemonstrationNotice />
    </PageBody>
  )
}

/* ==========================================================================
   Page
   ========================================================================== */

export function CoastalIntelligencePage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)
  const corporation = useActiveCorporation()
  const [typeFilter, setTypeFilter] = useState<'all' | CoastalSegment['type']>('all')
  const [protectionFilter, setProtectionFilter] = useState<'all' | CoastalSegment['protectionStatus']>('all')

  // A landlocked corporation must never issue these reads. The coastal service
  // does not throw for one - it filters and would return whatever shoreline
  // records the seed layer holds - which is precisely why the guard sits here:
  // the page must not be able to render another city's coastline at all.
  const coastal = hasCoastalJurisdiction(corporation)

  // Stated once, here, rather than in each branch: the not-applicable position
  // is a different reading of the same screen, and the masthead has to carry
  // whichever one is on show. Declaring it in the child would lose the race —
  // child effects run before the parent's, so the parent would overwrite it.
  usePageMasthead(
    t('Coastal Intelligence'),
    coastal
      ? t('Shoreline segment-level exposure - beaches, seawalls, mangroves, creeks and promenades - read alongside tide behaviour and modelled monsoon flood exposure.')
      : t('Coastal zone management covers the sea shoreline and tidal creek frontage a municipal corporation is responsible for. {0} has neither within its limits, so this module states that position rather than presenting a coastline the corporation does not hold.', municipality.shortName),
  )

  const segmentsQuery = useServiceQuery(COASTAL_SEGMENTS_KEY, (u) => coastalService.segments(u), { enabled: coastal })
  const summaryQuery = useServiceQuery(COASTAL_SUMMARY_KEY, (u) => coastalService.coastalSummary(u), {
    enabled: coastal,
  })
  const tidesQuery = useServiceQuery(queryKeys.monsoon('tides'), (u) => monsoonService.tides(u), { enabled: coastal })

  if (!coastal) return <CoastalNotApplicable corporation={corporation} />

  if (segmentsQuery.isLoading || summaryQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Coastal Intelligence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={8} />
      </PageBody>
    )
  }
  if (segmentsQuery.error || summaryQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Coastal Intelligence') }]} />
        <ErrorState
          detail={(segmentsQuery.error ?? summaryQuery.error)?.message}
          onRetry={() => {
            void segmentsQuery.refetch()
            void summaryQuery.refetch()
          }}
        />
      </PageBody>
    )
  }

  const segments = segmentsQuery.data ?? []
  const summary = summaryQuery.data
  const tides = tidesQuery.data ?? []

  if (segments.length === 0 || !summary) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Coastal Intelligence') }]} />
        <EmptyState title={t('No coastal segments available')} detail="No shoreline segment records are held for this corporation. This is a record availability gap, not a permission restriction." />
        <DemonstrationNotice />
      </PageBody>
    )
  }

  const filteredSegments = segments.filter((s) => {
    if (typeFilter !== 'all' && s.type !== typeFilter) return false
    if (protectionFilter !== 'all' && s.protectionStatus !== protectionFilter) return false
    if (filters.wardIds.length > 0 && !filters.wardIds.some((id) => s.wardIds.includes(id))) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      const matchesName = s.name.toLowerCase().includes(q)
      const matchesWard = s.wardIds.some((id) => wardName(id).toLowerCase().includes(q))
      if (!matchesName && !matchesWard) return false
    }
    return true
  })

  const byProtection = PROTECTION_STATUSES.map((status) => {
    const rows = segments.filter((s) => s.protectionStatus === status)
    return {
      status,
      count: rows.length,
      lengthKm: round1(rows.reduce((s, x) => s + x.lengthKm, 0)),
      avgVulnerability: rows.length > 0 ? Math.round(rows.reduce((s, x) => s + x.vulnerabilityIndex, 0) / rows.length) : 0,
    }
  })

  const wardVulnerability = new Map<string, number[]>()
  for (const s of segments) {
    for (const wardId of s.wardIds) {
      const arr = wardVulnerability.get(wardId) ?? []
      arr.push(s.vulnerabilityIndex)
      wardVulnerability.set(wardId, arr)
    }
  }
  const avgWardVulnerability = (wardId: string): number | undefined => {
    const arr = wardVulnerability.get(wardId)
    if (!arr || arr.length === 0) return undefined
    return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
  }
  const coastalWardIds = Array.from(wardVulnerability.keys())

  const blockingTides = tides.filter((tideWindow) => tideWindow.blocksDischarge)
  const highRiskUnprotected = segments
    .filter((s) => s.vulnerabilityIndex >= HIGH_VULNERABILITY_THRESHOLD && s.protectionStatus !== 'protected')
    .sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex)

  const latestTide = tides.length > 0 ? tides.reduce((max, tideWindow) => (tideWindow.at > max.at ? tideWindow : max), tides[0]!) : undefined
  const freshness: DataFreshness | undefined = latestTide
    ? {
        generatedAt: DEMO_NOW.toISOString(),
        sourceObservedAt: latestTide.at,
        refreshIntervalMinutes: 60,
        origin: 'demonstration',
        sourceState: 'operational',
        stale: false,
      }
    : undefined

  const segmentColumns: Array<Column<CoastalSegment>> = [
    { id: 'name', header: t('Segment'), cell: (r) => <span className="font-medium text-ink-900">{r.name}</span>, sortValue: (r) => r.name, searchValue: (r) => r.name },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone="neutral">{COASTAL_TYPE_LABEL[r.type]}</Badge>, sortValue: (r) => r.type },
    {
      id: 'wards',
      header: t('Wards served'),
      cell: (r) => r.wardIds.map((id) => wardName(id)).join(', '),
      sortValue: (r) => r.wardIds.length,
      searchValue: (r) => r.wardIds.map((id) => wardName(id)).join(' '),
      hideBelow: 'md',
    },
    { id: 'length', header: t('Length'), cell: (r) => `${r.lengthKm} km`, sortValue: (r) => r.lengthKm, align: 'right', hideBelow: 'sm' },
    {
      id: 'vulnerability',
      header: t('Vulnerability'),
      cell: (r) => (
        <div className="min-w-[6rem]">
          <span className="numeric text-xs font-semibold text-ink-800">{r.vulnerabilityIndex}</span>
          <MiniBar value={r.vulnerabilityIndex} tone={toneForScore(r.vulnerabilityIndex, false)} width={76} className="mt-0.5" />
        </div>
      ),
      sortValue: (r) => r.vulnerabilityIndex,
    },
    { id: 'protection', header: t('Protection status'), cell: (r) => <Badge tone={PROTECTION_TONE[r.protectionStatus]}>{PROTECTION_LABEL[r.protectionStatus]}</Badge>, sortValue: (r) => r.protectionStatus },
    { id: 'mangrove', header: t('Mangrove cover'), cell: (r) => `${r.mangroveCoverHa} ha`, sortValue: (r) => r.mangroveCoverHa, align: 'right', hideBelow: 'lg' },
    { id: 'inundation', header: t('Inundation exposure'), cell: (r) => `${r.inundationExposureHa} ha`, sortValue: (r) => r.inundationExposureHa, align: 'right', hideBelow: 'xl' },
    { id: 'surveyed', header: t('Last surveyed'), cell: (r) => formatDate(r.lastSurveyedAt), sortValue: (r) => r.lastSurveyedAt, hideBelow: 'lg' },
    { id: 'state', header: t('State'), cell: (r) => <StateBadge state={r.state} />, sortValue: (r) => r.state },
  ]

  const tideColumns: Array<Column<TideWindow>> = [
    { id: 'at', header: t('Window'), cell: (r) => formatDateTime(r.at), sortValue: (r) => r.at },
    { id: 'type', header: t('Type'), cell: (r) => <Badge tone={r.type === 'high' ? 'info' : 'muted'}>{r.type === 'high' ? 'High tide' : 'Low tide'}</Badge>, sortValue: (r) => r.type },
    { id: 'height', header: t('Height'), cell: (r) => `${r.heightM} m`, sortValue: (r) => r.heightM, align: 'right' },
    {
      id: 'blocks',
      header: t('Discharge status'),
      cell: (r) => (r.blocksDischarge ? <Badge tone="critical">{t('Blocks gravity discharge')}</Badge> : <Badge tone="positive">{t('Discharge unobstructed')}</Badge>),
      sortValue: (r) => (r.blocksDischarge ? 1 : 0),
    },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Coastal Intelligence') }]}
        freshness={freshness}
      />

      <MetricGrid columns={3}>
        <MetricCard label={t('Protected length')} value={`${summary.protectedKm} km`} support={t('of {0} km total coastline', summary.totalLengthKm)} icon={<ShieldCheck className="h-4 w-4" />} />
        <MetricCard label={t('Unprotected segments')} value={summary.unprotectedSegments} support={t('of {0} segments', segments.length)} tone={summary.unprotectedSegments > 0 ? 'critical' : 'default'} />
        <MetricCard label={t('Mean vulnerability index')} value={summary.meanVulnerability} unit="/100" tone={summary.meanVulnerability >= 65 ? 'critical' : summary.meanVulnerability >= 45 ? 'warn' : 'default'} icon={<Waves className="h-4 w-4" />} />
        <MetricCard label={t('Mangrove cover')} value={summary.mangroveCoverHa} unit="ha" icon={<Trees className="h-4 w-4" />} />
        <MetricCard label={t('Modelled inundation exposure')} value={summary.inundationExposureHa} unit="ha" support={t('1m sea-level scenario')} />
        <MetricCard label={t('Segments requiring re-survey')} value={summary.segmentsRequiringSurvey} support={t('Last surveyed over two years ago')} tone={summary.segmentsRequiringSurvey > 0 ? 'warn' : 'default'} />
      </MetricGrid>

      {/* Two columns, read downward. The shoreline register and the two
          surfaces that qualify it — where the segments sit, and what a high
          tide does to them — carry the width. The protection standing and the
          ranked vulnerability read beside them, not underneath. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <Card flush>
            <CardHeader
              className="px-4 pt-4 pb-3"
              title={t('Coastal segment register')}
              description={t('Sortable and filterable by type, protection status and ward. Select a row to open the ward profile for its primary ward.')}
            />
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              <FilterBar show={['ward', 'search']} searchPlaceholder="Search segment or ward" compact />
              <div className="flex items-center gap-1.5">
                <Label className="mb-0 whitespace-nowrap">{t('Type')}</Label>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | CoastalSegment['type'])}
                  className="w-auto min-w-[9rem]"
                  options={[{ value: 'all', label: t('All types') }, ...COASTAL_TYPES.map((entry) => ({ value: entry, label: COASTAL_TYPE_LABEL[entry] }))]}
                  aria-label={t('Filter by segment type')}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="mb-0 whitespace-nowrap">{t('Protection')}</Label>
                <Select
                  value={protectionFilter}
                  onChange={(e) => setProtectionFilter(e.target.value as 'all' | CoastalSegment['protectionStatus'])}
                  className="w-auto min-w-[10.5rem]"
                  options={[{ value: 'all', label: t('All protection statuses') }, ...PROTECTION_STATUSES.map((p) => ({ value: p, label: PROTECTION_LABEL[p] }))]}
                  aria-label={t('Filter by protection status')}
                />
              </div>
            </div>
            {filteredSegments.length === 0 ? (
              <EmptyState className="m-4" title={t('No segments match the current filters')} detail="Adjust the type, protection status, ward or search term above." />
            ) : (
              <DataTable
                rows={filteredSegments}
                columns={segmentColumns}
                rowKey={(r) => r.id}
                onRowClick={(r) => {
                  const wardId = r.wardIds[0]
                  if (wardId) openDrawer({ kind: 'ward', id: wardId })
                }}
                pageSize={12}
                searchable={false}
                initialSort={{ columnId: 'vulnerability', direction: 'desc' }}
                ariaLabel="Coastal segment register"
              />
            )}
          </Card>

          <Card>
            <CardHeader title={t('Coastal ward map')} description={t('Ward shading reflects the average vulnerability index of the coastal segments recorded within it; markers mark wards carrying at least one coastal segment.')} />
            <div className="mt-3">
              <CityMap
                layers={[
                  {
                    id: 'segment-vulnerability',
                    label: t('Coastal Segment Vulnerability'),
                    valueFor: avgWardVulnerability,
                    higherIsWorse: true,
                    unit: '/100',
                    description: t('Average vulnerability index across coastal segments recorded in the ward. Wards with no coastal segment show no data.'),
                  },
                ]}
                markers={coastalWardIds.map((wardId) => {
                  const point = wardMapPoint(wardId)
                  const segmentCount = segments.filter((s) => s.wardIds.includes(wardId)).length
                  return {
                    id: wardId,
                    x: point.x,
                    y: point.y,
                    label: wardName(wardId),
                    detail: t('Vulnerability {0}/100 · {1} segment{2}', avgWardVulnerability(wardId) ?? '-', segmentCount, segmentCount === 1 ? '' : 's'),
                    kind: 'hotspot',
                    onClick: () => openDrawer({ kind: 'ward', id: wardId }),
                  }
                })}
                height={340}
                showLabels={false}
              />
            </div>
          </Card>

          <Card>
            <CardHeader icon={<AlertTriangle className="h-4 w-4" />} title={t('Coastal vulnerability, high tide and monsoon flood exposure')} description={t('A modelled exposure relationship, not a prediction of any specific flooding event.')} />
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
              <div>
                {tidesQuery.isLoading ? (
                  <LoadingState variant="block" rows={3} />
                ) : tidesQuery.error ? (
                  <ErrorState detail={tidesQuery.error.message} onRetry={() => tidesQuery.refetch()} />
                ) : tides.length === 0 ? (
                  <EmptyState compact title={t('No tide windows available')} detail="No tide window observations are held for this corporation." />
                ) : (
                  <DataTable rows={[...tides].sort((a, b) => (a.at < b.at ? -1 : 1))} columns={tideColumns} rowKey={(r) => r.id} searchable={false} pageSize={8} ariaLabel="Tide windows" dense />
                )}
              </div>
              <div className="rounded-[2px] border border-ink-100 bg-surface-sunken p-3">
                <p className="label-institutional">{t('High tide windows blocking discharge')}</p>
                <p className="numeric mt-1 text-2xl font-semibold text-ink-900">{blockingTides.length}</p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-400">{t('of {0} recorded windows', tides.length)}</p>

                <div className="mt-3 border-t border-ink-100 pt-2.5">
                  <p className="label-institutional">{t('Elevated vulnerability, not fully protected')}</p>
                  <p className="numeric mt-1 text-lg font-semibold text-ink-900">{highRiskUnprotected.length} segment{highRiskUnprotected.length === 1 ? '' : 's'}</p>
                  {highRiskUnprotected.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {highRiskUnprotected.slice(0, 5).map((s) => (
                        <li key={s.id} className="text-[0.6875rem] leading-relaxed text-ink-600">
                          · {s.name} <span className="text-ink-400">({s.vulnerabilityIndex}/100, {PROTECTION_LABEL[s.protectionStatus]})</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <p className="mt-3 border-t border-ink-100 pt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
                  {t('When a high tide coincides with monsoon rainfall, gravity discharge from storm-water outfalls near the shoreline is obstructed. Segments carrying an elevated vulnerability index that are not fully protected are structurally more exposed under this combination. This is presented as a modelled association between tide behaviour and segment vulnerability - it is')}{' '}<span className="font-medium text-ink-700">{t('not a forecast')}</span>{' '}{t('of when or where flooding will occur.')}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader title={t('Protection works status')} description={t('Coastline length and segment count by protection status, with the average vulnerability index recorded within each.')} />
            <div className="mt-3">
              <p className="label-institutional mb-2">{t('Length by protection status')}</p>
              <CompositionBar
                segments={byProtection.map((p) => ({ id: p.status, label: PROTECTION_LABEL[p.status], value: p.lengthKm, colour: PROTECTION_COLOUR[p.status] }))}
              />
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {byProtection.map((p) => (
                  <div key={p.status} className="rounded-[2px] border border-ink-100 bg-surface-sunken p-2.5">
                    <Badge tone={PROTECTION_TONE[p.status]}>{PROTECTION_LABEL[p.status]}</Badge>
                    <p className="numeric mt-1.5 text-sm font-semibold text-ink-900">
                      {p.count} segment{p.count === 1 ? '' : 's'} <span className="font-normal text-ink-400">{t('· {0} km', p.lengthKm)}</span>
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-ink-500">{t('Avg. vulnerability {0}/100', p.avgVulnerability)}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('Vulnerability ranking')} description={t('Every coastal segment ranked by modelled vulnerability index.')} />
            <div className="mt-3">
              <ChartFrame title={t('Segment vulnerability')} unit={t('Vulnerability index (0–100)')} timeframe="Most recent survey" height={Math.max(180, segments.length * 22)}>
                <RankedBarChart
                  data={[...segments]
                    .sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex)
                    .map((s) => ({ label: s.name.length > 22 ? `${s.name.slice(0, 20)}…` : s.name, value: s.vulnerabilityIndex }))}
                />
              </ChartFrame>
            </div>
          </Card>
        </div>
      </div>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default CoastalIntelligencePage
