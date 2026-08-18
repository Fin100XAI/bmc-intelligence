import { useMemo, useState } from 'react'
import { AlertTriangle, HardHat, Route, ShieldAlert } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/primitives'
import { GovPanel } from '@/components/gov/GovPanel'
import { LiveIndicator } from '@/components/ui/LiveIndicator'
import { CityMap, jitteredWardPoint, type MapMarker } from '@/components/map/CityMap'
import { useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { incidentService, projectService, roadsService, wardService } from '@/services'
import { useActiveCorporation } from '@/stores/corporation.store'
import { usePageMasthead } from '@/stores/masthead.store'
import { t } from '@/i18n'

/**
 * src/pages/command/CityCommandMapPage.tsx
 *
 * The flagship spatial view: one full-bleed composite of the city's
 * operational position, built from the same `CityMap` component and the same
 * service layer every other page reads - not a rebuild. What makes this page
 * different from the choropleth panel on Ward Intelligence or the nine-layer
 * Digital Twin is presentation and liveness: a single dramatic command
 * surface, and markers sourced from queries that actually poll (see
 * `LiveIndicator`), so a genuinely new incident from the dev-only
 * live-simulation feed appears here without a manual refresh.
 *
 * The geometry underneath is exactly as honest here as everywhere else in
 * the platform - `CityMap` renders its own schematic-tessellation provenance
 * disclosure on every instance, and nothing on this page suppresses it.
 */

type MarkerLayerId = 'incidents' | 'projects' | 'roadDefects'

function build$MARKER_LAYERS(): Record<MarkerLayerId, { label: string; icon: React.ReactNode }> {
  return {
    incidents: { label: t('Incidents'), icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    projects: { label: t('Projects at risk'), icon: <HardHat className="h-3.5 w-3.5" /> },
    roadDefects: { label: t('Road defects'), icon: <Route className="h-3.5 w-3.5" /> },
  }
}

export function CityCommandMapPage(): React.JSX.Element {
  const corporation = useActiveCorporation()
  usePageMasthead(t('{0} Command Map', corporation.city))

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

  const wards = wardsQuery.data ?? []
  const incidents = incidentsQuery.data ?? []
  const projectsAtRisk = projectsQuery.data ?? []
  const defects = defectsQuery.data ?? []

  const markers = useMemo<MapMarker[]>(() => {
    const byWardCount = new Map<string, number>()
    const next = (wardId: string): { x: number; y: number } => {
      const idx = byWardCount.get(wardId) ?? 0
      byWardCount.set(wardId, idx + 1)
      return jitteredWardPoint(wardId, idx)
    }
    const list: MapMarker[] = []
    if (enabled.incidents) {
      for (const incident of incidents) {
        const { x, y } = next(incident.wardId)
        list.push({ id: `incident-${incident.id}`, x, y, label: incident.title, detail: incident.locationName, severity: incident.severity, kind: 'incident' })
      }
    }
    if (enabled.projects) {
      for (const project of projectsAtRisk) {
        const wardId = project.wardIds[0]
        if (!wardId) continue
        const { x, y } = next(wardId)
        list.push({ id: `project-${project.id}`, x, y, label: project.name, detail: project.reference, severity: 'high', kind: 'asset' })
      }
    }
    if (enabled.roadDefects) {
      for (const defect of defects) {
        const { x, y } = next(defect.wardId)
        list.push({
          id: `defect-${defect.id}`,
          x,
          y,
          label: defect.type.replace(/-/g, ' '),
          detail: defect.status.replace(/-/g, ' '),
          severity: defect.severity,
          kind: 'defect',
        })
      }
    }
    return list
  }, [enabled, incidents, projectsAtRisk, defects])

  return (
    <PageBody width="full" className="space-y-3 p-3 sm:p-4">
      <PageHeader
        eyebrow={t('Command')}
        breadcrumbs={[{ label: t('Command') }, { label: t('City Command Map') }]}
        actions={<LiveIndicator dataUpdatedAt={incidentsQuery.dataUpdatedAt} isFetching={incidentsQuery.isFetching} />}
      />

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
            </Button>
          ))}
        </div>

        <CityMap
          layers={[
            {
              id: 'risk',
              label: t('Composite Risk'),
              valueFor: (id) => wards.find((w) => w.id === id)?.riskScore,
              higherIsWorse: true,
              unit: '/100',
              description: t('Composite risk index across every domain, ward by ward.'),
            },
          ]}
          markers={markers}
          selectedWardId={selectedWardId}
          onWardSelect={setSelectedWardId}
          height={560}
          showLegend
          showLabels
        />

        {incidents.some((i) => i.severity === 'critical') && enabled.incidents && (
          <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-crit-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('Critical incidents pulse on the map - open one from the marker to jump into the Situation Room.')}
          </p>
        )}
      </GovPanel>
    </PageBody>
  )
}

export default CityCommandMapPage
