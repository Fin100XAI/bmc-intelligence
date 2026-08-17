import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertOctagon,
  ChevronRight,
  LayoutGrid,
  ListChecks,
  MapPin,
  Plus,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import {
  Badge,
  Button,
  DataTable,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  MetricGrid,
  Modal,
  SegmentedControl,
  Select,
  SeverityBadge,
  SeverityRail,
  Tabs,
  Textarea,
  type Column,
} from '@/components/ui'
import { MetricCard } from '@/components/cards'
import { IncidentCard } from '@/components/cards/domain-cards'
import { GovPanel } from '@/components/gov/GovPanel'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { FilterBar } from '@/components/filters/FilterBar'
import { useServiceQuery, useServiceAction } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { incidentService, type IncidentCreateInput } from '@/services/incident.service'
import { useCurrentUser } from '@/stores/auth.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useDrawerStore, useFilterStore } from '@/stores/ui.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { WARDS, WARD_BY_ID, departmentName, officerDisplayName, wardName } from '@/data/reference'
import type { DataFreshness, Severity } from '@/types/common'
import { SEVERITY_LABEL } from '@/types/common'
import {
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  type Incident,
  type IncidentStatus,
  type IncidentType,
} from '@/types/operations'
import { DEMO_NOW } from '@/utils/deterministic'
import { formatCompact, formatRelative, sanitiseText } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Unified incident register across every incident type the platform
 * recognises. This is the operational spine that "Detect → Validate →
 * Classify → Assign → Respond → Escalate → Resolve → Review" describes:
 * every record raised anywhere in the platform - flood, fire, structural,
 * infrastructure, weather, public health, road or utility - lands here with
 * a named owner and an auditable lifecycle.
 */

const STATUS_ORDER: IncidentStatus[] = ['detected', 'validated', 'active', 'contained', 'resolved', 'reviewed']
const INCIDENT_TYPES: IncidentType[] = [
  'flood',
  'fire',
  'building-collapse',
  'infrastructure-failure',
  'extreme-weather',
  'public-health',
  'road-disruption',
  'utility-incident',
]
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

/** Reasonable owning department per incident type, mirroring the mapping the
 * incident service itself uses to resolve an `IntelligenceDomain`. */
const INCIDENT_TYPE_DEPARTMENT: Record<IncidentType, string> = {
  flood: 'dept-disaster',
  fire: 'dept-fire',
  'building-collapse': 'dept-building',
  'infrastructure-failure': 'dept-estates',
  'extreme-weather': 'dept-disaster',
  'public-health': 'dept-health',
  'road-disruption': 'dept-roads',
  'utility-incident': 'dept-hydraulic',
}

function build$WORKFLOW_STAGES(): Array<{ id: string; label: string; description: string; countKey?: IncidentStatus[] }> {
  return [
  { id: 'detect', label: t('Detect'), description: t('A report, sensor signal or field observation is logged.'), countKey: ['detected'] },
  { id: 'validate', label: t('Validate'), description: t('Control room confirms the report against a second source.'), countKey: ['validated'] },
  { id: 'classify', label: t('Classify'), description: t('Type, severity and owning department are confirmed.') },
  { id: 'assign', label: t('Assign'), description: t('An accountable owner and response teams are named.') },
  { id: 'respond', label: t('Respond'), description: t('Teams are active on site; the incident is under management.'), countKey: ['active', 'contained'] },
  { id: 'escalate', label: t('Escalate'), description: t('Severity or authority level is raised where required.') },
  { id: 'resolve', label: t('Resolve'), description: t('Normal service is restored at the affected location.'), countKey: ['resolved'] },
  { id: 'review', label: t('Review'), description: t('Post-incident review records lessons for preparedness.'), countKey: ['reviewed'] },
]
}
let WORKFLOW_STAGES: Array<{ id: string; label: string; description: string; countKey?: IncidentStatus[] }> = build$WORKFLOW_STAGES()
registerLayer(() => {
  WORKFLOW_STAGES = build$WORKFLOW_STAGES()
})

function statusTone(status: IncidentStatus): 'critical' | 'warn' | 'positive' | 'neutral' {
  if (status === 'active') return 'critical'
  if (status === 'contained') return 'warn'
  if (status === 'resolved' || status === 'reviewed') return 'positive'
  return 'neutral'
}

interface CreateFormState {
  title: string
  type: IncidentType
  severity: Severity
  wardId: string
  locationName: string
  description: string
}

const EMPTY_FORM: CreateFormState = {
  title: '',
  type: 'infrastructure-failure',
  severity: 'medium',
  wardId: WARDS[0]?.id ?? '',
  locationName: '',
  description: '',
}

export function DisasterIntelligencePage(): React.JSX.Element {
  const user = useCurrentUser()
  const activeCorporation = useActiveCorporation()
  const openDrawer = useDrawerStore((s) => s.open)
  const filters = useFilterStore((s) => s.filters)
  const [searchParams, setSearchParams] = useSearchParams()

  usePageMasthead(t('Disaster Intelligence - Unified Incident Register'))

  const [view, setView] = useState<'table' | 'cards'>('table')
  const [statusTab, setStatusTab] = useState<'all' | IncidentStatus>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | IncidentType>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const incidentsQuery = useServiceQuery(queryKeys.incidents(), (u) => incidentService.list(u, { pageSize: 500 }))

  const createIncident = useServiceAction(
    (u, input: IncidentCreateInput) => incidentService.create(u, input),
    [queryKeys.incidents()],
  )

  // Open the incident named in ?incident=<id> once, on mount.
  const openedFromUrl = useRef(false)
  useEffect(() => {
    if (openedFromUrl.current) return
    openedFromUrl.current = true
    const incidentId = searchParams.get('incident')
    if (incidentId) openDrawer({ kind: 'incident', id: incidentId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ?action=create opens the create modal, then the parameter is cleared.
  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setCreateOpen(true)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('action')
          return next
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  if (incidentsQuery.isLoading) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Disaster Intelligence') }]} />
        <LoadingState variant="metrics" />
        <LoadingState variant="table" rows={6} />
      </PageBody>
    )
  }
  if (incidentsQuery.error) {
    return (
      <PageBody>
        <PageHeader eyebrow={t('City Intelligence')} breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Disaster Intelligence') }]} />
        <ErrorState detail={incidentsQuery.error.message} onRetry={() => incidentsQuery.refetch()} />
      </PageBody>
    )
  }

  const items = incidentsQuery.data?.items ?? []
  const canCreate = allowed(user, 'incident', 'create')

  /**
   * The scope everything on this screen is read against: the ward, type and
   * severity the operator has selected, but NOT the status tab.
   *
   * The distinction matters twice over. The status tab selects which incidents
   * the LIST shows, so folding it in here would empty the tabs' own counts and
   * leave a tile headed "Critical open" answering whichever tab was last
   * clicked. Everything else must fold in, and did not: the tiles and the tab
   * counts were computed over the full register, so narrowing to a ward emptied
   * the list and the map while "population affected" and "teams deployed" above
   * them went on reporting the whole corporation - and any two wards holding no
   * open incident rendered identically to each other, which reads as a ward
   * filter that did nothing.
   */
  const inScope = items.filter((incident) => {
    if (typeFilter !== 'all' && incident.type !== typeFilter) return false
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(incident.wardId)) return false
    if (filters.severities.length > 0 && !filters.severities.includes(incident.severity)) return false
    return true
  })

  const countsByStatus = STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = inScope.filter((i) => i.status === s).length
      return acc
    },
    {} as Record<IncidentStatus, number>,
  )

  const tabItems = [
    { id: 'all', label: t('All incidents'), count: inScope.length },
    ...STATUS_ORDER.map((s) => ({ id: s, label: INCIDENT_STATUS_LABEL[s], count: countsByStatus[s] })),
  ]

  const filtered = inScope.filter((incident) => {
    if (statusTab !== 'all' && incident.status !== statusTab) return false
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      if (
        !incident.title.toLowerCase().includes(q) &&
        !incident.description.toLowerCase().includes(q) &&
        !incident.locationName.toLowerCase().includes(q)
      ) {
        return false
      }
    }
    return true
  })

  /** The single ward in scope, where exactly one is selected. */
  const selectedWard = filters.wardIds.length === 1 ? (WARD_BY_ID.get(filters.wardIds[0] as string) ?? null) : null

  const openIncidents = inScope.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed')
  const criticalOpen = openIncidents.filter((i) => i.severity === 'critical').length
  const totalAffected = openIncidents.reduce((sum, i) => sum + i.affectedPopulation, 0)
  const teamsDeployed = openIncidents.reduce(
    (sum, i) => sum + i.responseTeams.filter((responseTeam) => responseTeam.status === 'deployed' || responseTeam.status === 'en-route').length,
    0,
  )

  const openLoadByWard = new Map<string, number>()
  for (const incident of openIncidents) {
    openLoadByWard.set(incident.wardId, (openLoadByWard.get(incident.wardId) ?? 0) + 1)
  }

  const wardMarkerIndex = new Map<string, number>()
  const markers: MapMarker[] = filtered.map((incident) => {
    const idx = wardMarkerIndex.get(incident.wardId) ?? 0
    wardMarkerIndex.set(incident.wardId, idx + 1)
    const point = jitteredWardPoint(incident.wardId, idx)
    return {
      id: incident.id,
      x: point.x,
      y: point.y,
      label: incident.title,
      detail: `${INCIDENT_TYPE_LABEL[incident.type]} · ${INCIDENT_STATUS_LABEL[incident.status]} · ${wardName(incident.wardId)}`,
      severity: incident.severity,
      kind: 'incident',
      onClick: () => openDrawer({ kind: 'incident', id: incident.id }),
    }
  })

  const latestUpdate = items.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), items[0]?.updatedAt ?? DEMO_NOW.toISOString())
  const freshness: DataFreshness = {
    generatedAt: DEMO_NOW.toISOString(),
    sourceObservedAt: latestUpdate,
    refreshIntervalMinutes: 15,
    origin: 'demonstration',
    sourceState: 'operational',
    stale: false,
  }

  const columns: Array<Column<Incident>> = [
    {
      id: 'reference',
      header: t('Reference'),
      cell: (row) => <span className="font-mono text-[0.6875rem] text-ink-500">{row.reference}</span>,
      sortValue: (row) => row.reference,
      width: '9rem',
    },
    {
      id: 'title',
      header: t('Title'),
      cell: (row) => <span className="font-medium text-ink-900">{row.title}</span>,
      sortValue: (row) => row.title,
      searchValue: (row) => `${row.title} ${row.description}`,
    },
    {
      id: 'type',
      header: t('Type'),
      cell: (row) => <Badge tone="neutral">{INCIDENT_TYPE_LABEL[row.type]}</Badge>,
      sortValue: (row) => INCIDENT_TYPE_LABEL[row.type],
      hideBelow: 'md',
    },
    {
      id: 'severity',
      header: t('Severity'),
      cell: (row) => <SeverityBadge severity={row.severity} />,
      sortValue: (row) => row.severity,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {INCIDENT_STATUS_LABEL[row.status]}
        </Badge>
      ),
      sortValue: (row) => row.status,
    },
    {
      id: 'ward',
      header: t('Ward'),
      cell: (row) => wardName(row.wardId),
      sortValue: (row) => wardName(row.wardId),
      hideBelow: 'sm',
    },
    {
      id: 'location',
      header: t('Location'),
      cell: (row) => <span className="truncate text-ink-600">{row.locationName}</span>,
      sortValue: (row) => row.locationName,
      hideBelow: 'lg',
    },
    {
      id: 'affected',
      header: t('Affected (est.)'),
      cell: (row) => formatCompact(row.affectedPopulation),
      sortValue: (row) => row.affectedPopulation,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      id: 'teams',
      header: t('Teams'),
      cell: (row) => row.responseTeams.length,
      sortValue: (row) => row.responseTeams.length,
      align: 'center',
      hideBelow: 'xl',
    },
    {
      id: 'detected',
      header: t('Detected'),
      cell: (row) => formatRelative(row.detectedAt),
      sortValue: (row) => row.detectedAt,
      align: 'right',
      hideBelow: 'md',
    },
    {
      id: 'owner',
      header: t('Owner'),
      cell: (row) => officerDisplayName(row.ownerId),
      sortValue: (row) => officerDisplayName(row.ownerId),
      hideBelow: 'xl',
    },
  ]

  function updateForm<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const formValid = form.title.trim().length >= 4 && form.description.trim().length >= 12 && form.locationName.trim().length >= 3

  async function handleCreate(): Promise<void> {
    setSubmitAttempted(true)
    if (!formValid) return
    const input: IncidentCreateInput = {
      title: sanitiseText(form.title, 160),
      description: sanitiseText(form.description, 2000),
      type: form.type,
      severity: form.severity,
      wardId: form.wardId,
      locationName: sanitiseText(form.locationName, 160),
      departmentId: INCIDENT_TYPE_DEPARTMENT[form.type],
    }
    const created = await createIncident(input)
    setCreateOpen(false)
    setForm(EMPTY_FORM)
    setSubmitAttempted(false)
    openDrawer({ kind: 'incident', id: created.id })
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('City Intelligence')}
        breadcrumbs={[{ label: t('City Intelligence') }, { label: t('Disaster Intelligence') }]}
        freshness={freshness}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreateOpen(true)}
            disabled={!canCreate}
          >
            {t('Report Incident')}
          </Button>
        }
      />

      <GovPanel title={t('Incident lifecycle')} subtitle={t('Institutional methodology')} tone="amber" dense>
        <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">
          {t('Every incident in this register is expected to move through these stages. Counts below reflect incidents currently at that stage; connective stages have no discrete status of their own.')}
        </p>
        <div className="scrollbar-slim flex items-stretch gap-0 overflow-x-auto px-3 pb-3">
          {WORKFLOW_STAGES.map((stage, i) => {
            const count = stage.countKey?.reduce((sum, s) => sum + countsByStatus[s], 0)
            return (
              <div key={stage.id} className="flex items-stretch">
                <div className="flex w-36 shrink-0 flex-col rounded-md border border-ink-100 bg-surface-sunken p-2.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-ink-800">{stage.label}</span>
                    {typeof count === 'number' ? (
                      <Badge tone={count > 0 ? 'info' : 'muted'}>{count}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-500">{stage.description}</p>
                </div>
                {i < WORKFLOW_STAGES.length - 1 ? (
                  <div className="flex w-5 shrink-0 items-center justify-center">
                    <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </GovPanel>

      <MetricGrid columns={4}>
        <MetricCard label={t('Open incidents')} value={openIncidents.length} support={t('Not yet resolved or reviewed')} icon={<ShieldAlert className="h-4 w-4" />} />
        <MetricCard
          label={t('Critical severity, open')}
          value={criticalOpen}
          tone={criticalOpen > 0 ? 'critical' : 'default'}
          support={t('Requires standing command attention')}
          icon={<AlertOctagon className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Population in affected areas')}
          value={formatCompact(totalAffected)}
          support={t('Modelled estimate, not a census figure')}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          label={t('Response teams deployed')}
          value={teamsDeployed}
          support={t('Currently deployed or en route')}
          icon={<MapPin className="h-4 w-4" />}
        />
      </MetricGrid>

      {/* The register is the working surface and takes the width; the map is
          the locator that qualifies it and reads beside, not above — a
          full-width map pushed the register itself below the fold. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
      <GovPanel
        title={t('Incident register')}
        tone="amber"
        dense
        actions={
          <SegmentedControl
            value={view}
            onChange={setView}
            ariaLabel="View mode"
            options={[
              { value: 'table', label: t('Table'), icon: <ListChecks className="h-3.5 w-3.5" /> },
              { value: 'cards', label: t('Cards'), icon: <LayoutGrid className="h-3.5 w-3.5" /> },
            ]}
          />
        }
      >
        <div className="border-b border-ink-100 px-3 pt-3 pb-3">
          <Tabs items={tabItems} value={statusTab} onChange={(id) => setStatusTab(id as 'all' | IncidentStatus)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <FilterBar show={['ward', 'severity', 'search']} searchPlaceholder="Search title, description or location" compact />
          <div className="flex items-center gap-1.5">
            <Label className="mb-0 whitespace-nowrap">{t('Type')}</Label>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | IncidentType)}
              className="w-auto min-w-[10rem]"
              options={[{ value: 'all', label: t('All types') }, ...INCIDENT_TYPES.map((incidentType) => ({ value: incidentType, label: INCIDENT_TYPE_LABEL[incidentType] }))]}
              aria-label={t('Filter by incident type')}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          /* A ward with no incident on record is a real answer, and the ward's
             standing exposure is what makes it a different answer from the next
             ward's. Without it every quiet ward rendered the same sentence,
             which is indistinguishable from a filter that did not apply. */
          selectedWard ? (
            <EmptyState
              className="m-3"
              title={t('No incident on record in {0}', wardName(selectedWard.id))}
              detail={t('{0} is {1} and carries {2} known waterlogging points. Nothing is currently open here; the corporation is carrying {3} open incidents elsewhere.', wardName(selectedWard.id), selectedWard.floodProne ? t('flood-prone') : t('not classified as flood-prone'), selectedWard.waterloggingSpots, items.filter((i) => i.status !== 'resolved' && i.status !== 'reviewed').length)}
            />
          ) : (
            <EmptyState
              className="m-3"
              title={t('No incidents match the current filters')}
              detail="Adjust the status tab, type, ward, severity or search term above to widen the result set."
            />
          )
        ) : view === 'table' ? (
          <div className="mt-2">
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(row) => row.id}
              rowAccent={(row) => <SeverityRail severity={row.severity} />}
              onRowClick={(row) => openDrawer({ kind: 'incident', id: row.id })}
              searchable
              searchPlaceholder="Quick search within this list"
              pageSize={12}
              initialSort={{ columnId: 'detected', direction: 'desc' }}
              ariaLabel="Incident register"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} onClick={() => openDrawer({ kind: 'incident', id: incident.id })} />
            ))}
          </div>
        )}
      </GovPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <GovPanel title={t('Incident map')} tone="red">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t('Markers reflect the incidents currently visible under the filters below; ward shading reflects the full open-incident register.')}
            </p>
            <CityMap
              layers={[
                {
                  id: 'open-load',
                  label: t('Open Incident Load'),
                  valueFor: (wardId) => Math.min(100, (openLoadByWard.get(wardId) ?? 0) * 20),
                  higherIsWorse: true,
                  unit: ' open incident(s), scaled',
                  description: t('Count of currently open incidents recorded against the ward across the full register, independent of the filters applied below.'),
                },
              ]}
              markers={markers}
              height={380}
            />
          </GovPanel>

          <GovPanel title={t('Known chronic waterlogging locations')} tone="amber">
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {t("Named repeatedly across years of BMC monsoon reporting as the city's chronic waterlogging spots — a standing, publicly documented list, distinct from the incident register's live operational entries at left.")}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {activeCorporation.form.floodProneAreas.map((area) => (
                <li key={area}>
                  <Badge tone="critical">{area}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.625rem] leading-snug text-ink-400">
              {t("Hindmata sits in a natural depression and floods almost every monsoon; Sion and King's Circle flooding is tied to Mithi River overflow — named repeatedly in BMC Commissioner pre-monsoon inspection reporting, not a modelled figure.")}
            </p>
          </GovPanel>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          setSubmitAttempted(false)
        }}
        title={t('Report Incident')}
        description={t('Raises a new record in the unified incident register. The record enters at Detected and follows the standard incident lifecycle.')}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="critical" onClick={() => void handleCreate()}>
              {t('Report Incident')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="inc-title" required>
              {t('Incident title')}
            </Label>
            <Input
              id="inc-title"
              value={form.title}
              onChange={(e) => updateForm('title', e.target.value)}
              placeholder={t('e.g. Waterlogging blocking arterial access, K/W ward')}
            />
            {submitAttempted && form.title.trim().length < 4 ? (
              <p className="mt-1 text-[0.6875rem] text-crit-600">{t('Enter a title of at least four characters.')}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inc-type" required>
                {t('Type')}
              </Label>
              <Select
                id="inc-type"
                value={form.type}
                onChange={(e) => updateForm('type', e.target.value as IncidentType)}
                options={INCIDENT_TYPES.map((incidentType) => ({ value: incidentType, label: INCIDENT_TYPE_LABEL[incidentType] }))}
              />
            </div>
            <div>
              <Label htmlFor="inc-severity" required>
                {t('Severity')}
              </Label>
              <Select
                id="inc-severity"
                value={form.severity}
                onChange={(e) => updateForm('severity', e.target.value as Severity)}
                options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inc-ward" required>
                {t('Ward')}
              </Label>
              <Select
                id="inc-ward"
                value={form.wardId}
                onChange={(e) => updateForm('wardId', e.target.value)}
                options={WARDS.map((w) => ({ value: w.id, label: `${w.code} - ${w.name.split(' · ')[0]}` }))}
              />
            </div>
            <div>
              <Label htmlFor="inc-location" required>
                {t('Location')}
              </Label>
              <Input
                id="inc-location"
                value={form.locationName}
                onChange={(e) => updateForm('locationName', e.target.value)}
                placeholder={t('e.g. S. V. Road junction')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="inc-description" required>
              {t('Description')}
            </Label>
            <Textarea
              id="inc-description"
              rows={4}
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder={t('State what was observed, by whom, and any immediate risk to life or critical infrastructure.')}
            />
            {submitAttempted && form.description.trim().length < 12 ? (
              <p className="mt-1 text-[0.6875rem] text-crit-600">{t('Enter a description of at least twelve characters.')}</p>
            ) : null}
          </div>

          <p className="text-[0.6875rem] leading-relaxed text-ink-400">
            {t('This record and every subsequent status change is written to the permanent audit trail against your name. The record will be owned by {0} until reassigned.', departmentName(INCIDENT_TYPE_DEPARTMENT[form.type]))}
          </p>
        </div>
      </Modal>

      <DemonstrationNotice />
    </PageBody>
  )
}

export default DisasterIntelligencePage
