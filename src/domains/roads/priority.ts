import type { RoadDefect } from '@/types/city-domains'
import { ROAD_DEFECTS, ROAD_PRIORITY_WEIGHTS, computeDefectPriority } from '@/data/city.data'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Road Defect Priority Engine.
 *
 * The weights are published so that every ordering is explainable and
 * defensible. Constrained rectification capacity is directed by criteria that
 * can be shown, not by representation.
 */

export { ROAD_PRIORITY_WEIGHTS, computeDefectPriority }

function build$ROAD_PRIORITY_LABELS(): Record<keyof typeof ROAD_PRIORITY_WEIGHTS, string> {
  return {
  severity: t('Defect severity'),
  trafficImportance: t('Traffic importance'),
  citizenComplaints: t('Citizen complaints'),
  repeatFailures: t('Repeat failures at this location'),
  hospitalSchoolAccess: t('Hospital / school access'),
  emergencyRoute: t('Emergency route importance'),
}
}
export let ROAD_PRIORITY_LABELS: Record<keyof typeof ROAD_PRIORITY_WEIGHTS, string> = build$ROAD_PRIORITY_LABELS()
registerLayer(() => {
  ROAD_PRIORITY_LABELS = build$ROAD_PRIORITY_LABELS()
})

/** Defects ranked strictly by the published priority score. */
export function rankedDefects(limit = 25, wardId?: string): RoadDefect[] {
  return ROAD_DEFECTS.filter((d) => (wardId ? d.wardId === wardId : true))
    .filter((d) => d.status !== 'verified-closed' && d.status !== 'repaired')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
}

export interface PriorityBand {
  band: string
  min: number
  max: number
  count: number
  description: string
  tone: 'critical' | 'risk' | 'warn' | 'info'
}

/** The banded distribution used to communicate the rectification queue. */
export function defectPriorityBands(wardId?: string): PriorityBand[] {
  const pool = ROAD_DEFECTS.filter((d) => (wardId ? d.wardId === wardId : true))
  const bands: Array<Omit<PriorityBand, 'count'>> = [
    {
      band: 'Immediate',
      min: 75,
      max: 100,
      description:
        t('Emergency corridor or hospital access with high severity. Rectified first regardless of geographic distribution.'),
      tone: 'critical',
    },
    {
      band: 'Priority',
      min: 58,
      max: 74,
      description: t('High traffic importance or repeat failure. Programmed within the current rectification window.'),
      tone: 'risk',
    },
    {
      band: 'Scheduled',
      min: 40,
      max: 57,
      description: t('Material defect on a route of ordinary importance. Programmed into the next cycle.'),
      tone: 'warn',
    },
    {
      band: 'Monitored',
      min: 0,
      max: 39,
      description: t('Recorded and monitored. Rectified within routine maintenance rather than a priority work order.'),
      tone: 'info',
    },
  ]

  return bands.map((band) => ({
    ...band,
    count: pool.filter((d) => d.priorityScore >= band.min && d.priorityScore <= band.max).length,
  }))
}

/** Work-order status distribution for the rectification pipeline view. */
export function defectStatusDistribution(wardId?: string): Array<{ id: string; label: string; value: number }> {
  const pool = ROAD_DEFECTS.filter((d) => (wardId ? d.wardId === wardId : true))
  const stages: Array<{ id: RoadDefect['status']; label: string }> = [
    { id: 'reported', label: t('Reported') },
    { id: 'verified', label: t('Verified') },
    { id: 'work-order-issued', label: t('Work order issued') },
    { id: 'in-repair', label: t('In repair') },
    { id: 'repaired', label: t('Repaired') },
    { id: 'verified-closed', label: t('Verified closed') },
  ]
  return stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    value: pool.filter((d) => d.status === stage.id).length,
  }))
}

export const PRIORITY_ENGINE_STATEMENT =
  'Rectification capacity is directed strictly by the published priority score. Segments carrying hospital access and designated emergency corridors attract the highest weighting. The ordering is transparent so that it can be defended, and so that a ward receiving no treatment in a given window can be shown why.'
