import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Info, Layers } from 'lucide-react'
import type { MapLayerDefinition } from '@/components/map/CityMap'
import { WARDS, wardName } from '@/data/reference'
import { useActiveCorporation } from '@/stores/corporation.store'
import { Badge } from '@/components/ui/badges'
import { Tooltip } from '@/components/ui/overlays'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'
import { GeoMap, type GeoMapLegendItem, type GeoMapLine, type GeoMapPoint } from './GeoMap'

/**
 * src/components/geo/DivisionGeoMap.tsx
 *
 * The ward layer on the real map: each ward office of the active corporation
 * drawn as a circle at the ward's representative point (`Ward.centroid` - an
 * approximate location chosen from the ward's localities, not a computed
 * polygon centroid; see `src/config/bmc/wards.ts`), coloured and sized by the
 * chosen layer's value, with any extra points (incidents, assets) drawn above it.
 *
 * Takes the same `MapLayerDefinition` the schematic `CityMap` takes, so a page
 * moving to the real map keeps its layer definitions unchanged.
 *
 * The component is `WardGeoMap`; `DivisionGeoMap` / `divisionFill` are
 * exported as aliases so pages written against either name work.
 */

function fillStops(): Array<{ max: number; colour: string; label: string }> {
  return [
    { max: 20, colour: '#10b981', label: t('Very low') },
    { max: 40, colour: '#6ee7b7', label: t('Low') },
    { max: 55, colour: '#fcd34d', label: t('Moderate') },
    { max: 70, colour: '#f59e0b', label: t('Elevated') },
    { max: 85, colour: '#f97316', label: t('High') },
    { max: 101, colour: '#e5484d', label: t('Critical') },
  ]
}

export function wardFill(value: number | undefined, higherIsWorse = true): string {
  if (value === undefined || Number.isNaN(value)) return '#c4cfdb'
  const normalised = higherIsWorse ? value : 100 - value
  return fillStops().find((s) => normalised < s.max)?.colour ?? '#e5484d'
}

export interface WardGeoMapProps {
  layers: MapLayerDefinition[]
  activeLayerId?: string
  onLayerChange?: (id: string) => void
  selectedWardId?: string | null
  onWardSelect?: (wardId: string) => void
  /** Extra points drawn above the wards (incidents, assets...). */
  points?: GeoMapPoint[]
  lines?: GeoMapLine[]
  /** Legend rows for the extra points. */
  pointLegend?: GeoMapLegendItem[]
  visibleWardIds?: string[]
  height?: number | string
  showLabels?: boolean
  toolbar?: ReactNode
  caption?: ReactNode
  className?: string
}

export function WardGeoMap({
  layers,
  activeLayerId,
  onLayerChange,
  selectedWardId,
  onWardSelect,
  points = [],
  lines,
  pointLegend,
  visibleWardIds,
  height = 420,
  showLabels = false,
  toolbar,
  caption,
  className,
}: WardGeoMapProps): React.JSX.Element {
  const corporation = useActiveCorporation()
  // A page may drive the layer (`activeLayerId`); the operator can still
  // switch it from the map's own control until the page changes it again.
  const [userLayer, setUserLayer] = useState<string | null>(null)
  useEffect(() => setUserLayer(null), [activeLayerId])
  const layerId = userLayer ?? activeLayerId ?? layers[0]?.id ?? ''
  const layer = layers.find((l) => l.id === layerId) ?? layers[0]
  const higherIsWorse = layer?.higherIsWorse ?? true

  const wardPoints = useMemo<GeoMapPoint[]>(() => {
    const wards = visibleWardIds ? WARDS.filter((w) => visibleWardIds.includes(w.id)) : WARDS
    const out: GeoMapPoint[] = []
    for (const w of wards) {
      if (!w.centroid) continue
      const value = layer?.valueFor(w.id)
      const severityValue = value === undefined ? 0 : higherIsWorse ? value : 100 - value
      out.push({
        id: `ward:${w.id}`,
        lat: w.centroid.lat,
        lon: w.centroid.lng,
        color: wardFill(value, higherIsWorse),
        radius: 7 + Math.max(0, Math.min(100, severityValue)) / 9,
        fillOpacity: 0.5,
        stroke: '#475569',
        label: wardName(w.id),
        detail: layer ? `${layer.label}: ${value === undefined ? t('No data') : `${Math.round(value)}${layer.unit ?? ''}`}` : undefined,
        positionBasis: 'schematic-division',
        emphasis: w.id === selectedWardId,
        permanentLabel: w.code,
        onClick: onWardSelect ? () => onWardSelect(w.id) : undefined,
      })
    }
    return out
    // `corporation`: WARDS is a live binding replaced on a corporation switch.
  }, [layer, higherIsWorse, visibleWardIds, selectedWardId, onWardSelect, corporation])

  const allPoints = useMemo(() => [...wardPoints, ...points], [wardPoints, points])
  const fitKey = `${corporation.id}|${visibleWardIds?.join(',') ?? 'all'}`

  const setLayer = (id: string): void => {
    setUserLayer(id)
    onLayerChange?.(id)
  }

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {layers.length > 1 ? (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-600">
            <Layers className="h-3.5 w-3.5 text-ink-400" />
            <span className="sr-only">{t('Map layers')}</span>
            <select
              value={layer?.id}
              onChange={(e) => setLayer(e.target.value)}
              className="h-7 rounded-md border border-ink-200 bg-surface px-2 text-xs font-medium text-ink-700"
              aria-label={t('Map layers')}
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        ) : layer ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-700">
            <Layers className="h-3.5 w-3.5 text-ink-400" />
            {layer.label}
          </span>
        ) : null}
        {toolbar}
        <div className="flex-1" />
        <Tooltip content={t('Map tiles © OpenStreetMap contributors. Ward boundaries are not loaded here: each ward is drawn at an approximate representative point within its localities.')} side="left">
          <Badge tone="intel" icon={<Info className="h-3 w-3" />}>
            {t('OpenStreetMap · approximate ward positions')}
          </Badge>
        </Tooltip>
      </div>
      <GeoMap
        points={allPoints}
        lines={lines}
        height={height}
        fitKey={fitKey}
        showLabels={showLabels}
        legendTitle={layer?.label}
        legend={[
          ...fillStops().map((s) => ({ label: s.label, color: s.colour })),
          ...(pointLegend ?? []),
        ]}
      />
      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-400">
        {caption ??
          t('Circles mark wards, coloured and sized by the selected layer. Ward positions are approximate - no ward boundaries are drawn.')}
      </p>
    </div>
  )
}

/** Earlier names, kept so existing imports keep working. */
export const DivisionGeoMap = WardGeoMap
export const divisionFill = wardFill
export type DivisionGeoMapProps = WardGeoMapProps

export default WardGeoMap
