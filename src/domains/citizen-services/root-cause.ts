import {
  ROAD_DEFECTS,
  SEWERAGE_NODES,
  STORM_DRAINS,
  WASTE_HOTSPOTS,
  WATERLOGGING_SPOTS,
} from '@/data/city.data'
import { departmentName, wardName } from '@/data/reference'
import { COMPLAINT_CATEGORY_LABEL, type Complaint, type ComplaintCategory } from '@/types/operations'
import type { ComplaintChannel } from '@/types/operations'
import type { Severity } from '@/types/common'
import { t } from '@/i18n'

/**
 * Citizen Service Root Cause Engine.
 *
 * Counting complaints tells a corporation how loud a problem is, not what is
 * causing it. This engine goes the step further the department actually needs:
 * it groups recurring complaints by locality and category, then associates
 * each cluster with the infrastructure records the corporation already holds
 * in that ward.
 *
 * An association is a correlation of place and category, not a proof of cause.
 * The language throughout says "associated with", never "caused by" - the
 * engineering judgement of what is actually causing a cluster belongs to the
 * officer who inspects it.
 *
 * No personal citizen data is read, held or displayed anywhere in this module.
 */

const OPEN_STATUSES: ReadonlyArray<Complaint['status']> = ['registered', 'assigned', 'in-progress', 'reopened']

export function isOpen(c: Complaint): boolean {
  return OPEN_STATUSES.includes(c.status)
}

export interface ServiceIntelligenceSummary {
  total: number
  open: number
  resolved: number
  reopened: number
  /** Share of complaints logged at a location that has complained before. */
  recurringPct: number
  reopeningPct: number
  slaBreached: number
  slaCompliancePct: number
  meanAgeHours: number
  /** Complaints whose repeat count indicates an unresolved underlying issue. */
  recurring: number
}

export function serviceSummary(complaints: Complaint[]): ServiceIntelligenceSummary {
  const total = complaints.length
  const open = complaints.filter(isOpen).length
  const resolved = complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length
  const reopened = complaints.filter((c) => c.status === 'reopened').length
  const recurring = complaints.filter((c) => c.repeatCount > 0).length
  const slaBreached = complaints.filter((c) => c.slaBreached).length
  const meanAgeHours = total > 0 ? complaints.reduce((s, c) => s + c.ageHours, 0) / total : 0

  return {
    total,
    open,
    resolved,
    reopened,
    recurring,
    recurringPct: total > 0 ? Math.round((recurring / total) * 1000) / 10 : 0,
    reopeningPct: total > 0 ? Math.round((reopened / total) * 1000) / 10 : 0,
    slaBreached,
    slaCompliancePct: total > 0 ? Math.round(((total - slaBreached) / total) * 1000) / 10 : 0,
    meanAgeHours: Math.round(meanAgeHours * 10) / 10,
  }
}

export interface RecurringCluster {
  id: string
  wardId: string
  wardLabel: string
  localityName: string
  category: ComplaintCategory
  categoryLabel: string
  departmentId: string
  departmentLabel: string
  complaints: number
  /** Complaints at this cluster carrying a repeat count above zero. */
  recurring: number
  reopened: number
  slaBreached: number
  meanAgeHours: number
  severity: Severity
  /** Highest repeat count seen in the cluster. */
  maxRepeat: number
}

/**
 * Complaints grouped by the unit a department can actually act on: a locality
 * and a service category, in one ward.
 */
export function recurringClusters(complaints: Complaint[], minComplaints = 3): RecurringCluster[] {
  const groups = new Map<string, Complaint[]>()
  for (const c of complaints) {
    const key = `${c.wardId}|${c.localityName}|${c.category}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }

  const clusters: RecurringCluster[] = []
  for (const [key, items] of groups) {
    if (items.length < minComplaints) continue
    const first = items[0]
    if (!first) continue

    const recurring = items.filter((c) => c.repeatCount > 0).length
    const severityRank: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 }
    const severity = items.reduce<Severity>(
      (worst, c) => (severityRank[c.severity] > severityRank[worst] ? c.severity : worst),
      'low',
    )

    clusters.push({
      id: key.replace(/\|/g, '::'),
      wardId: first.wardId,
      wardLabel: wardName(first.wardId),
      localityName: first.localityName,
      category: first.category,
      categoryLabel: COMPLAINT_CATEGORY_LABEL[first.category],
      departmentId: first.departmentId,
      departmentLabel: departmentName(first.departmentId),
      complaints: items.length,
      recurring,
      reopened: items.filter((c) => c.status === 'reopened').length,
      slaBreached: items.filter((c) => c.slaBreached).length,
      meanAgeHours: Math.round((items.reduce((s, c) => s + c.ageHours, 0) / items.length) * 10) / 10,
      severity,
      maxRepeat: Math.max(...items.map((c) => c.repeatCount)),
    })
  }

  return clusters.sort((a, b) => b.recurring - a.recurring || b.complaints - a.complaints)
}

export interface UnderlyingIssue {
  id: string
  kind: 'road-defect' | 'storm-drain' | 'waterlogging' | 'waste-hotspot' | 'sewerage-node'
  label: string
  detail: string
  severity: Severity
}

export interface RootCauseAssociation {
  cluster: RecurringCluster
  issues: UnderlyingIssue[]
  /** Plain-language statement of what the association does and does not mean. */
  statement: string
}

/** Which infrastructure record type plausibly underlies each complaint category. */
const CATEGORY_SOURCES: Record<ComplaintCategory, UnderlyingIssue['kind'][]> = {
  'water-supply': [],
  drainage: ['storm-drain', 'waterlogging'],
  'road-defect': ['road-defect'],
  'solid-waste': ['waste-hotspot'],
  'street-light': [],
  sewerage: ['sewerage-node'],
  building: [],
  'health-sanitation': ['waste-hotspot', 'sewerage-node'],
  encroachment: [],
  // The obligatory services carry no infrastructure record the platform can
  // correlate against yet - a school building or a garden is an asset, not a
  // defect register. An empty list is the honest answer: the analysis declines
  // to offer an underlying cause rather than inventing a weak one.
  garden: [],
  'public-convenience': ['sewerage-node'],
  'stray-animal': [],
  education: [],
  licensing: [],
  registration: [],
  other: [],
}

function issuesInWard(wardId: string, kinds: UnderlyingIssue['kind'][]): UnderlyingIssue[] {
  const out: UnderlyingIssue[] = []

  if (kinds.includes('road-defect')) {
    for (const d of ROAD_DEFECTS.filter(
      (x) => x.wardId === wardId && x.status !== 'repaired' && x.status !== 'verified-closed',
    ).slice(0, 4)) {
      out.push({
        id: d.id,
        kind: 'road-defect',
        label: t('Open road defect {0}', d.id),
        detail: t('Priority score {0}, status {1}.', d.priorityScore, d.status.replace(/-/g, ' ')),
        severity: d.severity,
      })
    }
  }

  if (kinds.includes('storm-drain')) {
    for (const d of STORM_DRAINS.filter((x) => x.wardId === wardId && x.blockageRisk >= 55).slice(0, 3)) {
      out.push({
        id: d.id,
        kind: 'storm-drain',
        label: d.name,
        detail: t('Blockage risk {0}/100, desilting {1}% complete.', d.blockageRisk, d.desiltingCompletionPct),
        severity: d.blockageRisk >= 75 ? 'high' : 'medium',
      })
    }
  }

  if (kinds.includes('waterlogging')) {
    for (const s of WATERLOGGING_SPOTS.filter((x) => x.wardId === wardId).slice(0, 3)) {
      out.push({
        id: s.id,
        kind: 'waterlogging',
        label: s.name,
        detail: t('Recorded waterlogging location in this ward.'),
        severity: 'medium',
      })
    }
  }

  if (kinds.includes('waste-hotspot')) {
    for (const h of WASTE_HOTSPOTS.filter((x) => x.wardId === wardId).slice(0, 3)) {
      out.push({
        id: h.id,
        kind: 'waste-hotspot',
        label: h.name,
        detail: t('Recorded waste accumulation hotspot in this ward.'),
        severity: h.severity,
      })
    }
  }

  if (kinds.includes('sewerage-node')) {
    for (const n of SEWERAGE_NODES.filter((x) => x.wardId === wardId && x.blockages30d > 0).slice(0, 3)) {
      out.push({
        id: n.id,
        kind: 'sewerage-node',
        label: n.name,
        detail: t('{0} blockage(s) in the last 30 days, condition index {1}/100.', n.blockages30d, n.conditionIndex),
        severity: n.blockages30d >= 3 ? 'high' : 'medium',
      })
    }
  }

  return out
}

/**
 * Associates each recurring cluster with the infrastructure the corporation
 * already holds records for in the same ward and service category.
 */
export function rootCauseAssociations(clusters: RecurringCluster[], limit = 12): RootCauseAssociation[] {
  return clusters
    .slice(0, limit)
    .map((cluster) => {
      const issues = issuesInWard(cluster.wardId, CATEGORY_SOURCES[cluster.category])
      const statement =
        issues.length > 0
          ? t('{0} of {1} complaints at {2} ({3}) are repeat reports. {4} open {5} record(s) exist in {6}. The association is by ward and service category - an officer inspection is what establishes whether these are the cause.', cluster.recurring, cluster.complaints, cluster.localityName, cluster.categoryLabel, issues.length, cluster.categoryLabel.toLowerCase(), cluster.wardLabel)
          : t('{0} of {1} complaints at {2} ({3}) are repeat reports, but the platform holds no open infrastructure record of this category in {4}. Either the underlying asset is not in the register, or the cause lies outside the categories modelled here.', cluster.recurring, cluster.complaints, cluster.localityName, cluster.categoryLabel, cluster.wardLabel)

      return { cluster, issues, statement }
    })
    .sort((a, b) => b.issues.length - a.issues.length || b.cluster.recurring - a.cluster.recurring)
}

export interface CategoryPosture {
  category: ComplaintCategory
  label: string
  total: number
  open: number
  recurring: number
  recurringPct: number
  reopened: number
  slaCompliancePct: number
  meanAgeHours: number
}

/** Where service quality is deteriorating, by category. */
export function categoryPosture(complaints: Complaint[]): CategoryPosture[] {
  const byCategory = new Map<ComplaintCategory, Complaint[]>()
  for (const c of complaints) {
    const list = byCategory.get(c.category) ?? []
    list.push(c)
    byCategory.set(c.category, list)
  }

  return [...byCategory.entries()]
    .map(([category, items]) => {
      const recurring = items.filter((c) => c.repeatCount > 0).length
      const breached = items.filter((c) => c.slaBreached).length
      return {
        category,
        label: COMPLAINT_CATEGORY_LABEL[category],
        total: items.length,
        open: items.filter(isOpen).length,
        recurring,
        recurringPct: Math.round((recurring / items.length) * 1000) / 10,
        reopened: items.filter((c) => c.status === 'reopened').length,
        slaCompliancePct: Math.round(((items.length - breached) / items.length) * 1000) / 10,
        meanAgeHours: Math.round((items.reduce((s, c) => s + c.ageHours, 0) / items.length) * 10) / 10,
      }
    })
    .sort((a, b) => b.recurringPct - a.recurringPct)
}

export interface DepartmentHandoff {
  departmentId: string
  label: string
  total: number
  open: number
  slaBreached: number
  slaCompliancePct: number
  meanAgeHours: number
  /** Categories this department receives - a proxy for handoff surface. */
  categories: number
}

/** Where the work lands, and how each department is holding its SLA. */
export function departmentHandoffs(complaints: Complaint[]): DepartmentHandoff[] {
  const byDept = new Map<string, Complaint[]>()
  for (const c of complaints) {
    const list = byDept.get(c.departmentId) ?? []
    list.push(c)
    byDept.set(c.departmentId, list)
  }

  return [...byDept.entries()]
    .map(([departmentId, items]) => {
      const breached = items.filter((c) => c.slaBreached).length
      return {
        departmentId,
        label: departmentName(departmentId),
        total: items.length,
        open: items.filter(isOpen).length,
        slaBreached: breached,
        slaCompliancePct: Math.round(((items.length - breached) / items.length) * 1000) / 10,
        meanAgeHours: Math.round((items.reduce((s, c) => s + c.ageHours, 0) / items.length) * 10) / 10,
        categories: new Set(items.map((c) => c.category)).size,
      }
    })
    .sort((a, b) => a.slaCompliancePct - b.slaCompliancePct)
}


/* ==========================================================================
   Channel posture
   ========================================================================== */

/**
 * How citizens actually reached the corporation, and how each route performed.
 *
 * The reason this is worth computing rather than merely counting: the channels
 * do not perform alike. A complaint raised at the counter is described by an
 * officer and is usually actionable; one raised on social media often is not,
 * and its SLA position says as much. Reporting one resolution rate across all
 * of them hides which route is failing the people using it.
 */
export interface ChannelPosture {
  channel: ComplaintChannel
  total: number
  open: number
  resolved: number
  slaBreached: number
  slaCompliancePct: number
  sharePct: number
  averageAgeHours: number
}

export function channelPosture(complaints: Complaint[]): ChannelPosture[] {
  const channels = [...new Set(complaints.map((c) => c.channel))]
  const total = complaints.length
  return channels
    .map((channel) => {
      const mine = complaints.filter((c) => c.channel === channel)
      const closed = mine.filter((c) => c.status === 'resolved' || c.status === 'closed')
      const breached = mine.filter((c) => c.slaBreached)
      return {
        channel,
        total: mine.length,
        open: mine.length - closed.length,
        resolved: closed.length,
        slaBreached: breached.length,
        slaCompliancePct: mine.length === 0 ? 0 : Math.round(((mine.length - breached.length) / mine.length) * 1000) / 10,
        sharePct: total === 0 ? 0 : Math.round((mine.length / total) * 1000) / 10,
        averageAgeHours:
          mine.length === 0 ? 0 : Math.round((mine.reduce((sum, c) => sum + c.ageHours, 0) / mine.length) * 10) / 10,
      }
    })
    .sort((a, b) => b.total - a.total)
}
