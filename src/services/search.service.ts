import { CONTRACTORS, PROJECTS } from '@/data/finance.data'
import { DATASETS, LINEAGE_GRAPHS } from '@/data/governance.data'
import { MUNICIPAL_ASSETS } from '@/data/operations.data'
import { WARDS } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { Severity } from '@/types/common'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'
import { getCollection } from './store'
import { t } from '@/i18n'

/**
 * src/services/search.service.ts
 *
 * Federated search across the platform's canonical entities. Each group
 * applies the same `classification`/ward/department gate its own
 * authoritative service would (see the relevant `*.service.ts` for the
 * precise rule); domain-scope narrowing is intentionally omitted here for
 * result *teasers* (title/subtitle/route only, no record body) and is
 * re-applied in full by the destination service when a result is opened.
 */

export interface GlobalSearchItem {
  id: string
  title: string
  subtitle: string
  route: string
  severity?: Severity
}

export interface GlobalSearchGroup {
  group: string
  items: GlobalSearchItem[]
}

const MAX_ITEMS_PER_GROUP = 6

function buildGroup<T>(group: string, items: T[], toItem: (item: T) => GlobalSearchItem): GlobalSearchGroup | undefined {
  if (items.length === 0) return undefined
  return { group, items: items.slice(0, MAX_ITEMS_PER_GROUP).map(toItem) }
}

function riskSeverity(riskScore: number): Severity | undefined {
  if (riskScore >= 78) return 'critical'
  if (riskScore >= 60) return 'high'
  if (riskScore >= 40) return 'medium'
  return undefined
}

async function global(user: User | null, query: string): Promise<GlobalSearchGroup[]> {
  await simulateLatency(`search.global:${query}`)
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const groups: GlobalSearchGroup[] = []

  const wards = filterByScope(
    user,
    scopeToTenant(user, WARDS).filter((w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q)),
    (w) => ({ wardId: w.id, domain: 'wards' }),
    'ward',
  )
  const wardGroup = buildGroup('Wards', wards, (w) => ({
    id: w.id,
    title: `${w.code} - ${w.name.split(' · ')[0]}`,
    subtitle: t('{0} · {1} residents', w.region, w.population.toLocaleString('en-IN')),
    route: `/city/wards?ward=${w.id}`,
    severity: riskSeverity(w.riskScore),
  }))
  if (wardGroup) groups.push(wardGroup)

  const projects = filterByScope(
    user,
    scopeToTenant(user, PROJECTS).filter((p) => p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q)),
    (p) => ({ wardIds: p.wardIds, departmentId: p.departmentId, classification: p.classification }),
    'project',
  )
  const projectGroup = buildGroup('Projects', projects, (p) => ({
    id: p.id,
    title: p.name,
    subtitle: t('{0} · {1}% complete', p.reference, p.completionPct),
    route: `/governance/projects?project=${p.id}`,
    severity: riskSeverity(p.riskScore),
  }))
  if (projectGroup) groups.push(projectGroup)

  const assets = filterByScope(
    user,
    scopeToTenant(user, MUNICIPAL_ASSETS).filter((a) => a.name.toLowerCase().includes(q)),
    (a) => ({ wardId: a.wardId, departmentId: a.departmentId, domain: 'assets', classification: a.classification }),
    'ward',
  )
  const assetGroup = buildGroup('Assets', assets, (a) => ({
    id: a.id,
    title: a.name,
    subtitle: t('{0} · condition {1}/100', a.category.replace('-', ' '), a.conditionIndex),
    route: `/governance/assets?asset=${a.id}`,
    severity: a.criticality,
  }))
  if (assetGroup) groups.push(assetGroup)

  const contractors = filterByScope(
    user,
    scopeToTenant(user, CONTRACTORS).filter((c) => c.name.toLowerCase().includes(q)),
    () => ({ domain: 'procurement' }),
    'procurement',
  )
  const contractorGroup = buildGroup('Contractors', contractors, (c) => ({
    id: c.id,
    title: c.name,
    subtitle: t('{0} active contract(s) · delivery index {1}/100', c.activeContracts, c.performanceIndex),
    route: `/governance/procurement?contractor=${c.id}`,
    severity: c.performanceIndex < 55 ? 'high' : c.performanceIndex < 70 ? 'medium' : undefined,
  }))
  if (contractorGroup) groups.push(contractorGroup)

  const complaints = filterByScope(
    user,
    scopeToTenant(user, getCollection('complaints')).filter(
      (c) => c.summary.toLowerCase().includes(q) || c.reference.toLowerCase().includes(q) || c.localityName.toLowerCase().includes(q),
    ),
    (c) => ({ wardId: c.wardId, departmentId: c.departmentId }),
    'ward',
  )
  const complaintGroup = buildGroup('Complaints', complaints, (c) => ({
    id: c.id,
    title: c.reference,
    subtitle: c.summary,
    route: `/city/wards?ward=${c.wardId}&complaint=${c.id}`,
    severity: c.severity,
  }))
  if (complaintGroup) groups.push(complaintGroup)

  const incidents = filterByScope(
    user,
    scopeToTenant(user, getCollection('incidents')).filter(
      (i) => i.title.toLowerCase().includes(q) || i.reference.toLowerCase().includes(q),
    ),
    (i) => ({ wardId: i.wardId, departmentId: i.departmentId, classification: i.classification }),
    'incident',
  )
  const incidentGroup = buildGroup('Incidents', incidents, (i) => ({
    id: i.id,
    title: i.title,
    subtitle: `${i.reference} · ${i.locationName}`,
    route: `/city/disaster?incident=${i.id}`,
    severity: i.severity,
  }))
  if (incidentGroup) groups.push(incidentGroup)

  const decisions = filterByScope(
    user,
    scopeToTenant(user, getCollection('decisions')).filter(
      (d) => d.title.toLowerCase().includes(q) || d.reference.toLowerCase().includes(q),
    ),
    (d) => ({ wardIds: d.wardIds, departmentIds: d.departmentIds, classification: d.classification }),
    'decision',
  )
  const decisionGroup = buildGroup('Decisions', decisions, (d) => ({
    id: d.id,
    title: d.title,
    subtitle: `${d.reference} · ${d.status}`,
    route: `/command/decisions?case=${d.id}`,
    severity: d.severity,
  }))
  if (decisionGroup) groups.push(decisionGroup)

  const datasets = filterByScope(
    user,
    scopeToTenant(user, DATASETS).filter((d) => d.name.toLowerCase().includes(q)),
    (d) => ({ departmentId: d.ownerDepartmentId, domain: d.domain, classification: d.classification }),
    'dataset',
  )
  const datasetGroup = buildGroup('Datasets', datasets, (d) => ({
    id: d.id,
    title: d.name,
    subtitle: `${d.sourceSystem} · ${d.classification}`,
    route: `/trust/privacy?dataset=${d.id}`,
  }))
  if (datasetGroup) groups.push(datasetGroup)

  const metrics = filterByScope(
    user,
    scopeToTenant(user, LINEAGE_GRAPHS).filter((m) => m.metricLabel.toLowerCase().includes(q)),
    (m) => ({ domain: m.domain, classification: m.classification }),
    'dataset',
  )
  const metricGroup = buildGroup('Metrics', metrics, (m) => ({
    id: m.id,
    title: m.metricLabel,
    subtitle: t('Lineage · {0} stages', m.stages.length),
    route: `/trust/lineage?metric=${m.id}`,
  }))
  if (metricGroup) groups.push(metricGroup)

  const alerts = filterByScope(
    user,
    scopeToTenant(user, getCollection('alerts')).filter((a) => a.title.toLowerCase().includes(q)),
    (a) => ({ wardIds: a.wardIds, departmentId: a.departmentId, classification: a.classification }),
    'alert',
  )
  const alertGroup = buildGroup('Alerts', alerts, (a) => ({
    id: a.id,
    title: a.title,
    subtitle: t('{0} · SLA {1}', a.status, a.slaRemainingHours >= 0 ? `${a.slaRemainingHours}h remaining` : 'breached'),
    route: `/command/alerts?alert=${a.id}`,
    severity: a.severity,
  }))
  if (alertGroup) groups.push(alertGroup)

  return deepClone(groups)
}

export const searchService = {
  global,
}
