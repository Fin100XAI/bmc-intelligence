import { useMemo, useState } from 'react'
import { AlertOctagon, AlertTriangle, HardHat, MapPin, Route, ShieldAlert, Siren, TrafficCone, Users } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, ScoreDial } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { DivisionGeoMap } from '@/components/geo/DivisionGeoMap'
import type { GeoMapPoint } from '@/components/geo/GeoMap'
import { positionForRecord } from '@/data/geo-positions'
import { FilterBar } from '@/components/filters/FilterBar'
import { CHART_COLOURS, CategoryBarChart, RankedBarChart } from '@/components/charts'
import { DetailsFold, KpiTile, TargetBar } from '@/components/infographic'
import { LegendDonut, SEVERITY_COLOUR } from '@/components/infographic/command-kit'
import { SeverityBadge } from '@/components/ui/badges'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { incidentService, projectService, roadsService, wardService } from '@/services'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import { usePageMasthead } from '@/stores/masthead.store'
import { useDrawerStore, useFilterStore } from '@/stores/ui.store'
import { wardName } from '@/data/reference'
import { formatCompact, formatNumber } from '@/utils/format'
import { SEVERITY_LABEL, type Severity } from '@/types/common'
import { INCIDENT_TYPE_LABEL } from '@/types/operations'
import { t } from '@/i18n'
import { enumLabel } from '@/utils/enum-label'
import { cn } from '@/utils/cn'
import { SHADE } from '@/components/ui/shade'

/**
 * src/pages/command/CityCommandMapPage.tsx
 *
 * The flagship spatial view: one full-bleed composite of the city's
 * operational position, on the real OpenStreetMap engine (`DivisionGeoMap`) and the same
 * service layer every other page reads - not a rebuild. What makes this page
 * different from the choropleth panel on Ward Intelligence or the nine-layer
 * Digital Twin is presentation and liveness: a single dramatic command
 * surface, and markers sourced from queries that actually poll (see
 * `LiveIndicator`), so a genuinely new incident from the dev-only
 * live-simulation feed appears here without a manual refresh.
 *
 * Around the map, the page reads as an infographic: headline tiles above it,
 * a focus card for the selected ward and the incident severity mix beside
 * it, and the ranked "where" pictures below it. Every list the pictures
 * summarise stays one click away under "Show details".
 *
 * The geometry underneath is exactly as honest here as everywhere else in
 * the platform - ward circles sit at APPROXIMATE positions (the platform carries no
 * surveyed ward-office boundaries; see `geo-positions.ts`) and the map says so
 * on every instance, and nothing on this page suppresses that disclosure.
 */

type MarkerLayerId = 'incidents' | 'projects' | 'roadDefects'

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

function build$MARKER_LAYERS(): Record<MarkerLayerId, { label: string; icon: React.ReactNode }> {
  return {
    incidents: { label: t('Incidents'), icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    projects: { label: t('Projects at risk'), icon: <HardHat className="h-3.5 w-3.5" /> },
    roadDefects: { label: t('Road defects'), icon: <Route className="h-3.5 w-3.5" /> },
  }
}

/** "<code> - Kurla" reads as "Kurla" on a bar axis. */
function shortWardLabel(id: string): string {
  const full = wardName(id)
  return full.split(' - ').pop() ?? full
}

export function CityCommandMapPage(): React.JSX.Element {
  const corporation = useActiveCorporation()
  usePageMasthead(t('{0} Command Map', cityName(corporation)))

  const filters = useFilterStore((s) => s.filters)
  const openDrawer = useDrawerStore((s) => s.open)

  const [enabled, setEnabled] = useState<Record<MarkerLayerId, boolean>>({
    incidents: true,
    projects: false,
    roadDefects: false,
  })
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null)

  const MARKER_LAYERS = build$MARKER_LAYERS()

  const wardsQuery = useServiceQuery(queryKeys.wards('command-map'), (u) => wardService.list(u))
  const incidentsQuery = useServiceQuery(
    queryKeys.incidents('command-map'),
    (u) => incidentService.active(u),
    { refetchInterval: 25_000 },
  )
  const projectsQuery = useServiceQuery(queryKeys.projects('command-map-at-risk'), (u) => projectService.atRisk(u, 60))
  const defectsQuery = useServiceQuery(queryKeys.roads('command-map-defects'), (u) => roadsService.rankedDefects(u, 40))

  const wards = useMemo(() => wardsQuery.data ?? [], [wardsQuery.data])

  // Each marker source carries a different shape (an incident's `wardId`, a
  // project's `wardIds`, a defect's `wardId`), so the shared ward/severity/
  // search filters are applied per source rather than through one predicate -
  // the same approach Roads Intelligence takes for its segment and defect
  // registers.
  const searchQuery = filters.search.trim().toLowerCase()
  const incidents = (incidentsQuery.data ?? []).filter((i) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(i.wardId)) return false
    if (filters.severities.length > 0 && !filters.severities.includes(i.severity)) return false
    if (searchQuery && !i.title.toLowerCase().includes(searchQuery) && !i.locationName.toLowerCase().includes(searchQuery)) return false
    return true
  })
  const projectsAtRisk = (projectsQuery.data ?? []).filter((p) => {
    if (filters.wardIds.length > 0 && !p.wardIds.some((w) => filters.wardIds.includes(w))) return false
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery) && !p.reference.toLowerCase().includes(searchQuery)) return false
    return true
  })
  const defects = (defectsQuery.data ?? []).filter((d) => {
    if (filters.wardIds.length > 0 && !filters.wardIds.includes(d.wardId)) return false
    if (filters.severities.length > 0 && !filters.severities.includes(d.severity)) return false
    if (searchQuery && !d.type.toLowerCase().includes(searchQuery)) return false
    return true
  })

  // Markers on the real map: each record at the OSM point of a published
  // place its own text names, otherwise at its ward's approximate
  // position (see `geo-positions.ts`) - never at an invented address.
  const markers = useMemo<GeoMapPoint[]>(() => {
    const list: GeoMapPoint[] = []
    if (enabled.incidents) {
      for (const incident of incidents) {
        const pos = positionForRecord({ id: `incident:${incident.id}`, wardId: incident.wardId, text: [incident.locationName, incident.title] })
        if (!pos) continue
        list.push({
          id: `incident-${incident.id}`,
          ...pos,
          label: incident.title,
          detail: `${SEVERITY_LABEL[incident.severity]} · ${incident.locationName}`,
          color: SEVERITY_COLOUR[incident.severity],
          radius: incident.severity === 'critical' ? 8 : incident.severity === 'high' ? 6.5 : 5,
          fillOpacity: 0.9,
          emphasis: incident.severity === 'critical',
          group: 'incidents',
          onClick: () => openDrawer({ kind: 'incident', id: incident.id }),
        })
      }
    }
    if (enabled.projects) {
      for (const project of projectsAtRisk) {
        const wardId = project.wardIds[0]
        if (!wardId) continue
        const pos = positionForRecord({ id: `project:${project.id}`, wardId, text: [project.name] })
        if (!pos) continue
        list.push({
          id: `project-${project.id}`,
          ...pos,
          label: project.name,
          detail: `${project.reference} · ${t('risk {0}', project.riskScore)}`,
          color: CHART_COLOURS.intel,
          radius: 6,
          fillOpacity: 0.9,
          group: 'projects',
          onClick: () => openDrawer({ kind: 'project', id: project.id }),
        })
      }
    }
    if (enabled.roadDefects) {
      for (const defect of defects) {
        const pos = positionForRecord({ id: `defect:${defect.id}`, wardId: defect.wardId })
        if (!pos) continue
        list.push({
          id: `defect-${defect.id}`,
          ...pos,
          label: enumLabel(defect.type),
          detail: `${enumLabel(defect.status)} · ${wardName(defect.wardId)}`,
          color: '#78716c',
          radius: 4.5,
          fillOpacity: 0.9,
          group: 'roadDefects',
          onClick: () => setSelectedWardId(defect.wardId),
        })
      }
    }
    return list
  }, [enabled, incidents, projectsAtRisk, defects, openDrawer])

  // ── Summaries the pictures are drawn from ─────────────────────────────
  const layerCount: Record<MarkerLayerId, number> = {
    incidents: incidents.length,
    projects: projectsAtRisk.length,
    roadDefects: defects.length,
  }
  const criticalIncidents = incidents.filter((i) => i.severity === 'critical').length
  const seriousDefects = defects.filter((d) => d.severity === 'critical' || d.severity === 'high').length
  const residentsAffected = incidents.reduce((s, i) => s + i.affectedPopulation, 0)
  const scopedWards = filters.wardIds.length > 0 ? wards.filter((w) => filters.wardIds.includes(w.id)) : wards
  const highRiskWards = scopedWards.filter((w) => w.riskScore >= 62).length
  const avgProjectRisk =
    projectsAtRisk.length > 0 ? Math.round(projectsAtRisk.reduce((s, p) => s + p.riskScore, 0) / projectsAtRisk.length) : 0

  const severitySegments = SEVERITIES.map((sev) => ({
    id: sev,
    label: SEVERITY_LABEL[sev],
    value: incidents.filter((i) => i.severity === sev).length,
    colour: SEVERITY_COLOUR[sev],
  }))

  const riskiestWards = [...scopedWards].sort((a, b) => b.riskScore - a.riskScore)
  const riskiestBars = riskiestWards.slice(0, 8).map((w) => ({ label: shortWardLabel(w.id), value: w.riskScore }))

  const pressureByWard = (() => {
    const map = new Map<string, { incidents: number; projects: number; defects: number }>()
    const bump = (wardId: string, key: 'incidents' | 'projects' | 'defects'): void => {
      const row = map.get(wardId) ?? { incidents: 0, projects: 0, defects: 0 }
      row[key] += 1
      map.set(wardId, row)
    }
    for (const i of incidents) bump(i.wardId, 'incidents')
    for (const p of projectsAtRisk) if (p.wardIds[0]) bump(p.wardIds[0], 'projects')
    for (const d of defects) bump(d.wardId, 'defects')
    return Array.from(map.entries())
      .map(([wardId, r]) => ({ wardId, ...r, total: r.incidents + r.projects + r.defects }))
      .sort((a, b) => b.total - a.total)
  })()

  const projectsByRisk = [...projectsAtRisk].sort((a, b) => b.riskScore - a.riskScore)

  const selectedWard = selectedWardId ? wards.find((w) => w.id === selectedWardId) : undefined
  const selectedCounts = selectedWardId
    ? {
        incidents: incidents.filter((i) => i.wardId === selectedWardId).length,
        projects: projectsAtRisk.filter((p) => p.wardIds.includes(selectedWardId)).length,
        defects: defects.filter((d) => d.wardId === selectedWardId).length,
      }
    : null

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader
        eyebrow={t('City Operations')}
        breadcrumbs={[{ label: t('City Operations') }, { label: t('City Map') }, { label: t('Command view') }]}
        actions={<LiveIndicator dataUpdatedAt={incidentsQuery.dataUpdatedAt} isFetching={incidentsQuery.isFetching} />}
        controls={<FilterBar show={['ward', 'severity', 'search']} />}
      />

      {/* ── Headline figures: what is on the map, in large type ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          icon={<ShieldAlert className="h-5 w-5" />}
          label={t('Active incidents')}
          value={incidents.length}
          reading={t('In the field now')}
          tone={incidents.length > 0 ? 'risk' : 'positive'}
          shade="tone"
        />
        <KpiTile
          icon={<AlertOctagon className="h-5 w-5" />}
          label={t('Critical incidents')}
          value={criticalIncidents}
          reading={criticalIncidents > 0 ? t('Need action today') : t('None open')}
          tone={criticalIncidents > 0 ? 'critical' : 'positive'}
          shade="tone"
        />
        <KpiTile
          icon={<Users className="h-5 w-5" />}
          label={t('Residents affected')}
          value={formatCompact(residentsAffected)}
          reading={t('Modelled estimate')}
          tone="neutral"
          shade="teal"
        />
        <KpiTile
          icon={<HardHat className="h-5 w-5" />}
          label={t('Projects at risk')}
          value={projectsAtRisk.length}
          reading={projectsAtRisk.length > 0 ? t('Average risk {0}/100', avgProjectRisk) : t('None above threshold')}
          tone={projectsAtRisk.length > 0 ? 'warn' : 'positive'}
          shade={projectsAtRisk.length > 0 ? 'blue' : 'green'}
        />
        <KpiTile
          icon={<Route className="h-5 w-5" />}
          label={t('Road defects')}
          value={defects.length}
          reading={t('{0} high or critical', seriousDefects)}
          tone={seriousDefects > 0 ? 'warn' : 'positive'}
          shade="tone"
        />
        <KpiTile
          icon={<MapPin className="h-5 w-5" />}
          label={t('Wards needing attention')}
          value={highRiskWards}
          reading={t('of {0} wards', scopedWards.length)}
          tone={highRiskWards > 0 ? 'risk' : 'positive'}
          shade="tone"
        />
      </div>

      {/* ── The map, with the selected ward and the severity mix beside it ── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <GovPanel
          title={t('City Command Map')}
          subtitle={t('{0} active incidents · {1} projects at risk · {2} road defects', incidents.length, projectsAtRisk.length, defects.length)}
          tone="primary"
          dense
          bodyClassName="p-3"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[0.6875rem] font-semibold tracking-[0.06em] text-ink-500 uppercase">{t('Show on map')}</p>
            {(Object.keys(MARKER_LAYERS) as MarkerLayerId[]).map((id) => (
              <Button
                key={id}
                variant={enabled[id] ? 'primary' : 'outline'}
                size="xs"
                icon={MARKER_LAYERS[id].icon}
                onClick={() => setEnabled((s) => ({ ...s, [id]: !s[id] }))}
              >
                {MARKER_LAYERS[id].label}
                <span className="numeric ml-1 rounded-full bg-black/10 px-1.5 text-[0.625rem] font-bold tabular-nums">{layerCount[id]}</span>
              </Button>
            ))}
          </div>

          <DivisionGeoMap
            layers={[
              {
                id: 'risk',
                label: t('Composite Risk'),
                valueFor: (id) => wards.find((w) => w.id === id)?.riskScore,
                higherIsWorse: true,
                unit: '/100',
                description: t('Composite risk index across every domain, ward by ward.'),
              },
              {
                id: 'health',
                label: t('Operational Health'),
                valueFor: (id) => wards.find((w) => w.id === id)?.healthScore,
                higherIsWorse: false,
                unit: '/100',
                description: t('Composite ward operational health index.'),
              },
            ]}
            points={markers}
            pointLegend={[
              ...(enabled.incidents ? [{ label: MARKER_LAYERS.incidents.label, color: SEVERITY_COLOUR.critical, count: incidents.length }] : []),
              ...(enabled.projects ? [{ label: MARKER_LAYERS.projects.label, color: CHART_COLOURS.intel, count: projectsAtRisk.length }] : []),
              ...(enabled.roadDefects ? [{ label: MARKER_LAYERS.roadDefects.label, color: '#78716c', count: defects.length }] : []),
            ]}
            selectedWardId={selectedWardId}
            onWardSelect={setSelectedWardId}
            height="clamp(320px, 60vh, 560px)"
            showLabels
          />

          {incidents.some((i) => i.severity === 'critical') && enabled.incidents && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-crit-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('Critical incidents are ringed on the map - select a marker to open the incident.')}
            </p>
          )}
        </GovPanel>

        <div className="flex min-w-0 flex-col gap-3">
          <GovPanel
            title={t('Selected ward')}
            subtitle={selectedWard ? wardName(selectedWard.id) : t('Select a ward on the map')}
            tone="amber"
            dense
          >
            {selectedWard && selectedCounts ? (
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-around gap-2">
                  <ScoreDial score={selectedWard.riskScore} size={104} higherIsBetter={false} label="/100" caption={t('Risk index')} />
                  <ScoreDial score={selectedWard.healthScore} size={104} label="/100" caption={t('Health index')} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      { id: 'incidents', label: t('Incidents'), value: selectedCounts.incidents, shade: 'orange', icon: <Siren className="h-3.5 w-3.5" /> },
                      { id: 'projects', label: t('Projects at risk'), value: selectedCounts.projects, shade: 'blue', icon: <HardHat className="h-3.5 w-3.5" /> },
                      { id: 'defects', label: t('Road defects'), value: selectedCounts.defects, shade: 'amber', icon: <TrafficCone className="h-3.5 w-3.5" /> },
                    ] as const
                  ).map((c) => (
                    <div key={c.id} className={cn('rounded-lg border px-1 py-2', SHADE[c.value > 0 ? c.shade : 'green'].tile)}>
                      <span className={cn('mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-white', SHADE[c.value > 0 ? c.shade : 'green'].chip)}>{c.icon}</span>
                      <p className={cn('numeric text-xl leading-none font-bold tabular-nums', SHADE[c.value > 0 ? c.shade : 'green'].value)}>{c.value}</p>
                      <p className="mt-1 truncate text-[0.625rem] text-ink-600">{c.label}</p>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  className="w-full"
                  icon={<MapPin className="h-3 w-3" />}
                  onClick={() => openDrawer({ kind: 'ward', id: selectedWard.id })}
                >
                  {t('Open ward profile')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-govt-50 text-govt-600 ring-1 ring-govt-200">
                  <MapPin className="h-5 w-5" />
                </span>
                <p className="text-[0.75rem] text-ink-500">{t('Select a ward on the map to see its risk, health and open work here.')}</p>
              </div>
            )}
          </GovPanel>

          <GovPanel title={t('Incidents by severity')} subtitle={t('Active incidents shown on the map')} tone="red" dense>
            <div className="p-3">
              <LegendDonut
                segments={severitySegments}
                centreValue={formatNumber(incidents.length)}
                centreLabel={t('incidents')}
                size={130}
                emptyLabel={t('No active incidents.')}
              />
            </div>
            <DetailsFold summary={t('Show the active incidents')}>
              {incidents.length === 0 ? (
                <p className="px-3 py-3 text-[0.6875rem] text-ink-400">{t('No active incidents.')}</p>
              ) : (
                <ul className="max-h-[300px] overflow-y-auto">
                  {incidents.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => openDrawer({ kind: 'incident', id: i.id })}
                        className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-1.5 text-left hover:bg-govt-50/60"
                      >
                        <SeverityBadge severity={i.severity} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.6875rem] font-medium text-ink-800">{i.title}</span>
                          <span className="block truncate text-[0.625rem] text-ink-500">
                            {INCIDENT_TYPE_LABEL[i.type]} · {i.locationName}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DetailsFold>
          </GovPanel>
        </div>
      </div>

      {/* ── Where the pressure sits ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GovPanel title={t('Highest-risk wards')} subtitle={t('Composite risk index, top eight')} tone="red" dense>
          <div className="h-[240px] p-2">
            <RankedBarChart data={riskiestBars} unit="/100" />
          </div>
          <DetailsFold summary={t('Show every ward by risk')}>
            <ul className="max-h-[300px] overflow-y-auto">
              {riskiestWards.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedWardId(w.id)}
                    className={`flex w-full items-center justify-between gap-2 border-t border-ink-100 px-3 py-1.5 text-left hover:bg-govt-50/60 ${selectedWardId === w.id ? 'bg-govt-50' : ''}`}
                  >
                    <span className="min-w-0 truncate text-[0.6875rem] text-ink-700">{wardName(w.id)}</span>
                    <span className="numeric shrink-0 text-[0.6875rem] font-bold text-ink-900 tabular-nums">{w.riskScore}/100</span>
                  </button>
                </li>
              ))}
            </ul>
          </DetailsFold>
        </GovPanel>

        <GovPanel title={t('Open work by ward')} subtitle={t('Incidents, projects at risk and road defects')} tone="amber" dense>
          <div className="h-[240px] p-2">
            {pressureByWard.length === 0 ? (
              <p className="py-10 text-center text-[0.75rem] text-ink-400">{t('Nothing open in the current filter.')}</p>
            ) : (
              <CategoryBarChart
                layout="horizontal"
                showLegend
                data={pressureByWard.slice(0, 8).map((r) => ({
                  label: shortWardLabel(r.wardId),
                  incidents: r.incidents,
                  projects: r.projects,
                  defects: r.defects,
                }))}
                series={[
                  { key: 'incidents', label: t('Incidents'), colour: CHART_COLOURS.primary, stackId: 'open' },
                  { key: 'projects', label: t('Projects at risk'), colour: CHART_COLOURS.intel, stackId: 'open' },
                  { key: 'defects', label: t('Road defects'), colour: CHART_COLOURS.neutral, stackId: 'open' },
                ]}
              />
            )}
          </div>
          <DetailsFold summary={t('Show the count for every ward')}>
            <table className="w-full text-[0.6875rem]">
              <thead>
                <tr className="border-b border-ink-100 bg-surface-sunken text-left">
                  <th className="px-2.5 py-1 font-bold tracking-wide text-ink-500 uppercase">{t('Ward')}</th>
                  <th className="px-2 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Incidents')}</th>
                  <th className="px-2 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Projects')}</th>
                  <th className="px-2.5 py-1 text-right font-bold tracking-wide text-ink-500 uppercase">{t('Defects')}</th>
                </tr>
              </thead>
              <tbody>
                {pressureByWard.map((r) => (
                  <tr
                    key={r.wardId}
                    className="cursor-pointer border-b border-ink-100 last:border-b-0 hover:bg-govt-50/60"
                    onClick={() => setSelectedWardId(r.wardId)}
                  >
                    <td className="truncate px-2.5 py-1 text-ink-700">{wardName(r.wardId)}</td>
                    <td className="numeric px-2 py-1 text-right text-ink-700 tabular-nums">{r.incidents}</td>
                    <td className="numeric px-2 py-1 text-right text-ink-700 tabular-nums">{r.projects}</td>
                    <td className="numeric px-2.5 py-1 text-right text-ink-700 tabular-nums">{r.defects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DetailsFold>
        </GovPanel>

        <GovPanel title={t('Projects at risk')} subtitle={t('Work done against the phased plan (tick)')} tone="green" dense>
          <div className="space-y-1 p-2">
            {projectsByRisk.length === 0 ? (
              <p className="py-10 text-center text-[0.75rem] text-ink-400">{t('None above threshold')}</p>
            ) : (
              projectsByRisk.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDrawer({ kind: 'project', id: p.id })}
                  className="block w-full rounded-md px-1.5 py-1.5 text-left hover:bg-govt-50/60"
                >
                  <TargetBar label={p.name} value={p.completionPct} target={p.plannedCompletionPct} note={t('risk {0}', p.riskScore)} />
                </button>
              ))
            )}
          </div>
          {projectsByRisk.length > 5 ? (
            <DetailsFold summary={t('Show all {0} projects at risk', projectsByRisk.length)}>
              {projectsByRisk.slice(5).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDrawer({ kind: 'project', id: p.id })}
                  className="block w-full border-t border-ink-100 px-3 py-1.5 text-left hover:bg-govt-50/60"
                >
                  <TargetBar label={p.name} value={p.completionPct} target={p.plannedCompletionPct} note={t('risk {0}', p.riskScore)} />
                </button>
              ))}
            </DetailsFold>
          ) : null}
        </GovPanel>
      </div>
    </PageBody>
  )
}

export default CityCommandMapPage
