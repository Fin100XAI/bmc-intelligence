import { useMemo, useState, type ReactNode } from 'react'
import { Info, Layers, Maximize2, Minimize2 } from 'lucide-react'
import { municipality } from '@/config/municipality.config'
import { MAP_BACKDROP_FEATURES, polygonCentroid, polygonPoints } from '@/data/geography'
import { WARDS } from '@/data/reference'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName } from '@/config/corporations'
import type { Severity } from '@/types/common'
import { cn } from '@/utils/cn'
import { Badge } from '@/components/ui/badges'
import { IconButton } from '@/components/ui/primitives'
import { Tooltip } from '@/components/ui/overlays'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Reusable spatial abstraction.
 *
 * The geometry is generated for demonstration. It is NOT official corporation
 * or state GIS boundary data, and the active corporation's own provenance
 * statement is rendered on every instance so that this is never ambiguous.
 */

export interface MapLayerDefinition {
  id: string
  label: string
  /** Ward fill value on a 0–100 scale, higher meaning worse unless inverted. */
  valueFor: (wardId: string) => number | undefined
  higherIsWorse?: boolean
  unit?: string
  description?: string
}

export interface MapMarker {
  id: string
  /** Position in normalised 0–100 map space. */
  x: number
  y: number
  label: string
  detail?: string
  severity?: Severity
  kind?: 'incident' | 'asset' | 'facility' | 'hospital' | 'hotspot' | 'station' | 'defect'
  onClick?: () => void
}

export interface MapPath {
  id: string
  points: Array<[number, number]>
  label: string
  tone?: 'primary' | 'intel' | 'warn' | 'critical' | 'neutral'
  dashed?: boolean
}

export interface CityMapProps {
  layers: MapLayerDefinition[]
  activeLayerId?: string
  onLayerChange?: (id: string) => void
  selectedWardId?: string | null
  onWardSelect?: (wardId: string) => void
  markers?: MapMarker[]
  paths?: MapPath[]
  /** Restricts the rendered wards, e.g. to a principal's authorised scope. */
  visibleWardIds?: string[]
  height?: number | string
  className?: string
  showLegend?: boolean
  showLabels?: boolean
  compact?: boolean
  /** Extra controls rendered in the map toolbar. */
  toolbar?: ReactNode
  caption?: ReactNode
}

function build$FILL_STOPS() {
  return [
  { max: 20, colour: '#10b981', label: t('Very low') },
  { max: 40, colour: '#6ee7b7', label: t('Low') },
  { max: 55, colour: '#fcd34d', label: t('Moderate') },
  { max: 70, colour: '#f59e0b', label: t('Elevated') },
  { max: 85, colour: '#f97316', label: t('High') },
  { max: 101, colour: '#e5484d', label: t('Critical') },
]
}
let FILL_STOPS: ReturnType<typeof build$FILL_STOPS> = build$FILL_STOPS()
registerLayer(() => {
  FILL_STOPS = build$FILL_STOPS()
})

function fillFor(value: number | undefined, higherIsWorse: boolean): string {
  if (value === undefined || Number.isNaN(value)) return '#e2e9f0'
  const normalised = higherIsWorse ? value : 100 - value
  const stop = FILL_STOPS.find((s) => normalised < s.max)
  return stop?.colour ?? '#e5484d'
}

const MARKER_TONE: Record<NonNullable<MapMarker['kind']>, string> = {
  incident: '#e5484d',
  asset: '#2f6feb',
  facility: '#0ea5b7',
  hospital: '#7c3aed',
  hotspot: '#f59e0b',
  station: '#0a8398',
  defect: '#f97316',
}

const PATH_TONE = {
  primary: '#2f6feb',
  intel: '#0ea5b7',
  warn: '#f59e0b',
  critical: '#e5484d',
  neutral: '#8195ac',
}

export function CityMap({
  layers,
  activeLayerId,
  onLayerChange,
  selectedWardId,
  onWardSelect,
  markers = [],
  paths = [],
  visibleWardIds,
  height = 420,
  className,
  showLegend = true,
  showLabels = true,
  compact,
  toolbar,
  caption,
}: CityMapProps): React.JSX.Element {
  const corporation = useActiveCorporation()
  const [internalLayer, setInternalLayer] = useState(layers[0]?.id ?? '')
  const [hovered, setHovered] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)

  const layerId = activeLayerId ?? internalLayer
  const layer = layers.find((l) => l.id === layerId) ?? layers[0]
  const higherIsWorse = layer?.higherIsWorse ?? true

  // `corporation` is a dependency because `WARDS` is a LIVE BINDING, replaced
  // wholesale on a corporation switch. The routed subtree remounts on a switch
  // so this memo is normally rebuilt anyway, but a memo that reads a rebuilt
  // module binding and does not depend on the rebuild is one refactor away from
  // drawing Brihanmumbai's twenty-four wards on Nagpur's outline - and it would
  // do it silently. `AppShell` carries the same dependency for the same reason.
  const wards = useMemo(
    () => (visibleWardIds ? WARDS.filter((w) => visibleWardIds.includes(w.id)) : WARDS),
    [visibleWardIds, corporation],
  )

  const setLayer = (id: string): void => {
    setInternalLayer(id)
    onLayerChange?.(id)
    setLayerMenuOpen(false)
  }

  const hoveredWard = hovered ? wards.find((w) => w.id === hovered) : null
  const hoveredValue = hoveredWard && layer ? layer.valueFor(hoveredWard.id) : undefined

  const resolvedHeight = expanded ? 'min(78vh, 760px)' : typeof height === 'number' ? `${height}px` : height

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {/* Toolbar ------------------------------------------------------- */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {layers.length > 1 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setLayerMenuOpen((v) => !v)}
              aria-expanded={layerMenuOpen}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-surface px-2.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              <Layers className="h-3.5 w-3.5 text-ink-400" />
              {layer?.label ?? 'Layer'}
            </button>
            {layerMenuOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setLayerMenuOpen(false)} aria-hidden />
                <div className="animate-in-scale absolute top-full left-0 z-30 mt-1 w-64 rounded-lg border border-ink-100 bg-surface p-1.5 shadow-overlay">
                  <p className="label-institutional px-1.5 py-1">{t('Map layers')}</p>
                  {layers.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLayer(l.id)}
                      className={cn(
                        'block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        l.id === layerId ? 'bg-govt-50 text-govt-700' : 'text-ink-600 hover:bg-ink-50',
                      )}
                    >
                      <span className="font-medium">{l.label}</span>
                      {l.description ? (
                        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-ink-400">{l.description}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {toolbar}
        <div className="flex-1" />

        <Tooltip content={municipality.mapConfiguration.provenanceStatement} side="left">
          <Badge tone="intel" icon={<Info className="h-3 w-3" />}>
            {t('Illustrative spatial representation')}
          </Badge>
        </Tooltip>

        {!compact ? (
          <IconButton
            label={expanded ? 'Reduce map' : 'Expand map'}
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconButton>
        ) : null}
      </div>

      {/* Canvas -------------------------------------------------------- */}
      <div
        className="relative min-w-0 overflow-hidden rounded-lg border border-ink-100 bg-[#f7fafc]"
        style={{ height: resolvedHeight }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label={t('Illustrative map of {0} {1} showing {2}', cityName(corporation), municipality.terminology.primaryUnitPlural.toLowerCase(), layer?.label ?? `${municipality.terminology.primaryUnitSingular.toLowerCase()} status`)}
        >
          {/* Backdrop features */}
          {MAP_BACKDROP_FEATURES.map((feature) => (
            <polygon
              key={feature.id}
              points={polygonPoints(feature.polygon)}
              fill={feature.kind === 'forest' ? '#dcfce7' : feature.kind === 'creek' ? '#dbeafe' : '#e0f2fe'}
              fillOpacity={0.75}
              stroke="none"
            />
          ))}

          {/* Ward polygons */}
          {wards.map((ward) => {
            const value = layer?.valueFor(ward.id)
            const isSelected = ward.id === selectedWardId
            const isHovered = ward.id === hovered
            return (
              <polygon
                key={ward.id}
                points={polygonPoints(ward.polygon)}
                fill={fillFor(value, higherIsWorse)}
                fillOpacity={isSelected ? 0.95 : isHovered ? 0.88 : 0.74}
                stroke={isSelected ? '#14357c' : '#ffffff'}
                strokeWidth={isSelected ? 0.85 : 0.34}
                strokeLinejoin="round"
                className={cn(onWardSelect && 'cursor-pointer')}
                style={{ transition: 'fill-opacity 160ms var(--ease-calm)' }}
                onMouseEnter={() => setHovered(ward.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onWardSelect?.(ward.id)}
                tabIndex={onWardSelect ? 0 : undefined}
                role={onWardSelect ? 'button' : undefined}
                aria-label={`${ward.code} - ${ward.name.split(' · ')[0]}${
                  value !== undefined ? `, ${layer?.label}: ${Math.round(value)}` : ''
                }`}
                onKeyDown={(e) => {
                  if (onWardSelect && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onWardSelect(ward.id)
                  }
                }}
              />
            )
          })}

          {/* Paths - routes and corridors */}
          {paths.map((path) => (
            <polyline
              key={path.id}
              points={polygonPoints(path.points)}
              fill="none"
              stroke={PATH_TONE[path.tone ?? 'primary']}
              strokeWidth={0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={path.dashed ? '1.6 1.2' : undefined}
              opacity={0.9}
            >
              <title>{path.label}</title>
            </polyline>
          ))}

          {/* Ward labels */}
          {showLabels
            ? wards.map((ward) => {
                const [cx, cy] = polygonCentroid(ward.polygon)
                return (
                  <text
                    key={`label-${ward.id}`}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={1.9}
                    fontWeight={600}
                    fill="#16212f"
                    fillOpacity={0.62}
                    pointerEvents="none"
                  >
                    {ward.code}
                  </text>
                )
              })
            : null}

          {/* Markers */}
          {markers.map((marker) => (
            <g
              key={marker.id}
              transform={`translate(${marker.x} ${marker.y})`}
              className={cn(marker.onClick && 'cursor-pointer')}
              onClick={marker.onClick}
            >
              <circle r={1.55} fill="#ffffff" opacity={0.9} />
              <circle
                r={1.05}
                fill={
                  marker.severity === 'critical'
                    ? '#e5484d'
                    : marker.severity === 'high'
                      ? '#f97316'
                      : marker.severity === 'medium'
                        ? '#f59e0b'
                        : (MARKER_TONE[marker.kind ?? 'asset'] ?? '#2f6feb')
                }
              />
              {marker.severity === 'critical' ? (
                <circle r={1.05} fill="none" stroke="#e5484d" strokeWidth={0.3} opacity={0.6}>
                  <animate attributeName="r" values="1.05;2.6;1.05" dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
                </circle>
              ) : null}
              <title>{marker.detail ? `${marker.label} - ${marker.detail}` : marker.label}</title>
            </g>
          ))}
        </svg>

        {/* Hover readout */}
        {hoveredWard ? (
          <div className="pointer-events-none absolute top-2 left-2 rounded-md border border-ink-100 bg-surface/95 px-2.5 py-1.5 shadow-card backdrop-blur-sm">
            <p className="text-xs font-semibold text-ink-900">
              {hoveredWard.code} - {hoveredWard.name.split(' · ')[0]}
            </p>
            <p className="numeric mt-0.5 text-[0.6875rem] text-ink-500">
              {layer?.label}:{' '}
              <span className="font-semibold text-ink-800">
                {hoveredValue === undefined ? 'No data' : Math.round(hoveredValue)}
                {layer?.unit ?? ''}
              </span>
            </p>
            <p className="mt-0.5 text-[0.625rem] text-ink-400">{hoveredWard.region}</p>
          </div>
        ) : null}

        {/* Legend */}
        {showLegend ? (
          <div className="absolute right-2 bottom-2 rounded-md border border-ink-100 bg-surface/95 px-2.5 py-2 shadow-card backdrop-blur-sm">
            <p className="label-institutional mb-1.5">{layer?.label ?? 'Legend'}</p>
            <div className="flex items-center gap-1.5">
              {FILL_STOPS.map((stop) => (
                <span key={stop.label} className="flex flex-col items-center gap-0.5">
                  <span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: stop.colour }} aria-hidden />
                  <span className="text-[0.5625rem] text-ink-400">{stop.label}</span>
                </span>
              ))}
            </div>
            {markers.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-ink-100 pt-1.5">
                {Array.from(new Set(markers.map((m) => m.kind ?? 'asset'))).map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1 text-[0.5625rem] text-ink-500">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: MARKER_TONE[kind] }} aria-hidden />
                    {kind}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-400">
        {caption ?? municipality.mapConfiguration.provenanceStatement}
      </p>
    </div>
  )
}

/** Converts a ward identifier to its centroid in normalised map space. */
export function wardMapPoint(wardId: string): { x: number; y: number } {
  const ward = WARDS.find((w) => w.id === wardId)
  if (!ward) return { x: 50, y: 50 }
  const [x, y] = polygonCentroid(ward.polygon)
  return { x, y }
}

/**
 * Scatters points deterministically inside a ward so that multiple markers in
 * the same ward do not stack on the centroid.
 */
export function jitteredWardPoint(wardId: string, index: number): { x: number; y: number } {
  const base = wardMapPoint(wardId)
  const angle = (index * 2.399963) % (Math.PI * 2)
  const radius = 0.9 + (index % 4) * 0.55
  return {
    x: Math.round((base.x + Math.cos(angle) * radius * 1.5) * 10) / 10,
    y: Math.round((base.y + Math.sin(angle) * radius) * 10) / 10,
  }
}
