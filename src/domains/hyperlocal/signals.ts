import {
  ROAD_DEFECTS,
  SEWERAGE_NODES,
  STORM_DRAINS,
  TRAFFIC_CORRIDORS,
  WASTE_HOTSPOTS,
  WATERLOGGING_SPOTS,
  WATER_ASSETS,
} from '@/data/city.data'
import { wardName } from '@/data/reference'
import type { Complaint } from '@/types/operations'
import type { Severity } from '@/types/common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Hyperlocal Signal Engine.
 *
 * City-level and even ward-level figures hide the thing a field team actually
 * needs: the specific locality where several different problems are stacking
 * up at once. A ward that looks acceptable on average can contain a street
 * where drainage, waste and road defects are all failing together.
 *
 * This engine composes the signals the platform already holds down to locality
 * level. It reads no citizen personal data - a complaint contributes only its
 * category, locality and timing, never who raised it. Locations are the
 * corporation's own asset and locality references, not citizen addresses.
 */

export type SignalKind =
  | 'complaint-hotspot'
  | 'road-defect'
  | 'water-leakage'
  | 'flooding'
  | 'waste-accumulation'
  | 'vector-risk'
  | 'street-light'
  | 'sewerage-failure'
  | 'traffic-bottleneck'

function build$SIGNAL_LABEL(): Record<SignalKind, string> {
  return {
  'complaint-hotspot': t('Complaint hotspot'),
  'road-defect': t('Road defect cluster'),
  'water-leakage': t('Water leakage indicator'),
  flooding: t('Flooding / waterlogging'),
  'waste-accumulation': t('Waste accumulation'),
  'vector-risk': t('Vector-breeding risk indicator'),
  'street-light': t('Street light failure'),
  'sewerage-failure': t('Sewerage failure'),
  'traffic-bottleneck': t('Traffic bottleneck'),
}
}
export let SIGNAL_LABEL: Record<SignalKind, string> = build$SIGNAL_LABEL()
registerLayer(() => {
  SIGNAL_LABEL = build$SIGNAL_LABEL()
})

/**
 * Weight each signal carries in the composite. Published so a locality's
 * ranking can be explained to the ward officer whose queue it changes.
 */
export const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  flooding: 1.4,
  'sewerage-failure': 1.3,
  'water-leakage': 1.2,
  'vector-risk': 1.2,
  'road-defect': 1.0,
  'waste-accumulation': 1.0,
  'complaint-hotspot': 0.9,
  'traffic-bottleneck': 0.8,
  'street-light': 0.6,
}

export interface HyperlocalSignal {
  kind: SignalKind
  label: string
  count: number
  severity: Severity
  detail: string
}

export interface HyperlocalCell {
  id: string
  wardId: string
  wardLabel: string
  localityName: string
  signals: HyperlocalSignal[]
  /** Distinct signal types present - stacking is the point of this page. */
  signalTypes: number
  openComplaints: number
  recurringComplaints: number
  /** 0–100 composite; higher is worse. */
  compositeScore: number
  severity: Severity
  /** Why this locality scores as it does, in plain language. */
  explanation: string
}

function severityFor(score: number): Severity {
  if (score >= 78) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  if (score >= 20) return 'low'
  return 'info'
}

/**
 * Ward-level infrastructure signals, resolved once per ward.
 *
 * Locality is modelled on complaints; the corporation's asset registers are
 * held at ward level, so an infrastructure signal is attributed to every
 * locality in that ward. The page states this so no one reads a locality
 * attribution as a surveyed position.
 */
function wardSignals(wardId: string): HyperlocalSignal[] {
  const signals: HyperlocalSignal[] = []

  const defects = ROAD_DEFECTS.filter(
    (d) => d.wardId === wardId && d.status !== 'repaired' && d.status !== 'verified-closed',
  )
  if (defects.length > 0) {
    signals.push({
      kind: 'road-defect',
      label: SIGNAL_LABEL['road-defect'],
      count: defects.length,
      severity: defects.some((d) => d.severity === 'critical') ? 'critical' : defects.length >= 6 ? 'high' : 'medium',
      detail: t('{0} open road defect(s) in this ward, highest priority score {1}.', defects.length, Math.max(...defects.map((d) => d.priorityScore))),
    })
  }

  const spots = WATERLOGGING_SPOTS.filter((s) => s.wardId === wardId)
  if (spots.length > 0) {
    signals.push({
      kind: 'flooding',
      label: SIGNAL_LABEL.flooding,
      count: spots.length,
      severity: spots.length >= 3 ? 'high' : 'medium',
      detail: t('{0} recorded waterlogging location(s) in this ward.', spots.length),
    })
  }

  const drains = STORM_DRAINS.filter((d) => d.wardId === wardId && d.blockageRisk >= 60)
  if (drains.length > 0) {
    signals.push({
      kind: 'flooding',
      label: t('Drain blockage risk'),
      count: drains.length,
      severity: drains.some((d) => d.blockageRisk >= 80) ? 'high' : 'medium',
      detail: t('{0} drain(s) at or above 60/100 blockage risk.', drains.length),
    })
  }

  const hotspots = WASTE_HOTSPOTS.filter((h) => h.wardId === wardId)
  if (hotspots.length > 0) {
    signals.push({
      kind: 'waste-accumulation',
      label: SIGNAL_LABEL['waste-accumulation'],
      count: hotspots.length,
      severity: hotspots.some((h) => h.severity === 'critical' || h.severity === 'high') ? 'high' : 'medium',
      detail: t('{0} recorded waste accumulation hotspot(s).', hotspots.length),
    })
  }

  const sewerage = SEWERAGE_NODES.filter((n) => n.wardId === wardId && n.blockages30d > 0)
  if (sewerage.length > 0) {
    const blockages = sewerage.reduce((s, n) => s + n.blockages30d, 0)
    signals.push({
      kind: 'sewerage-failure',
      label: SIGNAL_LABEL['sewerage-failure'],
      count: blockages,
      severity: blockages >= 5 ? 'high' : 'medium',
      detail: t('{0} sewerage blockage(s) recorded across {1} node(s) in the last 30 days.', blockages, sewerage.length),
    })
  }

  const leaks = WATER_ASSETS.filter((a) => a.wardId === wardId && a.state !== 'operational')
  if (leaks.length > 0) {
    signals.push({
      kind: 'water-leakage',
      label: SIGNAL_LABEL['water-leakage'],
      count: leaks.length,
      severity: leaks.length >= 3 ? 'high' : 'medium',
      detail: t('{0} water asset(s) in this ward are not in a fully operational state.', leaks.length),
    })
  }

  const corridors = TRAFFIC_CORRIDORS.filter((c) => c.wardIds.includes(wardId) && c.congestionIndex >= 65)
  if (corridors.length > 0) {
    signals.push({
      kind: 'traffic-bottleneck',
      label: SIGNAL_LABEL['traffic-bottleneck'],
      count: corridors.length,
      severity: corridors.some((c) => c.congestionIndex >= 80) ? 'high' : 'medium',
      detail: t('{0} corridor(s) through this ward at or above 65/100 congestion.', corridors.length),
    })
  }

  // Waste accumulation plus standing water is the recognised vector-breeding
  // combination. It is an environmental indicator, never a health diagnosis.
  if (hotspots.length > 0 && spots.length > 0) {
    signals.push({
      kind: 'vector-risk',
      label: SIGNAL_LABEL['vector-risk'],
      count: hotspots.length + spots.length,
      severity: hotspots.length + spots.length >= 5 ? 'high' : 'medium',
      detail: t('{0} waste hotspot(s) coincide with {1} standing-water location(s) in this ward - the recognised vector-breeding combination. This is an environmental indicator, not a health diagnosis.', hotspots.length, spots.length),
    })
  }

  return signals
}

/**
 * Builds the hyperlocal picture from the complaints supplied (already scoped
 * to the acting principal) plus ward infrastructure signals.
 */
export function hyperlocalCells(complaints: Complaint[], minComplaints = 2): HyperlocalCell[] {
  const byLocality = new Map<string, Complaint[]>()
  for (const c of complaints) {
    const key = `${c.wardId}|${c.localityName}`
    const list = byLocality.get(key) ?? []
    list.push(c)
    byLocality.set(key, list)
  }

  const wardSignalCache = new Map<string, HyperlocalSignal[]>()

  const cells: HyperlocalCell[] = []
  for (const [key, items] of byLocality) {
    if (items.length < minComplaints) continue
    const first = items[0]
    if (!first) continue

    if (!wardSignalCache.has(first.wardId)) wardSignalCache.set(first.wardId, wardSignals(first.wardId))
    const infra = wardSignalCache.get(first.wardId) ?? []

    const open = items.filter((c) => c.status !== 'resolved' && c.status !== 'closed').length
    const recurring = items.filter((c) => c.repeatCount > 0).length

    const complaintSignal: HyperlocalSignal = {
      kind: 'complaint-hotspot',
      label: SIGNAL_LABEL['complaint-hotspot'],
      count: items.length,
      severity: items.length >= 8 ? 'high' : items.length >= 4 ? 'medium' : 'low',
      detail: t('{0} report(s) at this locality, {1} still open, {2} repeat.', items.length, open, recurring),
    }

    const streetLight = items.filter((c) => c.category === 'street-light').length
    const localSignals: HyperlocalSignal[] = [complaintSignal]
    if (streetLight > 0) {
      localSignals.push({
        kind: 'street-light',
        label: SIGNAL_LABEL['street-light'],
        count: streetLight,
        severity: streetLight >= 3 ? 'medium' : 'low',
        detail: t('{0} street-light report(s) at this locality.', streetLight),
      })
    }

    const signals = [...localSignals, ...infra]

    // Composite: each present signal contributes its weight scaled by count,
    // then the whole is normalised. Stacking distinct problem types is what
    // pushes a locality up the ranking, which is the intent.
    const raw = signals.reduce((sum, s) => sum + SIGNAL_WEIGHTS[s.kind] * Math.min(s.count, 10), 0)
    const compositeScore = Math.max(0, Math.min(100, Math.round(raw * 2.4)))
    const signalTypes = new Set(signals.map((s) => s.kind)).size

    const topSignals = [...signals]
      .sort((a, b) => SIGNAL_WEIGHTS[b.kind] * b.count - SIGNAL_WEIGHTS[a.kind] * a.count)
      .slice(0, 3)
      .map((s) => s.label.toLowerCase())

    cells.push({
      id: key.replace('|', '::'),
      wardId: first.wardId,
      wardLabel: wardName(first.wardId),
      localityName: first.localityName,
      signals,
      signalTypes,
      openComplaints: open,
      recurringComplaints: recurring,
      compositeScore,
      severity: severityFor(compositeScore),
      explanation: `${signalTypes} distinct signal type(s) are present at this locality, led by ${topSignals.join(', ')}. Complaint counts are locality-level; infrastructure signals are held at ward level and attributed to every locality in ${wardName(first.wardId)}.`,
    })
  }

  return cells.sort((a, b) => b.compositeScore - a.compositeScore)
}

export interface HyperlocalWardRollup {
  wardId: string
  wardLabel: string
  localities: number
  worstScore: number
  meanScore: number
  totalOpenComplaints: number
}

/** Ward-level rollup, used to drive the map fill. */
export function hyperlocalWardRollup(cells: HyperlocalCell[]): HyperlocalWardRollup[] {
  const byWard = new Map<string, HyperlocalCell[]>()
  for (const c of cells) {
    const list = byWard.get(c.wardId) ?? []
    list.push(c)
    byWard.set(c.wardId, list)
  }

  return [...byWard.entries()]
    .map(([wardId, items]) => ({
      wardId,
      wardLabel: wardName(wardId),
      localities: items.length,
      worstScore: Math.max(...items.map((i) => i.compositeScore)),
      meanScore: Math.round(items.reduce((s, i) => s + i.compositeScore, 0) / items.length),
      totalOpenComplaints: items.reduce((s, i) => s + i.openComplaints, 0),
    }))
    .sort((a, b) => b.worstScore - a.worstScore)
}
