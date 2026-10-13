import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Canvas, LatLngBounds, LayerGroup, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './geo-map.css'
import { activeCorporation } from '@/config/municipality.config'
import { cn } from '@/utils/cn'
import { t } from '@/i18n'

/** How a point's position was arrived at, so its tooltip can say so. */
export type PositionBasis = 'osm-place' | 'schematic-division'

/** The active corporation's centre, read when the map mounts so a corporation switch moves it. */
function mapCentre(): [number, number] {
  return [activeCorporation.latLng.lat, activeCorporation.latLng.lng]
}

/** Mumbai spans ~40 km north to south; the map fits to its points anyway. */
const DEFAULT_ZOOM = 11

/** Points further than this from the city centre are drawn but not fitted to. */
const FIT_RADIUS_KM = 60

/**
 * src/components/geo/GeoMap.tsx
 *
 * The real map engine: Leaflet over OpenStreetMap tiles (muted), centred on
 * the city, drawing generic points as canvas circle markers with tooltips,
 * click handlers, a legend, fit-to-bounds and optional size/heat by weight.
 *
 * Honesty: every point may carry a `positionBasis`. Schematic positions (a
 * ward's projected centroid - official ward boundaries are not loaded)
 * are labelled "approximate position" in the tooltip and the legend; see
 * `src/data/nellore/geo-positions.ts`.
 *
 * Resilience: Leaflet is loaded lazily inside an effect, so importing this
 * module never touches `window` (safe under SSR and jsdom). Where Leaflet
 * cannot run - no browser, a jsdom test environment, or a failed load - the
 * same points are drawn on a plain SVG surface with the legend and click
 * handlers intact. If the tiles cannot load (offline), the markers stay on
 * the map's plain background and a note says the basemap is unavailable.
 */

export interface GeoMapPoint {
  id: string
  lat: number
  lon: number
  /** Fill colour. */
  color: string
  /** Base radius in pixels (default 5). */
  radius?: number
  /** Optional weight used by `sizeByWeight` and `heat`. */
  weight?: number
  label: string
  detail?: string
  /** Legend / layer grouping key. */
  group?: string
  onClick?: () => void
  /** Draws a dark outline and a ring - for the selected or most urgent point. */
  emphasis?: boolean
  /** Outline colour (defaults to the fill). */
  stroke?: string
  fillOpacity?: number
  positionBasis?: PositionBasis
  /** English name of the OSM place the position is anchored to, if any. */
  anchorPlace?: string
  /** A short always-visible label (e.g. a division code). */
  permanentLabel?: string
}

/** A route or corridor drawn as a line - a waste collection route, a traffic corridor. */
export interface GeoMapLine {
  id: string
  /** Vertices as [lat, lon]. */
  points: Array<[number, number]>
  color: string
  label: string
  dashed?: boolean
  weight?: number
}

export interface GeoMapLegendItem {
  label: string
  color: string
  count?: number
}

export interface GeoMapProps {
  points: GeoMapPoint[]
  /** Optional routes or corridors drawn beneath the points. */
  lines?: GeoMapLine[]
  height?: number | string
  legend?: GeoMapLegendItem[]
  legendTitle?: string
  /** Changing this re-fits the view to the points. */
  fitKey?: string
  className?: string
  /** Scales radius by `weight` relative to the largest weight shown. */
  sizeByWeight?: boolean
  /** Draws a soft halo under each point, scaled by weight. */
  heat?: boolean
  showBadge?: boolean
  showLabels?: boolean
  maxPoints?: number
  /** Overlay rendered top-left inside the map (e.g. a layer switch). */
  overlay?: ReactNode
  ariaLabel?: string
}

type EngineStatus = 'loading' | 'ready' | 'fallback'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** The position note a tooltip carries, in the interface language. */
export function positionNote(basis: PositionBasis | undefined, anchorPlace?: string): string | null {
  if (!basis) return null
  if (basis === 'osm-place') {
    return anchorPlace
      ? t('Located at {0} (OpenStreetMap place name, not a surveyed address)', anchorPlace)
      : t('OpenStreetMap place name, not a surveyed address')
  }
  return anchorPlace
    ? t('Approximate position near {0} - division boundaries are not published', anchorPlace)
    : t('Approximate position - division boundaries are not published')
}

function canRunLeaflet(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return true
}

function radiusFor(p: GeoMapPoint, sizeByWeight: boolean, maxWeight: number): number {
  const base = p.radius ?? 5
  if (!sizeByWeight || !p.weight || maxWeight <= 0) return base
  return base + Math.sqrt(Math.max(0, p.weight) / maxWeight) * 11
}

export function GeoMap({
  points,
  lines,
  height = 420,
  legend,
  legendTitle,
  fitKey,
  className,
  sizeByWeight = false,
  heat = false,
  showBadge = true,
  showLabels = false,
  maxPoints = 2500,
  overlay,
  ariaLabel,
}: GeoMapProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const fitBoundsRef = useRef<LatLngBounds | null>(null)
  const userMovedRef = useRef(false)
  const groupRef = useRef<LayerGroup | null>(null)
  const rendererRef = useRef<Canvas | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const [status, setStatus] = useState<EngineStatus>(() => (canRunLeaflet() ? 'loading' : 'fallback'))
  // On a phone the legend would cover a third of the city, so it starts folded
  // behind a button there; from `sm` up it is open as before.
  const [legendOpen, setLegendOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 640px)').matches,
  )
  const [tilesFailed, setTilesFailed] = useState(false)

  const shown = useMemo(
    () => (points.length > maxPoints ? points.filter((_, i) => i % Math.ceil(points.length / maxPoints) === 0) : points),
    [points, maxPoints],
  )
  const maxWeight = useMemo(() => shown.reduce((m, p) => Math.max(m, p.weight ?? 0), 0), [shown])
  const approxCount = useMemo(() => shown.filter((p) => p.positionBasis === 'schematic-division').length, [shown])

  // ── Engine lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!canRunLeaflet()) {
      setStatus('fallback')
      return
    }
    let cancelled = false
    let map: LeafletMap | null = null
    import('leaflet')
      .then((mod) => {
        if (cancelled || !hostRef.current) return
        const L = ((mod as unknown as { default?: typeof import('leaflet') }).default ?? mod) as typeof import('leaflet')
        leafletRef.current = L
        map = L.map(hostRef.current, { preferCanvas: true, zoomControl: true, attributionControl: true, scrollWheelZoom: true })
        map.setView(mapCentre(), DEFAULT_ZOOM)
        map.attributionControl.setPrefix(false)
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          className: 'city-geo-tiles',
          maxZoom: 19,
          crossOrigin: true,
        })
        let tileErrors = 0
        tiles.on('tileerror', () => {
          tileErrors += 1
          if (tileErrors >= 3) setTilesFailed(true)
        })
        tiles.on('tileload', () => setTilesFailed(false))
        tiles.addTo(map)
        rendererRef.current = L.canvas({ padding: 0.4 })
        groupRef.current = L.layerGroup().addTo(map)
        mapRef.current = map
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('fallback')
      })
    return () => {
      cancelled = true
      if (map) map.remove()
      mapRef.current = null
      groupRef.current = null
      rendererRef.current = null
    }
  }, [])

  // Keep Leaflet's size in step with its container (expand / collapse, grid reflow).
  useEffect(() => {
    if (status !== 'ready' || !hostRef.current || typeof ResizeObserver === 'undefined') return
    // A map laid out before its container reaches full size fits to a tiny
    // box and stays zoomed out, so the fit is re-applied as the container
    // grows - until the reader has moved the map themselves.
    const host = hostRef.current
    const markMoved = (): void => {
      userMovedRef.current = true
    }
    host.addEventListener('pointerdown', markMoved)
    host.addEventListener('wheel', markMoved, { passive: true })
    const obs = new ResizeObserver(() => {
      const map = mapRef.current
      if (!map) return
      map.invalidateSize()
      if (!userMovedRef.current && fitBoundsRef.current) map.fitBounds(fitBoundsRef.current, { padding: [24, 24], maxZoom: 15 })
    })
    obs.observe(host)
    return () => {
      obs.disconnect()
      host.removeEventListener('pointerdown', markMoved)
      host.removeEventListener('wheel', markMoved)
    }
  }, [status])

  // ── Draw markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const L = leafletRef.current
    const group = groupRef.current
    const renderer = rendererRef.current
    if (status !== 'ready' || !L || !group || !renderer) return
    group.clearLayers()
    for (const line of lines ?? []) {
      if (line.points.length < 2) continue
      L.polyline(line.points, {
        renderer,
        color: line.color,
        weight: line.weight ?? 3,
        opacity: 0.8,
        dashArray: line.dashed ? '6 5' : undefined,
      })
        .bindTooltip(escapeHtml(line.label), { sticky: true })
        .addTo(group)
    }
    const ordered = [...shown].sort((a, b) => Number(Boolean(a.emphasis)) - Number(Boolean(b.emphasis)))
    for (const p of ordered) {
      const r = radiusFor(p, sizeByWeight, maxWeight)
      if (heat) {
        L.circleMarker([p.lat, p.lon], {
          renderer,
          radius: r * 2.6,
          stroke: false,
          fillColor: p.color,
          fillOpacity: 0.13,
          interactive: false,
        }).addTo(group)
      }
      if (p.emphasis) {
        L.circleMarker([p.lat, p.lon], { renderer, radius: r + 5, color: p.color, weight: 2, opacity: 0.55, fill: false, interactive: false }).addTo(group)
      }
      const marker = L.circleMarker([p.lat, p.lon], {
        renderer,
        radius: r,
        color: p.emphasis ? '#0b2350' : (p.stroke ?? '#ffffff'),
        weight: p.emphasis ? 2.2 : 1,
        fillColor: p.color,
        fillOpacity: p.fillOpacity ?? (p.emphasis ? 0.92 : 0.72),
        dashArray: p.positionBasis === 'schematic-division' && !p.emphasis ? '2 2' : undefined,
      })
      const note = positionNote(p.positionBasis, p.anchorPlace)
      const html = `<strong>${escapeHtml(p.label)}</strong>${p.detail ? `<br/>${escapeHtml(p.detail)}` : ''}${note ? `<span class="city-geo-tip-note">${escapeHtml(note)}</span>` : ''}`
      marker.bindTooltip(html, { direction: 'top', offset: [0, -r], sticky: false })
      if (p.onClick) marker.on('click', () => p.onClick?.())
      marker.addTo(group)
      if (showLabels && p.permanentLabel) {
        L.tooltip({ permanent: true, direction: 'center', className: 'city-geo-label', interactive: false })
          .setLatLng([p.lat, p.lon])
          .setContent(escapeHtml(p.permanentLabel))
          .addTo(group)
      }
    }
  }, [status, shown, lines, sizeByWeight, heat, maxWeight, showLabels])

  // ── Fit to the points when the fit key changes ─────────────────────────
  const effectiveFitKey = fitKey ?? String(shown.length)
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (status !== 'ready' || !L || !map) return
    if (shown.length === 0) {
      map.setView(mapCentre(), DEFAULT_ZOOM)
      return
    }
    // Fit to the city's own works. A source far outside it - a dam in the next
    // district - is still drawn, but fitting to it would shrink the city to a
    // cluster; it is one zoom-out away.
    const [cLat, cLon] = mapCentre()
    const near = shown.filter((p) => Math.hypot((p.lat - cLat) * 111, (p.lon - cLon) * 105) <= FIT_RADIUS_KM)
    const fitTo = near.length >= 3 ? near : shown
    const bounds = L.latLngBounds(fitTo.map((p) => [p.lat, p.lon] as [number, number])).pad(0.08)
    fitBoundsRef.current = bounds
    userMovedRef.current = false
    map.invalidateSize()
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, effectiveFitKey])

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={cn('relative isolate min-w-0 overflow-hidden rounded-lg border border-ink-200 bg-surface-sunken', className)}
      style={{ height: resolvedHeight }}
      role="region"
      aria-label={ariaLabel ?? t('Map of {0}', activeCorporation.shortName)}
    >
      {status === 'fallback' ? (
        <PlainSurface points={shown} sizeByWeight={sizeByWeight} maxWeight={maxWeight} />
      ) : (
        <div ref={hostRef} className="city-geo-map h-full w-full" />
      )}

      {status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center text-[0.6875rem] text-ink-500">
          {t('Loading map…')}
        </div>
      ) : null}

      {overlay ? <div className="absolute top-2 left-12 z-[1000] max-w-[70%]">{overlay}</div> : null}

      {showBadge ? (
        <div className="pointer-events-none absolute top-2 right-2 z-[1000] rounded border border-warn-200 bg-surface/95 px-1.5 py-0.5 text-[0.59375rem] font-bold tracking-wider text-warn-700">
          {t('DEMONSTRATION DATA')}
        </div>
      ) : null}

      {status === 'fallback' || tilesFailed ? (
        <div className="pointer-events-none absolute top-8 right-2 z-[1000] max-w-[220px] rounded border border-ink-200 bg-surface/95 px-1.5 py-1 text-[0.625rem] leading-snug text-ink-500">
          {t('Basemap unavailable - positions are drawn on a plain surface.')}
        </div>
      ) : null}

      {((legend && legend.length > 0) || approxCount > 0) && !legendOpen ? (
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          aria-expanded={false}
          className="absolute bottom-2 left-2 z-[1000] rounded-md border border-ink-200 bg-surface/95 px-2 py-1 text-[0.6875rem] font-semibold text-ink-700 shadow-xs"
        >
          {t('Legend')}
        </button>
      ) : null}

      {((legend && legend.length > 0) || approxCount > 0) && legendOpen ? (
        <div className="absolute bottom-2 left-2 z-[1000] max-w-[260px] rounded-md border border-ink-200 bg-surface/95 px-2 py-1.5 shadow-xs">
          <div className="flex items-start gap-2">
            {legendTitle ? <p className="mb-1 min-w-0 flex-1 text-[0.59375rem] font-bold tracking-[0.08em] text-ink-500 uppercase">{legendTitle}</p> : <span className="flex-1" />}
            <button
              type="button"
              onClick={() => setLegendOpen(false)}
              aria-expanded
              aria-label={t('Hide legend')}
              className="-mt-0.5 shrink-0 text-[0.75rem] leading-none text-ink-400 hover:text-ink-700 sm:hidden"
            >
              ×
            </button>
          </div>
          {(legend ?? []).map((l) => (
            <div key={l.label} className="flex items-center gap-1.5 text-[0.65625rem] text-ink-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden />
              <span className="min-w-0 truncate">{l.label}</span>
              {l.count !== undefined ? <span className="numeric ml-auto pl-2 text-ink-500 tabular-nums">{l.count}</span> : null}
            </div>
          ))}
          {approxCount > 0 ? (
            <div className="mt-1 flex items-center gap-1.5 border-t border-ink-100 pt-1 text-[0.625rem] text-ink-500">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-ink-500" aria-hidden />
              <span>{t('Dashed outline: approximate position ({0})', approxCount)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {points.length > shown.length ? (
        <div className="absolute right-2 bottom-6 z-[1000] rounded bg-surface/90 px-1.5 py-0.5 text-[0.625rem] text-ink-500">
          {t('Showing {0} of {1} points', shown.length, points.length)}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The no-engine fallback: the same points on a plain surface, projected
 * equirectangularly over their own bounds. Tooltips become SVG titles; clicks
 * still work.
 */
function PlainSurface({ points, sizeByWeight, maxWeight }: { points: GeoMapPoint[]; sizeByWeight: boolean; maxWeight: number }): React.JSX.Element {
  const W = 1000
  const H = 700
  const lats = points.length ? points.map((p) => p.lat) : [mapCentre()[0] - 0.05, mapCentre()[0] + 0.05]
  const lons = points.length ? points.map((p) => p.lon) : [mapCentre()[1] - 0.05, mapCentre()[1] + 0.05]
  const minLat = Math.min(...lats) - 0.005
  const maxLat = Math.max(...lats) + 0.005
  const minLon = Math.min(...lons) - 0.005
  const maxLon = Math.max(...lons) + 0.005
  const sx = (lon: number): number => 40 + ((lon - minLon) / Math.max(1e-6, maxLon - minLon)) * (W - 80)
  const sy = (lat: number): number => 40 + ((maxLat - lat) / Math.max(1e-6, maxLat - minLat)) * (H - 80)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label={t('Map of {0}', activeCorporation.shortName)}>
      <rect x={0} y={0} width={W} height={H} fill="var(--color-surface-sunken, #f6f8fc)" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`g${i}`} x1={(i + 1) * 100} y1={0} x2={(i + 1) * 100} y2={H} stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {points.map((p) => {
        const r = radiusFor(p, sizeByWeight, maxWeight) * 1.6
        const note = positionNote(p.positionBasis, p.anchorPlace)
        return (
          <circle
            key={p.id}
            cx={sx(p.lon)}
            cy={sy(p.lat)}
            r={r}
            fill={p.color}
            fillOpacity={p.fillOpacity ?? 0.72}
            stroke={p.emphasis ? '#0b2350' : '#ffffff'}
            strokeWidth={p.emphasis ? 3 : 1.5}
            strokeDasharray={p.positionBasis === 'schematic-division' ? '4 3' : undefined}
            className={p.onClick ? 'cursor-pointer' : undefined}
            onClick={p.onClick}
          >
            <title>{[p.label, p.detail, note].filter(Boolean).join(' - ')}</title>
          </circle>
        )
      })}
    </svg>
  )
}

export default GeoMap
