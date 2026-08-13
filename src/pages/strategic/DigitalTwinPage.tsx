import { useState } from 'react'
import { Layers, MapPinned, Network } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { healthService, incidentService, monsoonService, projectService, roadsService, wardService, waterService } from '@/services'
import { useDrawerStore, type DrawerKind } from '@/stores/ui.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { isoFromAnchor } from '@/utils/deterministic'
import { formatCompact, formatRelative } from '@/utils/format'
import {
  Badge,
  Card,
  CardHeader,
  Checkbox,
  DefinitionList,
  DefinitionRow,
  DemonstrationNotice,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui'
import { CityMap, jitteredWardPoint, type MapMarker, type MapPath } from '@/components/map/CityMap'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * The active corporation's Urban Digital Twin.
 *
 * A layered 2D spatial representation of municipal entity classes - wards,
 * roads, storm water infrastructure, health facilities, projects, incidents
 * and environmental sensors - assembled entirely from the same service
 * layer every other intelligence surface reads. This is explicitly NOT a
 * photorealistic or surveyed 3D city model: geometry is illustrative, and
 * every panel says so.
 */

const FRESHNESS = {
  generatedAt: isoFromAnchor(0),
  sourceObservedAt: isoFromAnchor(-15),
  refreshIntervalMinutes: 15,
  origin: 'demonstration' as const,
  sourceState: 'operational' as const,
  stale: false,
}

type LayerId = 'infrastructure' | 'water' | 'stormwater' | 'roads' | 'health' | 'projects' | 'incidents' | 'risk' | 'environment'

function build$LAYER_META(): Record<LayerId, { label: string; colour: string; description: string }> {
  return {
  infrastructure: { label: t('Infrastructure'), colour: '#2f6feb', description: t('Municipal assets past design life or of high / critical criticality.') },
  water: { label: t('Water'), colour: '#0ea5b7', description: t('Water supply network assets - trunk mains, service reservoirs, pumping stations, treatment plants.') },
  stormwater: { label: t('Storm Water'), colour: '#0a8398', description: t('Storm water drains, pumping stations and chronic waterlogging locations.') },
  roads: { label: t('Roads'), colour: '#f97316', description: t('Traffic corridors and the highest-priority road defects.') },
  health: { label: t('Health'), colour: '#db2777', description: t('Hospitals and fire / disaster / ambulance emergency stations.') },
  projects: { label: t('Projects'), colour: '#7c3aed', description: t('Active capital works.') },
  incidents: { label: t('Incidents'), colour: '#e5484d', description: t('Currently open incidents across every incident type.') },
  risk: { label: t('Risk'), colour: '#dc2626', description: t('The five wards carrying the highest composite risk index.') },
  environment: { label: t('Environment'), colour: '#65a30d', description: t('Air quality stations and noise readings in exceedance of their limit.') },
}
}
let LAYER_META: Record<LayerId, { label: string; colour: string; description: string }> = build$LAYER_META()
registerLayer(() => {
  LAYER_META = build$LAYER_META()
})

const LAYER_ORDER: LayerId[] = ['infrastructure', 'water', 'stormwater', 'roads', 'health', 'projects', 'incidents', 'risk', 'environment']

interface SelectedEntity {
  className: string
  label: string
  detail: string
  drawer?: { kind: DrawerKind; id: string }
}

export function DigitalTwinPage(): React.JSX.Element {
  const openDrawer = useDrawerStore((s) => s.open)
  const corporation = useActiveCorporation()

  // The shell's masthead states the screen's name; the page states the wording.
  usePageMasthead(
    t('{0} Urban Digital Twin', corporation.city),
    t('A layered 2D spatial representation of municipal entity classes across the city - explicitly not a photorealistic or surveyed 3D model. Geometry is illustrative; every figure attached to an entity is drawn from the same service layer the rest of the platform reads.'),
  )

  const [enabled, setEnabled] = useState<Record<LayerId, boolean>>({
    infrastructure: false,
    water: false,
    stormwater: true,
    roads: true,
    health: false,
    projects: false,
    incidents: true,
    risk: false,
    environment: false,
  })
  const [selected, setSelected] = useState<SelectedEntity | null>(null)
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null)

  const wardsQuery = useServiceQuery(queryKeys.wards(), (u) => wardService.list(u))
  const assetsQuery = useServiceQuery(queryKeys.wards('twin-assets'), async (u) => {
    const wards = await wardService.list(u)
    const profiles = await Promise.all(wards.map((w) => wardService.profile(u, w.id)))
    return profiles.flatMap((p) => p.assets.items)
  })
  const waterAssetsQuery = useServiceQuery(queryKeys.water('twin'), (u) => waterService.assets(u))
  const drainsQuery = useServiceQuery(queryKeys.monsoon('twin-drains'), (u) => monsoonService.drains(u))
  const pumpingQuery = useServiceQuery(queryKeys.monsoon('twin-pumps'), (u) => monsoonService.pumpingStations(u))
  const spotsQuery = useServiceQuery(queryKeys.monsoon('twin-spots'), (u) => monsoonService.waterloggingSpots(u))
  const readinessQuery = useServiceQuery(queryKeys.monsoon('twin-readiness'), (u) => monsoonService.readiness(u))
  const corridorsQuery = useServiceQuery(queryKeys.roads('twin-corridors'), (u) => roadsService.corridors(u))
  const defectsQuery = useServiceQuery(queryKeys.roads('twin-defects'), (u) => roadsService.rankedDefects(u, 20))
  const hospitalsQuery = useServiceQuery(queryKeys.health('twin-hospitals'), (u) => healthService.hospitals(u))
  const emergencyQuery = useServiceQuery(queryKeys.health('twin-emergency'), (u) => healthService.emergencyStations(u))
  const projectsQuery = useServiceQuery(queryKeys.projects({ scope: 'twin' }), (u) => projectService.list(u, { pageSize: 300 }))
  const incidentsQuery = useServiceQuery(queryKeys.incidents({ scope: 'twin' }), (u) => incidentService.list(u, { pageSize: 300 }))
  const airQualityQuery = useServiceQuery(queryKeys.health('twin-air'), (u) => healthService.airQuality(u))
  const noiseQuery = useServiceQuery(queryKeys.health('twin-noise'), (u) => healthService.noise(u))

  const anyLoading = wardsQuery.isLoading
  const anyError = wardsQuery.error

  const wards = wardsQuery.data ?? []
  const activeProjects = (projectsQuery.data?.items ?? []).filter((p) => p.status !== 'completed' && p.status !== 'closed')
  const openIncidents = (incidentsQuery.data?.items ?? []).filter((i) => i.status !== 'resolved' && i.status !== 'reviewed')
  const exposedAssets = (assetsQuery.data ?? []).filter((a) => a.criticality === 'critical' || a.criticality === 'high')
  const exceedingNoise = (noiseQuery.data ?? []).filter((n) => n.exceedance)
  const poorAir = (airQualityQuery.data ?? []).filter((s) => s.category === 'poor' || s.category === 'very-poor' || s.category === 'severe')
  const riskWards = [...wards].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5)

  const counts: Record<LayerId, number> = {
    infrastructure: exposedAssets.length,
    water: waterAssetsQuery.data?.length ?? 0,
    stormwater: (drainsQuery.data?.length ?? 0) + (pumpingQuery.data?.length ?? 0) + (spotsQuery.data?.length ?? 0),
    roads: (corridorsQuery.data?.length ?? 0) + (defectsQuery.data?.length ?? 0),
    health: (hospitalsQuery.data?.length ?? 0) + (emergencyQuery.data?.length ?? 0),
    projects: activeProjects.length,
    incidents: openIncidents.length,
    risk: riskWards.length,
    environment: poorAir.length + exceedingNoise.length,
  }

  // A fresh counter for this render only, so markers placed within the same
  // ward across every currently-enabled layer are jittered apart rather than
  // stacked - intentionally not memoised, since it must not survive a
  // re-render where the enabled layers or underlying records have changed.
  const wardCounter = new Map<string, number>()

  function nextPoint(wardId: string): { x: number; y: number } {
    const idx = wardCounter.get(wardId) ?? 0
    wardCounter.set(wardId, idx + 1)
    return jitteredWardPoint(wardId, idx)
  }

  const markers: MapMarker[] = []
  const paths: MapPath[] = []

  if (enabled.infrastructure) {
    for (const asset of exposedAssets) {
      const pt = nextPoint(asset.wardId)
      markers.push({
        id: `asset-${asset.id}`,
        ...pt,
        label: asset.name,
        detail: t('Infrastructure asset · {0} · condition {1}/100', asset.category, asset.conditionIndex),
        kind: 'asset',
        severity: asset.criticality === 'critical' ? 'critical' : 'high',
        onClick: () =>
          setSelected({
            className: 'Municipal asset',
            label: asset.name,
            detail: t('{0} · installed {1} · condition {2}/100 · criticality {3}', asset.category, asset.installedYear, asset.conditionIndex, asset.criticality),
            drawer: { kind: 'asset', id: asset.id },
          }),
      })
    }
  }

  if (enabled.water) {
    for (const asset of waterAssetsQuery.data ?? []) {
      const pt = nextPoint(asset.wardId)
      markers.push({
        id: `water-${asset.id}`,
        ...pt,
        label: asset.name,
        detail: t('Water asset · {0} · {1} MLD', asset.type, asset.capacityMld),
        kind: 'asset',
        onClick: () =>
          setSelected({ className: 'Water asset', label: asset.name, detail: t('{0} · capacity {1} MLD · condition {2}/100 · {3}', asset.type, asset.capacityMld, asset.conditionIndex, asset.state) }),
      })
    }
  }

  if (enabled.stormwater) {
    for (const drain of drainsQuery.data ?? []) {
      const pt = nextPoint(drain.wardId)
      markers.push({
        id: `drain-${drain.id}`,
        ...pt,
        label: drain.name,
        detail: t('Storm water drain · {0} · blockage risk {1}/100', drain.type, drain.blockageRisk),
        kind: 'asset',
        severity: drain.blockageRisk >= 70 ? 'high' : undefined,
        onClick: () => setSelected({ className: 'Storm water drain', label: drain.name, detail: t('{0} · {1} km · desilting {2}% · blockage risk {3}/100', drain.type, drain.lengthKm, drain.desiltingCompletionPct, drain.blockageRisk) }),
      })
    }
    for (const station of pumpingQuery.data ?? []) {
      const pt = nextPoint(station.wardId)
      markers.push({
        id: `pump-${station.id}`,
        ...pt,
        label: station.name,
        detail: t('Pumping station · {0}/{1} pumps operational', station.pumpsOperational, station.pumpsTotal),
        kind: 'station',
        onClick: () => setSelected({ className: 'Pumping station', label: station.name, detail: `${station.pumpsOperational}/${station.pumpsTotal} pumps operational · readiness ${station.readinessIndex}/100 · standby power ${station.standbyPowerAvailable ? 'available' : 'not available'}` }),
      })
    }
    for (const spot of spotsQuery.data ?? []) {
      const pt = nextPoint(spot.wardId)
      markers.push({
        id: `spot-${spot.id}`,
        ...pt,
        label: spot.name,
        detail: t('Chronic waterlogging location · risk {0}/100', spot.currentRisk),
        kind: 'hotspot',
        severity: spot.currentRisk >= 65 ? 'high' : undefined,
        onClick: () => setSelected({ className: 'Chronic waterlogging location', label: spot.name, detail: t('Chronic index {0}/100 · current risk {1}/100 · mitigation {2} · {3}', spot.chronicIndex, spot.currentRisk, spot.mitigationStatus, spot.criticalRoute ? 'on a critical route' : 'not on a critical route') }),
      })
    }
  }

  if (enabled.roads) {
    for (const corridor of corridorsQuery.data ?? []) {
      paths.push({ id: `corridor-${corridor.id}`, points: corridor.path, label: t('{0} · congestion {1}', corridor.name, corridor.congestionIndex), tone: corridor.congestionIndex >= 65 ? 'critical' : 'primary' })
    }
    for (const defect of defectsQuery.data ?? []) {
      const pt = nextPoint(defect.wardId)
      markers.push({
        id: `defect-${defect.id}`,
        ...pt,
        label: t('{0} - priority {1}', defect.type, defect.priorityScore),
        detail: t('Road defect · {0} · priority {1}/100 · {2}', defect.type, defect.priorityScore, defect.status),
        kind: 'defect',
        severity: defect.severity,
        onClick: () => setSelected({ className: 'Road defect', label: `${defect.type} (${defect.id})`, detail: t('Priority {0}/100 · status {1} · {2} linked complaint(s)', defect.priorityScore, defect.status, defect.complaintCount) }),
      })
    }
  }

  if (enabled.health) {
    for (const hospital of hospitalsQuery.data ?? []) {
      const pt = nextPoint(hospital.wardId)
      markers.push({
        id: `hospital-${hospital.id}`,
        ...pt,
        label: hospital.name,
        detail: t('Hospital · {0} · occupancy {1}%', hospital.type, hospital.occupancyPct),
        kind: 'hospital',
        severity: hospital.occupancyPct > 92 ? 'high' : undefined,
        onClick: () => setSelected({ className: 'Hospital', label: hospital.name, detail: t('{0} · {1}/{2} beds occupied · ICU {3}/{4} · accessibility {5}/100', hospital.type, hospital.bedsOccupied, hospital.bedsTotal, hospital.icuOccupied, hospital.icuTotal, hospital.accessibilityIndex) }),
      })
    }
    for (const station of emergencyQuery.data ?? []) {
      const pt = nextPoint(station.wardId)
      markers.push({
        id: `emergency-${station.id}`,
        ...pt,
        label: station.name,
        detail: t('{0} · avg response {1} min', station.type.replace('-', ' '), station.avgResponseMinutes),
        kind: 'station',
        onClick: () => setSelected({ className: 'Emergency station', label: station.name, detail: t('{0} · {1}/{2} vehicles available · avg response {3} min · readiness {4}/100', station.type.replace('-', ' '), station.vehiclesAvailable, station.vehiclesTotal, station.avgResponseMinutes, station.readinessIndex) }),
      })
    }
  }

  if (enabled.projects) {
    for (const project of activeProjects) {
      const wardId = project.wardIds[0]
      if (!wardId) continue
      const pt = nextPoint(wardId)
      markers.push({
        id: `project-${project.id}`,
        ...pt,
        label: project.name,
        detail: t('Project · {0}% complete · risk {1}/100', project.completionPct, project.riskScore),
        kind: 'facility',
        severity: project.riskScore >= 70 ? 'critical' : project.riskScore >= 55 ? 'high' : undefined,
        onClick: () => setSelected({ className: 'Capital project', label: project.name, detail: t('{0} · {1}% complete vs {2}% planned · risk {3}/100', project.reference, project.completionPct, project.plannedCompletionPct, project.riskScore), drawer: { kind: 'project', id: project.id } }),
      })
    }
  }

  if (enabled.incidents) {
    for (const incident of openIncidents) {
      const pt = nextPoint(incident.wardId)
      markers.push({
        id: `incident-${incident.id}`,
        ...pt,
        label: incident.title,
        detail: t('Incident · {0} · {1}', incident.type, incident.status),
        kind: 'incident',
        severity: incident.severity,
        onClick: () => setSelected({ className: 'Incident', label: incident.title, detail: t('{0} · {1} · {2} affected (estimate)', incident.type, incident.status, formatCompact(incident.affectedPopulation)), drawer: { kind: 'incident', id: incident.id } }),
      })
    }
  }

  if (enabled.risk) {
    riskWards.forEach((ward, i) => {
      const pt = jitteredWardPoint(ward.id, 90 + i)
      markers.push({
        id: `risk-${ward.id}`,
        ...pt,
        label: t('{0} risk hotspot', ward.code),
        detail: t('Composite risk {0}/100', ward.riskScore),
        kind: 'hotspot',
        severity: ward.riskScore >= 66 ? 'high' : 'medium',
        onClick: () => setSelected({ className: 'Risk hotspot ward', label: ward.name, detail: t('Composite risk {0}/100 · health {1}/100', ward.riskScore, ward.healthScore), drawer: { kind: 'ward', id: ward.id } }),
      })
    })
  }

  if (enabled.environment) {
    for (const station of poorAir) {
      const pt = nextPoint(station.wardId)
      markers.push({
        id: `air-${station.id}`,
        ...pt,
        label: station.name,
        detail: t('Air quality · AQI {0} ({1})', station.aqi, station.category),
        kind: 'station',
        severity: station.category === 'severe' ? 'critical' : 'high',
        onClick: () => setSelected({ className: 'Air quality station', label: station.name, detail: t('AQI {0} ({1}) · PM2.5 {2} · PM10 {3}', station.aqi, station.category, station.pm25, station.pm10) }),
      })
    }
    for (const reading of exceedingNoise) {
      const pt = nextPoint(reading.wardId)
      markers.push({
        id: `noise-${reading.id}`,
        ...pt,
        label: reading.location,
        detail: t('Noise exceedance · {0}', reading.zoneType),
        kind: 'hotspot',
        severity: 'medium',
        onClick: () => setSelected({ className: 'Noise reading (exceedance)', label: reading.location, detail: t('{0} zone · day {1} dB (limit {2}) · night {3} dB (limit {4})', reading.zoneType, reading.dayDb, reading.dayLimitDb, reading.nightDb, reading.nightLimitDb) }),
      })
    }
  }

  const readinessByWard = new Map((readinessQuery.data ?? []).map((r) => [r.wardId, r.readinessScore]))

  function toggleLayer(id: LayerId): void {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function openSelected(): void {
    if (selected?.drawer) openDrawer(selected.drawer)
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Strategic Urban Intelligence')}
        breadcrumbs={[{ label: t('Strategic Urban Intelligence') }, { label: t('{0} Urban Digital Twin', corporation.city) }]}
        freshness={FRESHNESS}
      />

      {anyLoading ? <LoadingState variant="metrics" /> : null}
      {anyError ? <ErrorState detail={anyError.message} onRetry={() => wardsQuery.refetch()} /> : null}

      {!anyLoading && !anyError ? (
        wards.length === 0 ? (
          <EmptyState title={t('No ward records available')} detail="No ward records are visible within your authorised scope." />
        ) : (
          /* ── Two columns ───────────────────────────────────────────
             The layer control sits directly above the map it governs, down the
             wide column. The inventory of what is currently drawn, and the
             entity an officer has selected on it, stand pinned beside them so a
             marker's record stays on screen while the map is panned. */
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-3 xl:col-span-8">
              <Card flush>
                <CardHeader className="px-4 pt-4 pb-3" icon={<Layers className="h-4 w-4" />} title={t('Layer control')} description={t('Independent toggles - combine any number of entity-class layers on the map at once.')} />
                <div className="grid grid-cols-2 gap-1.5 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-5">
                  {LAYER_ORDER.map((id) => (
                    <label
                      key={id}
                      title={LAYER_META[id].description}
                      className={
                        'flex cursor-pointer flex-col gap-1 rounded-[2px] border p-2 transition-colors ' +
                        (enabled[id] ? 'border-govt-300 bg-govt-50/60' : 'border-ink-100 bg-surface-sunken hover:bg-ink-50')
                      }
                    >
                      <Checkbox
                        checked={enabled[id]}
                        onChange={() => toggleLayer(id)}
                        label={
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LAYER_META[id].colour }} aria-hidden />
                            {LAYER_META[id].label}
                          </span>
                        }
                      />
                      <span className="numeric pl-4 text-[0.6875rem] text-ink-500">{counts[id]}</span>
                    </label>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title={t('City map')} description={t('A ward choropleth selector is available from the layer control on the map itself; entity markers reflect the toggles above.')} />
                <div className="mt-3">
                  <CityMap
                    layers={[
                      { id: 'risk', label: t('Ward Risk'), valueFor: (id) => wards.find((w) => w.id === id)?.riskScore, higherIsWorse: true, unit: '/100', description: t('Composite ward risk index.') },
                      { id: 'health', label: t('Ward Health'), valueFor: (id) => wards.find((w) => w.id === id)?.healthScore, higherIsWorse: false, unit: '/100', description: t('Composite ward operational health index.') },
                      {
                        id: 'density',
                        label: t('Population Density'),
                        valueFor: (id) => {
                          const w = wards.find((w2) => w2.id === id)
                          return w ? Math.min(100, (w.population / w.areaSqKm / 60_000) * 100) : undefined
                        },
                        higherIsWorse: true,
                        unit: ' (scaled)',
                        description: t('Population density scaled to a 0–100 shading band.'),
                      },
                      { id: 'monsoon', label: t('Monsoon Readiness'), valueFor: (id) => readinessByWard.get(id), higherIsWorse: false, unit: '/100', description: t('Ward monsoon readiness score.') },
                    ]}
                    selectedWardId={selectedWardId}
                    onWardSelect={(id) => {
                      setSelectedWardId(id === selectedWardId ? null : id)
                      openDrawer({ kind: 'ward', id })
                    }}
                    markers={markers}
                    paths={paths}
                    height={460}
                  />
                </div>
              </Card>
            </div>

            {/* The whole column pins, not one panel of it: a `sticky` element
                stays in flow, so a panel below a pinned one would slide up
                underneath it. */}
            <div className="xl:col-span-4">
              <div className="scrollbar-rail flex flex-col gap-3 xl:sticky xl:top-[3.75rem] xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto">
                <Card>
                  <CardHeader icon={<Network className="h-4 w-4" />} title={t('Entity inventory')} description={t('Counts currently represented on the map, by class.')} />
                  <ul className="mt-2 space-y-1.5">
                    {LAYER_ORDER.map((id) => (
                      <li key={id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 text-ink-600">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: LAYER_META[id].colour }} aria-hidden />
                          <span className="truncate">{LAYER_META[id].label}</span>
                        </span>
                        <Badge tone={enabled[id] ? 'info' : 'muted'}>{counts[id]}</Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-ink-100 pt-2 text-[0.625rem] leading-relaxed text-ink-400">
                    {t('Map geometry (ward boundaries, corridor paths, marker placement) is illustrative and generated for demonstration. It is not surveyed GIS boundary data.')}
                  </p>
                </Card>

                <Card>
                  <CardHeader icon={<MapPinned className="h-4 w-4" />} title={t('Selected entity')} description={t('Select any marker on the map for its summary here.')} />
                  {selected ? (
                    <>
                      <p className="mt-2 text-[0.625rem] font-semibold tracking-wide text-govt-600 uppercase">{selected.className}</p>
                      <p className="mt-0.5 text-sm font-medium text-ink-900">{selected.label}</p>
                      <DefinitionList className="mt-2">
                        <DefinitionRow label={t('Detail')}>{selected.detail}</DefinitionRow>
                      </DefinitionList>
                      {selected.drawer ? (
                        <button type="button" onClick={openSelected} className="mt-2 text-xs font-medium text-govt-700 hover:underline">
                          {t('Open full record →')}
                        </button>
                      ) : (
                        <p className="mt-2 text-[0.625rem] text-ink-400">
                          {t('No dedicated record drawer exists for this entity class yet - this summary is the full detail currently available.')}
                        </p>
                      )}
                    </>
                  ) : (
                    <EmptyState compact title={t('Nothing selected')} detail="Click a marker or ward on the map." />
                  )}
                </Card>
              </div>
            </div>
          </div>
        )
      ) : null}

      <p className="text-[0.6875rem] text-ink-400">{t('Freshness reference: generated {0}.', formatRelative(FRESHNESS.generatedAt))}</p>
      <DemonstrationNotice />
    </PageBody>
  )
}

export default DigitalTwinPage
