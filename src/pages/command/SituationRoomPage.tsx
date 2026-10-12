import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertOctagon,
  ArrowRight,
  Building2,
  CheckCircle2,
  Construction,
  Droplets,
  Flame,
  Hospital,
  Info,
  LogOut,
  Maximize2,
  Minimize2,
  Route,
  Send,
  Siren,
  TriangleAlert,
  Users,
  UsersRound,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Input, LinkButton, Select, SegmentedControl, Textarea } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { ConfirmDialog } from '@/components/ui/overlays'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { CHART_COLOURS, CompositionBar } from '@/components/charts'
import { BigFigure, DetailsFold, KpiTile } from '@/components/infographic'
import { MeterRow, SEVERITY_COLOUR, StageStrip, StatChip, burdenTone, scoreTone } from '@/components/infographic/meters'
import { DivisionGeoMap } from '@/components/geo/DivisionGeoMap'
import type { GeoMapPoint } from '@/components/geo/GeoMap'
import { positionForRecord } from '@/data/geo-positions'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService, incidentService, monsoonService, roadsService, wardService } from '@/services'
import { useContextStore, useLayoutStore, useSituationStore, type SituationMode } from '@/stores/ui.store'
import { useCurrentUser } from '@/stores/auth.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { allowed } from '@/security'
import { ROUTES } from '@/config/navigation'
import { formatCompact, formatDateTime, formatRelative, sanitiseText } from '@/utils/format'
import { cn } from '@/utils/cn'
import { SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from '@/types/common'
import { INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL, type Incident, type IncidentStatus, type IncidentType, type ResponseTeam } from '@/types/operations'
import type { EmergencyStation, Hospital as HospitalRecord, PumpingStation, RoadSegment } from '@/types/city-domains'
import { t } from '@/i18n'
import { enumLabel } from '@/utils/enum-label'
import { registerLayer } from '@/data/runtime'

/**
 * Situation Room - full-screen operational command.
 *
 * Opens with the standard application shell. An operator may explicitly
 * maximise the workspace, which hides the navigation rail and context bar
 * (see `AppShell`, gated on `useLayoutStore().situationMode`); that choice is
 * always released on unmount. Dense by design: every panel earns its
 * place, and nothing here is decorative.
 */

const INCIDENT_SEQUENCE: IncidentStatus[] = ['detected', 'validated', 'active', 'contained', 'resolved', 'reviewed']

/** Entries shown before the rest of a ledger folds under "Show details". */
const TIMELINE_PREVIEW = 4
const LOG_PREVIEW = 4

function nextIncidentStatus(current: IncidentStatus): IncidentStatus | null {
  const idx = INCIDENT_SEQUENCE.indexOf(current)
  if (idx === -1 || idx === INCIDENT_SEQUENCE.length - 1) return null
  return INCIDENT_SEQUENCE[idx + 1] ?? null
}

interface ModeConfig {
  label: string
  description: string
  mapLayer: 'risk' | 'monsoon' | 'health' | 'roads'
  emphasisTypes: IncidentType[]
  assetLabel: string
}

function build$MODE_CONFIG(): Record<SituationMode, ModeConfig> {
  return {
  'city-operations': { label: t('City Operations'), description: t('Every active incident across every domain, ranked by severity.'), mapLayer: 'risk', emphasisTypes: [], assetLabel: t('Municipal readiness') },
  monsoon: { label: t('South-west monsoon'), description: t('Flood and extreme-weather incidents, drainage readiness and pumping capacity.'), mapLayer: 'monsoon', emphasisTypes: ['flood', 'extreme-weather'], assetLabel: t('Pumping stations') },
  'public-health': { label: t('Public Health'), description: t('Public-health incidents, aggregate outbreak signals and hospital capacity.'), mapLayer: 'health', emphasisTypes: ['public-health'], assetLabel: t('Hospitals') },
  emergency: { label: t('Emergency'), description: t('Fire and building-collapse incidents, response teams and station readiness.'), mapLayer: 'risk', emphasisTypes: ['fire', 'building-collapse'], assetLabel: t('Emergency stations') },
  infrastructure: { label: t('Infrastructure'), description: t('Infrastructure failures, utility incidents and road disruption.'), mapLayer: 'roads', emphasisTypes: ['infrastructure-failure', 'utility-incident', 'road-disruption'], assetLabel: t('Road network') },
  'major-event': { label: t('Major Event'), description: t('City-wide view ranked by estimated affected population.'), mapLayer: 'risk', emphasisTypes: [], assetLabel: t('Municipal readiness') },
}
}
let MODE_CONFIG: Record<SituationMode, ModeConfig> = build$MODE_CONFIG()
registerLayer(() => {
  MODE_CONFIG = build$MODE_CONFIG()
})

function build$RESPONSE_TEAM_TYPES(): Array<{ value: ResponseTeam['type']; label: string }> {
  return [
  { value: 'fire', label: t('Fire') },
  { value: 'disaster-response', label: t('Disaster Response') },
  { value: 'medical', label: t('Medical') },
  { value: 'engineering', label: t('Engineering') },
  { value: 'dewatering', label: t('Dewatering') },
  { value: 'police-liaison', label: t('Police Liaison') },
]
}
let RESPONSE_TEAM_TYPES: Array<{ value: ResponseTeam['type']; label: string }> = build$RESPONSE_TEAM_TYPES()
registerLayer(() => {
  RESPONSE_TEAM_TYPES = build$RESPONSE_TEAM_TYPES()
})

interface ManualLogEntry {
  id: string
  at: string
  actor: string
  text: string
}

export function SituationRoomPage(): React.JSX.Element {
  const user = useCurrentUser()
  /**
   * The ward selected in the command bar governs this screen, not only the
   * breadcrumb above it. It was read nowhere here, so an operator who narrowed
   * the shell to one ward went on commanding the whole city underneath - the
   * register, the severity counts, the map markers and the asset readiness all
   * stayed corporation-wide. The selection now reaches the incident query
   * itself (and its query key, so a ward is never served another ward's cached
   * page); ward scoping still runs through `filterByScope` inside the service,
   * so this narrows what is shown and never widens what may be read.
   */
  const contextWardId = useContextStore((s) => s.wardId)
  const mode = useSituationStore((s) => s.mode)
  const setMode = useSituationStore((s) => s.setMode)
  const selectedIncidentId = useSituationStore((s) => s.selectedIncidentId)
  const selectIncident = useSituationStore((s) => s.selectIncident)
  const setSituationMode = useLayoutStore((s) => s.setSituationMode)
  const situationMode = useLayoutStore((s) => s.situationMode)

  const [logDraft, setLogDraft] = useState('')
  const [manualLog, setManualLog] = useState<ManualLogEntry[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [deployOpen, setDeployOpen] = useState(false)
  const [deployName, setDeployName] = useState('')
  const [deployType, setDeployType] = useState<ResponseTeam['type']>('disaster-response')
  const [deployStrength, setDeployStrength] = useState('10')
  const [confirmAdvance, setConfirmAdvance] = useState<{ incident: Incident; to: IncidentStatus } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // The Situation Room opens with the standard shell, exactly like every other
  // page - the sidebar stays available so an operator can navigate away without
  // first having to exit a mode they never chose to enter. Maximising the
  // workspace is an explicit action, and it is always released on unmount so
  // the reduced shell can never leak into another route.
  useEffect(() => {
    setSituationMode(false)
    return () => setSituationMode(false)
  }, [setSituationMode])

  // Escape always restores the shell. Without this an operator who maximises
  // the workspace has exactly one way back, and losing it would strand them.
  useEffect(() => {
    if (!situationMode) return undefined
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSituationMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [situationMode, setSituationMode])

  const incidentsKey = queryKeys.incidents({ scope: 'situation-room', wardId: contextWardId })
  // Incidents are now durable and the dev-only live-simulation tick
  // occasionally adds a new alert - polling keeps this room feeling live
  // rather than a static snapshot from the moment the page was opened.
  const incidentsQuery = useServiceQuery(
    incidentsKey,
    (u) => incidentService.list(u, { wardId: contextWardId ?? undefined, pageSize: 300 }),
    { refetchInterval: 25_000 },
  )
  const situationLogQuery = useServiceQuery(queryKeys.incidents('situation-log'), (u) => incidentService.situationLog(u, 60), {
    refetchInterval: 25_000,
  })
  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))
  const pumpingQuery = useServiceQuery(queryKeys.monsoon('pumping'), (u) => monsoonService.pumpingStations(u))
  const readinessQuery = useServiceQuery(queryKeys.monsoon('readiness'), (u) => monsoonService.readiness(u))
  const hospitalsQuery = useServiceQuery(queryKeys.health('hospitals'), (u) => healthService.hospitals(u))
  const outbreakQuery = useServiceQuery(queryKeys.health('outbreak'), (u) => healthService.outbreakSignals(u))
  const emergencyStationsQuery = useServiceQuery(queryKeys.health('emergency-stations'), (u) => healthService.emergencyStations(u))
  const roadSegmentsQuery = useServiceQuery(queryKeys.roads('segments'), (u) => roadsService.segments(u))

  const INCIDENT_KEYS = [incidentsKey, queryKeys.incidents('situation-log'), queryKeys.incidents('active')]
  const doTransition = useServiceAction((u, id: string, to: IncidentStatus, reason?: string) => incidentService.transition(u, id, to, reason), INCIDENT_KEYS)
  const doAddNote = useServiceAction((u, id: string, body: string) => incidentService.addNote(u, id, body), INCIDENT_KEYS)
  const doDeployTeam = useServiceAction(
    (u, id: string, team: { name: string; type: ResponseTeam['type']; strength: number }) => incidentService.deployTeam(u, id, team),
    INCIDENT_KEYS,
  )

  const canEditIncident = allowed(user, 'incident', 'edit')

  const config = MODE_CONFIG[mode]

  // The shell renders the masthead; this page states what it should say.
  usePageMasthead(t('Situation Room'))

  const incidents = useMemo(() => incidentsQuery.data?.items ?? [], [incidentsQuery.data])

  const visibleIncidents = useMemo(() => {
    const operational = incidents.filter((i) => i.status !== 'reviewed')
    const sorted = [...operational].sort((a, b) => {
      if (mode === 'major-event') return b.affectedPopulation - a.affectedPopulation
      const aEmphasis = config.emphasisTypes.length === 0 || config.emphasisTypes.includes(a.type) ? 0 : 1
      const bEmphasis = config.emphasisTypes.length === 0 || config.emphasisTypes.includes(b.type) ? 0 : 1
      if (aEmphasis !== bEmphasis) return aEmphasis - bEmphasis
      const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (sev !== 0) return sev
      return a.detectedAt < b.detectedAt ? 1 : -1
    })
    return sorted
  }, [incidents, mode, config.emphasisTypes])

  // An incident that has fallen out of scope - because the ward changed under
  // it - must not stay under command. The first incident now in scope takes
  // over, so the detail column always describes something the operator can see
  // in the register beside it.
  useEffect(() => {
    if (visibleIncidents.length === 0) return
    if (visibleIncidents.some((i) => i.id === selectedIncidentId)) return
    const first = visibleIncidents[0]
    if (first) selectIncident(first.id)
  }, [visibleIncidents, selectedIncidentId, selectIncident])

  const selectedIncident = visibleIncidents.find((i) => i.id === selectedIncidentId) ?? null

  const severitySummary = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const i of visibleIncidents) counts[i.severity] += 1
    return counts
  }, [visibleIncidents])

  const populationEstimate = useMemo(() => visibleIncidents.reduce((s, i) => s + i.affectedPopulation, 0), [visibleIncidents])

  const wardById = useMemo(() => new Map((wardsQuery.data ?? []).map((w) => [w.id, w])), [wardsQuery.data])
  const readinessByWard = useMemo(() => new Map((readinessQuery.data ?? []).map((r) => [r.wardId, r.readinessScore])), [readinessQuery.data])
  const outbreakByWard = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of outbreakQuery.data ?? []) map.set(h.wardId, Math.max(map.get(h.wardId) ?? 0, h.outbreakSignal))
    return map
  }, [outbreakQuery.data])
  const roadConditionByWard = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>()
    for (const seg of roadSegmentsQuery.data ?? []) {
      const entry = totals.get(seg.wardId) ?? { sum: 0, count: 0 }
      entry.sum += seg.conditionIndex
      entry.count += 1
      totals.set(seg.wardId, entry)
    }
    const map = new Map<string, number>()
    for (const [wardId, entry] of totals) map.set(wardId, entry.sum / Math.max(1, entry.count))
    return map
  }, [roadSegmentsQuery.data])

  // Readiness answers to the same selection as the register: when a ward is in
  // effect, the assets reported are the ones standing in it.
  const assetData = useMemo<AssetStatusData>(() => {
    const inWard = <T extends { wardId: string }>(rows: T[]): T[] => (contextWardId ? rows.filter((r) => r.wardId === contextWardId) : rows)
    return {
      pumping: inWard(pumpingQuery.data ?? []),
      hospitals: inWard(hospitalsQuery.data ?? []),
      emergencyStations: inWard(emergencyStationsQuery.data ?? []),
      roadSegments: inWard(roadSegmentsQuery.data ?? []),
    }
  }, [contextWardId, pumpingQuery.data, hospitalsQuery.data, emergencyStationsQuery.data, roadSegmentsQuery.data])

  // Each incident at the OSM point of a published place its text names, or at
  // its ward's approximate position - see `geo-positions.ts`.
  const mapMarkers = useMemo<GeoMapPoint[]>(() => {
    const out: GeoMapPoint[] = []
    for (const incident of visibleIncidents) {
      const pos = positionForRecord({ id: `incident:${incident.id}`, wardId: incident.wardId, text: [incident.locationName, incident.title] })
      if (!pos) continue
      out.push({
        id: incident.id,
        ...pos,
        label: incident.title,
        detail: `${INCIDENT_TYPE_LABEL[incident.type]} · ${incident.locationName}`,
        color: SEVERITY_COLOUR[incident.severity],
        radius: incident.severity === 'critical' ? 8 : incident.severity === 'high' ? 6.5 : 5,
        fillOpacity: 0.9,
        emphasis: incident.id === selectedIncidentId,
        onClick: () => selectIncident(incident.id),
      })
    }
    return out
  }, [visibleIncidents, selectIncident, selectedIncidentId])

  function runAction(promise: Promise<unknown>): void {
    setActionError(null)
    promise.catch((err: unknown) => setActionError(err instanceof Error ? err.message : t('The action could not be completed.')))
  }

  function submitNote(): void {
    if (!selectedIncident || !noteDraft.trim()) return
    runAction(doAddNote(selectedIncident.id, sanitiseText(noteDraft, 500)))
    setNoteDraft('')
  }

  function submitDeploy(): void {
    if (!selectedIncident || !deployName.trim()) return
    runAction(doDeployTeam(selectedIncident.id, { name: sanitiseText(deployName, 120), type: deployType, strength: Math.max(1, Number(deployStrength) || 1) }))
    setDeployOpen(false)
    setDeployName('')
    setDeployStrength('10')
  }

  function submitLog(): void {
    if (!logDraft.trim()) return
    const entry: ManualLogEntry = {
      id: `manual-${manualLog.length + 1}-${Date.now()}`,
      at: new Date().toISOString(),
      actor: user?.name ?? t('Control room operator'),
      text: sanitiseText(logDraft, 500),
    }
    setManualLog((prev) => [entry, ...prev])
    setLogDraft('')
  }

  function handleAdvance(): void {
    if (!confirmAdvance) return
    runAction(doTransition(confirmAdvance.incident.id, confirmAdvance.to))
  }

  function handleAdvanceReasoned(reason: string): void {
    if (!confirmAdvance) return
    runAction(doTransition(confirmAdvance.incident.id, confirmAdvance.to, reason))
  }

  if (incidentsQuery.isLoading) {
    return (
      <PageBody width="full" className="space-y-3 p-3 sm:p-4">
        <LoadingState variant="metrics" />
        <LoadingState variant="block" rows={8} />
      </PageBody>
    )
  }
  if (incidentsQuery.error) {
    return (
      <PageBody width="full" className="space-y-3 p-3 sm:p-4">
        <ErrorState detail={incidentsQuery.error.message} onRetry={() => incidentsQuery.refetch()} />
      </PageBody>
    )
  }

  const combinedLog = [
    ...manualLog.map((m) => ({ id: m.id, at: m.at, actor: m.actor, text: m.text, origin: 'operator' as const })),
    ...(situationLogQuery.data ?? []).map((s) => ({ id: s.id, at: s.at, actor: s.actorName, text: `${s.title} - ${s.detail}`, origin: 'system' as const })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  const nextStatus = selectedIncident ? nextIncidentStatus(selectedIncident.status) : null

  const incidentsByType = Array.from(
    visibleIncidents.reduce((m, i) => m.set(i.type, (m.get(i.type) ?? 0) + 1), new Map<IncidentType, number>()),
  ).sort((a, b) => b[1] - a[1])

  function renderLogEntry(entry: (typeof combinedLog)[number]): React.JSX.Element {
    return (
      <li key={entry.id} className="flex items-start gap-2.5 text-xs">
        <Badge tone={entry.origin === 'operator' ? 'info' : 'muted'} className="mt-0.5 shrink-0">{entry.origin === 'operator' ? t('Operator') : t('System')}</Badge>
        <div className="min-w-0">
          <p className="text-ink-700">{entry.text}</p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-400">{entry.actor} · {formatDateTime(entry.at)}</p>
        </div>
      </li>
    )
  }

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader
        eyebrow={t('City Operations')}
        breadcrumbs={[{ label: t('City Operations') }, { label: t('Situation Room') }]}
        actions={
          <>
            <LiveIndicator
              dataUpdatedAt={incidentsQuery.dataUpdatedAt}
              isFetching={incidentsQuery.isFetching || situationLogQuery.isFetching}
              className="mr-1"
            />
            <Button
              variant="outline"
              icon={situationMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              onClick={() => setSituationMode(!situationMode)}
              title={
                situationMode
                  ? t('Restore the navigation rail and context bar.')
                  : t('Hide the navigation rail and context bar to maximise the operational workspace.')
              }
            >
              {situationMode ? t('Restore shell') : t('Maximise workspace')}
            </Button>
            <LinkButton to={ROUTES.cockpit} variant="outline" icon={<LogOut className="h-3.5 w-3.5" />}>
              {t('Back to Cockpit')}
            </LinkButton>
          </>
        }
        controls={
          <div className="scrollbar-slim max-w-full min-w-0 overflow-x-auto">
            <SegmentedControl
              ariaLabel={t('Situation Room mode')}
              value={mode}
              onChange={setMode}
              options={(Object.keys(MODE_CONFIG) as SituationMode[]).map((m) => ({ value: m, label: MODE_CONFIG[m].label }))}
            />
          </div>
        }
      />

      {actionError ? (
        <Card tone="critical" className="flex items-start justify-between gap-3">
          <p className="text-[0.8125rem] text-crit-700">{actionError}</p>
          <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>{t('Dismiss')}</Button>
        </Card>
      ) : null}

      {/* ── The room at a glance: severity counts, scope and people affected ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={<AlertOctagon className="h-5 w-5" />} label={t('Critical')} value={severitySummary.critical} tone={severitySummary.critical > 0 ? 'critical' : 'positive'} shade="red" />
        <KpiTile icon={<TriangleAlert className="h-5 w-5" />} label={t('High')} value={severitySummary.high} tone={severitySummary.high > 0 ? 'risk' : 'positive'} shade="orange" />
        <KpiTile icon={<AlertCircle className="h-5 w-5" />} label={t('Medium')} value={severitySummary.medium} tone={severitySummary.medium > 0 ? 'warn' : 'positive'} shade="amber" />
        <KpiTile icon={<Info className="h-5 w-5" />} label={t('Low + info')} value={severitySummary.low + severitySummary.info} tone="neutral" shade="blue" />
        <KpiTile icon={<Siren className="h-5 w-5" />} label={t('Incidents in scope')} value={visibleIncidents.length} reading={config.label} tone="neutral" shade="teal" />
        <KpiTile icon={<Users className="h-5 w-5" />} label={t('Population affected (est.)')} value={formatCompact(populationEstimate)} tone={populationEstimate > 0 ? 'warn' : 'positive'} shade="tone" />
      </div>

      {/* ── Two columns ──────────────────────────────────────────────
          An operator reads the city first and the registers second. The wide
          column carries the map and whichever incident is under command; the
          narrow one carries what is open and what has just been recorded, so
          neither has to be hunted for further down the page. */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Column 1 — the operational picture ---------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
          <Card flush>
            <div className="p-3">
              <DivisionGeoMap
                layers={[
                  { id: 'risk', label: t('Ward Risk'), valueFor: (id) => wardById.get(id)?.riskScore, higherIsWorse: true, unit: '/100' },
                  { id: 'monsoon', label: t('Flood Risk'), valueFor: (id) => { const r = readinessByWard.get(id); return r === undefined ? undefined : 100 - r }, higherIsWorse: true, unit: '/100' },
                  { id: 'health', label: t('Outbreak Signal'), valueFor: (id) => outbreakByWard.get(id), higherIsWorse: true, unit: '/100' },
                  { id: 'roads', label: t('Road Condition Deficit'), valueFor: (id) => { const c = roadConditionByWard.get(id); return c === undefined ? undefined : 100 - c }, higherIsWorse: true, unit: '/100' },
                ]}
                activeLayerId={config.mapLayer}
                selectedWardId={selectedIncident?.wardId ?? contextWardId}
                points={mapMarkers}
                pointLegend={[{ label: t('Incidents'), color: SEVERITY_COLOUR.critical, count: mapMarkers.length }]}
                height={420}
              />
            </div>
          </Card>

          {selectedIncident ? (
            <>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={selectedIncident.severity} />
                      <Badge tone="muted">{INCIDENT_TYPE_LABEL[selectedIncident.type]}</Badge>
                      <Badge tone="neutral">{INCIDENT_STATUS_LABEL[selectedIncident.status]}</Badge>
                      <span className="text-[0.6875rem] text-ink-400">{selectedIncident.reference}</span>
                    </div>
                    <h3 className="mt-1.5 text-[0.9375rem] font-semibold text-ink-900">{selectedIncident.title}</h3>
                    <p className="mt-0.5 text-xs text-ink-500">{t('{0} · {1} affected (estimate)', selectedIncident.locationName, formatCompact(selectedIncident.affectedPopulation))}</p>
                  </div>
                  {nextStatus ? (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canEditIncident}
                      title={canEditIncident ? undefined : t('Your role does not hold incident:edit')}
                      icon={<ArrowRight className="h-3.5 w-3.5" />}
                      onClick={() => setConfirmAdvance({ incident: selectedIncident, to: nextStatus })}
                    >
                      {t('Advance to {0}', INCIDENT_STATUS_LABEL[nextStatus])}
                    </Button>
                  ) : (
                    <Badge tone="positive" icon={<CheckCircle2 className="h-3 w-3" />}>{t('Fully reviewed')}</Badge>
                  )}
                </div>
                {/* Where this incident stands in its lifecycle. */}
                <StageStrip
                  stages={INCIDENT_SEQUENCE.map((s) => ({ id: s, label: INCIDENT_STATUS_LABEL[s] }))}
                  activeId={selectedIncident.status}
                />
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <StatChip icon={<Users className="h-4 w-4" />} value={formatCompact(selectedIncident.affectedPopulation)} caption={t('Population affected (est.)')} tone="warn" />
                  <StatChip
                    icon={<UsersRound className="h-4 w-4" />}
                    value={selectedIncident.responseTeams.reduce((s, team) => s + team.strength, 0)}
                    caption={t('{0} deployed to this incident', selectedIncident.responseTeams.length)}
                    tone={selectedIncident.responseTeams.length > 0 ? 'positive' : 'warn'}
                  />
                  <StatChip icon={<Route className="h-4 w-4" />} value={selectedIncident.roadsImpacted.length} caption={t('Road impact')} tone={selectedIncident.roadsImpacted.length > 0 ? 'warn' : 'positive'} />
                  <StatChip icon={<Hospital className="h-4 w-4" />} value={selectedIncident.hospitalsImpacted.length} caption={t('Hospital accessibility')} tone={selectedIncident.hospitalsImpacted.length > 0 ? 'critical' : 'positive'} />
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                <GovPanel title={config.assetLabel} tone="amber">
                  <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Readiness relevant to the current mode.')}</p>
                  <div>
                    {renderAssetStatus(mode, assetData)}
                  </div>
                </GovPanel>

                <GovPanel
                  title={t('Response teams')}
                  tone="red"
                  actions={
                    <Button size="xs" variant="outline" disabled={!canEditIncident} title={canEditIncident ? undefined : t('Your role does not hold incident:edit')} onClick={() => setDeployOpen((v) => !v)}>
                      {deployOpen ? t('Cancel') : t('Deploy team')}
                    </Button>
                  }
                >
                  <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('{0} deployed to this incident', selectedIncident.responseTeams.length)}</p>
                  <div className="space-y-2">
                    {selectedIncident.responseTeams.length === 0 ? (
                      <p className="text-xs text-ink-400">{t('No teams deployed yet.')}</p>
                    ) : (
                      selectedIncident.responseTeams.map((team) => (
                        <div key={team.id} className="space-y-1">
                          <MeterRow
                            label={`${team.name} · ${enumLabel(team.type)}`}
                            value={team.strength}
                            max={Math.max(...selectedIncident.responseTeams.map((x) => x.strength), 1)}
                            tone={team.status === 'deployed' ? 'positive' : team.status === 'en-route' ? 'warn' : 'neutral'}
                          />
                          <Badge tone={team.status === 'deployed' ? 'positive' : team.status === 'en-route' ? 'warn' : 'neutral'}>{enumLabel(team.status)}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                  {deployOpen ? (
                    <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
                      <Input value={deployName} onChange={(e) => setDeployName(e.target.value)} placeholder={t('Team name')} />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={deployType} onChange={(e) => setDeployType(e.target.value as ResponseTeam['type'])} options={RESPONSE_TEAM_TYPES.map((entry) => ({ value: entry.value, label: entry.label }))} />
                        <Input type="number" min={1} value={deployStrength} onChange={(e) => setDeployStrength(e.target.value)} placeholder={t('Strength')} />
                      </div>
                      <Button size="xs" variant="primary" block disabled={!deployName.trim()} onClick={submitDeploy}>
                        {t('Confirm deployment')}
                      </Button>
                    </div>
                  ) : null}
                </GovPanel>

                <GovPanel title={t('Road impact')} tone="amber">
                  <div className="mb-2 flex items-center gap-2">
                    <Route className="h-5 w-5 text-warn-600" aria-hidden />
                    <BigFigure value={String(selectedIncident.roadsImpacted.length)} caption={t('Road impact')} tone={selectedIncident.roadsImpacted.length > 0 ? 'warn' : 'positive'} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedIncident.roadsImpacted.length === 0 ? (
                      <p className="text-xs text-ink-400">{t('No roads recorded as impacted.')}</p>
                    ) : (
                      selectedIncident.roadsImpacted.map((r) => <Badge key={r} tone="warn">{r}</Badge>)
                    )}
                  </div>
                  <div className="mt-3 border-t border-ink-100 pt-3">
                    <div className="flex items-center gap-2">
                      <Hospital className="h-5 w-5 text-crit-600" aria-hidden />
                      <BigFigure value={String(selectedIncident.hospitalsImpacted.length)} caption={t('Hospital accessibility')} tone={selectedIncident.hospitalsImpacted.length > 0 ? 'critical' : 'positive'} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedIncident.hospitalsImpacted.length === 0 ? (
                        <p className="text-xs text-ink-400">{t('No hospitals recorded as impacted.')}</p>
                      ) : (
                        selectedIncident.hospitalsImpacted.map((h) => <Badge key={h} tone="critical">{h}</Badge>)
                      )}
                    </div>
                  </div>
                </GovPanel>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <GovPanel title={t('Timeline')} tone="green" dense>
                  <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('This incident\'s own record, oldest first.')}</p>
                  {(() => {
                    const ordered = [...selectedIncident.timeline].sort((a, b) => (a.at < b.at ? -1 : 1))
                    const earlier = ordered.slice(0, Math.max(0, ordered.length - TIMELINE_PREVIEW))
                    const recent = ordered.slice(-TIMELINE_PREVIEW)
                    const renderEvent = (event: (typeof ordered)[number], last: boolean): React.JSX.Element => (
                      <li key={event.id} className="relative flex gap-2.5 pb-3 text-xs last:pb-0">
                        {!last ? <span className="absolute top-3 bottom-0 left-[4px] w-px bg-govt-200" aria-hidden /> : null}
                        <span className="relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface bg-govt-500 ring-1 ring-govt-300" />
                        <div className="min-w-0">
                          <p className="text-ink-700"><span className="font-semibold text-ink-900">{event.title}</span> - {event.detail}</p>
                          <p className="mt-0.5 text-[0.6875rem] text-ink-400">{event.actor} · {formatDateTime(event.at)}</p>
                        </div>
                      </li>
                    )
                    return (
                      <>
                        {earlier.length > 0 ? (
                          <DetailsFold summary={t('Show {0} earlier entries', earlier.length)}>
                            <ol className="px-3 pb-2">{earlier.map((e) => renderEvent(e, false))}</ol>
                          </DetailsFold>
                        ) : null}
                        <ol className="px-3 pt-2 pb-3">{recent.map((e, i) => renderEvent(e, i === recent.length - 1))}</ol>
                      </>
                    )
                  })()}
                </GovPanel>

                <GovPanel title={t('Field updates')} tone="amber">
                  <p className="mb-3 text-xs leading-relaxed text-ink-500">{t('Notes recorded against this incident.')}</p>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {selectedIncident.notes.length === 0 ? (
                      <p className="text-xs text-ink-400">{t('No field updates recorded yet.')}</p>
                    ) : (
                      selectedIncident.notes.map((n) => (
                        <p key={n.id} className="rounded-md border-l-2 border-govt-300 bg-surface-sunken p-2 text-[0.6875rem] leading-relaxed text-ink-600">
                          <span className="font-semibold text-ink-800">{n.authorName}</span> · {formatRelative(n.createdAt)} - {n.body}
                        </p>
                      ))
                    )}
                  </div>
                  <div className="mt-2.5 flex items-start gap-1.5">
                    <Textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={t('Add a field update.')} className="flex-1" />
                    <Button size="xs" variant="outline" disabled={!noteDraft.trim() || !canEditIncident} onClick={submitNote}>
                      {t('Post')}
                    </Button>
                  </div>
                </GovPanel>
              </div>
            </>
          ) : (
            <EmptyState title={t('No incident selected')} detail={t('Select an incident from the map or the active list to see its detail.')} />
          )}
        </div>

        {/* Column 2 — the registers ------------------------------- */}
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <GovPanel title={t('Response pipeline')} subtitle={config.description} tone="green" dense>
            <div className="space-y-3 p-3">
              <StageStrip
                stages={INCIDENT_SEQUENCE.filter((s) => s !== 'reviewed').map((s) => ({
                  id: s,
                  label: INCIDENT_STATUS_LABEL[s],
                  count: visibleIncidents.filter((i) => i.status === s).length,
                }))}
              />
              {visibleIncidents.length > 0 ? (
                <CompositionBar
                  segments={(['critical', 'high', 'medium', 'low', 'info'] as Severity[])
                    .map((sev) => ({ id: sev, label: SEVERITY_LABEL[sev], value: severitySummary[sev], colour: SEVERITY_COLOUR[sev] }))
                    .filter((seg) => seg.value > 0)}
                  height={10}
                />
              ) : null}
              {incidentsByType.length > 0 ? (
                <div className="space-y-1.5 border-t border-ink-100 pt-2.5">
                  <p className="text-[0.625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">{t('Incidents by type')}</p>
                  {incidentsByType.map(([type, n]) => (
                    <MeterRow
                      key={type}
                      label={INCIDENT_TYPE_LABEL[type]}
                      value={n}
                      max={incidentsByType[0]?.[1] ?? 1}
                      tone={config.emphasisTypes.includes(type) ? 'risk' : 'neutral'}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </GovPanel>

          <GovPanel title={t('Active incidents')} tone="amber" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('{0} in scope for this mode', visibleIncidents.length)}</p>
            <div className="max-h-[440px] divide-y divide-ink-50 overflow-y-auto">
              {visibleIncidents.length === 0 ? (
                <EmptyState compact title={t('No active incidents')} detail={t('Nothing currently open matches this mode.')} />
              ) : (
                visibleIncidents.map((incident) => {
                  const active = incident.id === selectedIncidentId
                  return (
                    <button
                      key={incident.id}
                      type="button"
                      onClick={() => selectIncident(incident.id)}
                      className={cn('flex w-full items-start gap-2.5 border-l-4 p-3 text-left transition-colors hover:bg-govt-50/40', active && 'bg-govt-50')}
                      style={{ borderLeftColor: SEVERITY_COLOUR[incident.severity] }}
                    >
                      <SeverityBadge severity={incident.severity} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] font-medium text-ink-800">{incident.title}</p>
                        <p className="mt-0.5 text-[0.6875rem] text-ink-400">
                          {INCIDENT_TYPE_LABEL[incident.type]} · {incident.locationName} · {formatRelative(incident.detectedAt)}
                        </p>
                      </div>
                      <Badge tone="muted">{INCIDENT_STATUS_LABEL[incident.status]}</Badge>
                    </button>
                  )
                })
              )}
            </div>
          </GovPanel>

          <GovPanel title={t('Command log')} tone="red" dense>
            <p className="px-3 pt-3 pb-2 text-xs leading-relaxed text-ink-500">{t('City-wide chronological record - automatic entries from incident actions, plus entries you post directly.')}</p>
            <div className="px-3 pb-3">
              <div className="flex items-start gap-1.5">
                <Textarea rows={2} value={logDraft} onChange={(e) => setLogDraft(e.target.value)} placeholder={t('Post a command log entry.')} className="flex-1" />
                <Button size="sm" variant="primary" disabled={!logDraft.trim()} onClick={submitLog} icon={<Send className="h-3.5 w-3.5" />}>
                  {t('Post')}
                </Button>
              </div>
              {combinedLog.length > 0 ? (
                <CompositionBar
                  className="mt-3"
                  segments={[
                    { id: 'operator', label: t('Operator'), value: combinedLog.filter((e) => e.origin === 'operator').length, colour: CHART_COLOURS.intel },
                    { id: 'system', label: t('System'), value: combinedLog.filter((e) => e.origin === 'system').length, colour: CHART_COLOURS.neutral },
                  ].filter((seg) => seg.value > 0)}
                />
              ) : null}
              {combinedLog.length === 0 ? (
                <p className="mt-3 text-xs text-ink-400">{t('No entries yet this session.')}</p>
              ) : (
                <ol className="mt-3 space-y-2">{combinedLog.slice(0, LOG_PREVIEW).map(renderLogEntry)}</ol>
              )}
            </div>
            {combinedLog.length > LOG_PREVIEW ? (
              <DetailsFold summary={t('Show {0} earlier entries', combinedLog.length - LOG_PREVIEW)}>
                <ol className="max-h-72 space-y-2 overflow-y-auto px-3 pb-3">{combinedLog.slice(LOG_PREVIEW).map(renderLogEntry)}</ol>
              </DetailsFold>
            ) : null}
          </GovPanel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAdvance !== null}
        onClose={() => setConfirmAdvance(null)}
        onConfirm={(reason) => (confirmAdvance?.to === 'reviewed' ? handleAdvanceReasoned(reason) : handleAdvance())}
        title={confirmAdvance ? t('Advance "{0}" to {1}', confirmAdvance.incident.title, INCIDENT_STATUS_LABEL[confirmAdvance.to]) : ''}
        description={t('This transition is written to the incident\'s permanent timeline and the audit trail.')}
        confirmLabel={t('Confirm')}
        intent={confirmAdvance?.to === 'active' ? 'critical' : 'primary'}
        requireReason={confirmAdvance?.to === 'reviewed'}
      />

      <DemonstrationNotice />
    </PageBody>
  )
}

interface AssetStatusData {
  pumping: PumpingStation[]
  hospitals: HospitalRecord[]
  emergencyStations: EmergencyStation[]
  roadSegments: RoadSegment[]
}

function renderAssetStatus(mode: SituationMode, data: AssetStatusData): React.JSX.Element {
  if (mode === 'monsoon') {
    const operational = data.pumping.reduce((s, p) => s + p.pumpsOperational, 0)
    const total = data.pumping.reduce((s, p) => s + p.pumpsTotal, 0)
    const pct = total > 0 ? (operational / total) * 100 : 0
    const worst = [...data.pumping].sort((a, b) => a.readinessIndex - b.readinessIndex).slice(0, 3)
    return (
      <div className="space-y-2">
        <MeterRow label={t('Pumps operational')} value={pct} display={t('{0} of {1}', operational, total)} tone={scoreTone(pct)} />
        <AssetWorstList>
          {worst.map((s) => (
            <MeterRow key={s.id} label={s.name} value={s.readinessIndex} display={`${s.readinessIndex}/100`} tone={scoreTone(s.readinessIndex)} />
          ))}
        </AssetWorstList>
      </div>
    )
  }
  if (mode === 'public-health') {
    const avgOccupancy = data.hospitals.length > 0 ? data.hospitals.reduce((s, h) => s + h.occupancyPct, 0) / data.hospitals.length : 0
    const worst = [...data.hospitals].sort((a, b) => b.occupancyPct - a.occupancyPct).slice(0, 3)
    return (
      <div className="space-y-2">
        <MeterRow label={t('Average bed occupancy')} value={avgOccupancy} display={`${avgOccupancy.toFixed(1)}%`} tone={burdenTone(avgOccupancy)} />
        <AssetWorstList>
          {worst.map((h) => (
            <MeterRow key={h.id} label={h.name} value={h.occupancyPct} display={`${h.occupancyPct}%`} tone={burdenTone(h.occupancyPct)} />
          ))}
        </AssetWorstList>
      </div>
    )
  }
  if (mode === 'emergency') {
    const available = data.emergencyStations.reduce((s, e) => s + e.vehiclesAvailable, 0)
    const total = data.emergencyStations.reduce((s, e) => s + e.vehiclesTotal, 0)
    const pct = total > 0 ? (available / total) * 100 : 0
    const worst = [...data.emergencyStations].sort((a, b) => a.readinessIndex - b.readinessIndex).slice(0, 3)
    return (
      <div className="space-y-2">
        <MeterRow label={t('Vehicles available')} value={pct} display={t('{0} of {1}', available, total)} tone={scoreTone(pct)} />
        <AssetWorstList>
          {worst.map((s) => (
            <MeterRow key={s.id} label={s.name} value={s.readinessIndex} display={`${s.readinessIndex}/100`} tone={scoreTone(s.readinessIndex)} />
          ))}
        </AssetWorstList>
      </div>
    )
  }
  if (mode === 'infrastructure') {
    const avgCondition = data.roadSegments.length > 0 ? data.roadSegments.reduce((s, r) => s + r.conditionIndex, 0) / data.roadSegments.length : 0
    const closures = data.roadSegments.filter((r) => r.closurePlanned).length
    const worst = [...data.roadSegments].sort((a, b) => a.conditionIndex - b.conditionIndex).slice(0, 3)
    return (
      <div className="space-y-2">
        <MeterRow label={t('Mean condition index')} value={avgCondition} display={`${avgCondition.toFixed(0)}/100`} tone={scoreTone(avgCondition)} />
        <StatChip icon={<Construction className="h-4 w-4" />} value={closures} caption={t('Planned closures')} tone={closures > 0 ? 'warn' : 'positive'} />
        <AssetWorstList>
          {worst.map((r) => (
            <MeterRow key={r.id} label={r.name} value={r.conditionIndex} display={`${r.conditionIndex}/100`} tone={scoreTone(r.conditionIndex)} />
          ))}
        </AssetWorstList>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-2">
      <StatChip icon={<Droplets className="h-4 w-4" />} value={data.pumping.length} caption={`${t('Pumping stations')} · ${t('monitored')}`} />
      <StatChip icon={<Building2 className="h-4 w-4" />} value={data.hospitals.length} caption={`${t('Hospitals')} · ${t('monitored')}`} />
      <StatChip icon={<Flame className="h-4 w-4" />} value={data.emergencyStations.length} caption={`${t('Emergency stations')} · ${t('monitored')}`} />
    </div>
  )
}

/** The three weakest assets under a mode, set under a small heading. */
function AssetWorstList({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-1.5 border-t border-ink-100 pt-2">
      <p className="text-[0.625rem] font-bold tracking-[0.09em] text-ink-500 uppercase">{t('Weakest three')}</p>
      {children}
    </div>
  )
}

export default SituationRoomPage
