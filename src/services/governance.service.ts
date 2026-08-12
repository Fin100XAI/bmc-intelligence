import { DATASETS, LINEAGE_GRAPHS } from '@/data/governance.data'
import { EVIDENCE_ITEMS } from '@/data/evidence.data'
import { datasetReadable, governanceSummary, personalDataInventory } from '@/governance'
import { classificationCeiling, filterByScope } from '@/security/access'
import { getRole } from '@/security/roles'
import type { Dataset, LineageGraph } from '@/types/governance'
import type { EvidenceItem } from '@/types/intelligence'
import type { DataClassification, IntelligenceDomain } from '@/types/common'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/governance.service.ts
 *
 * Data governance reads - the dataset register, lineage catalogue and the
 * evidence corpus browsed as a whole.
 *
 * Dataset visibility is evaluated twice: the permission engine gates the
 * read, and `datasetReadable` additionally checks the dataset owner's
 * declared allowed-role list and the principal's classification ceiling.
 * A dataset the principal may not read is omitted entirely rather than
 * returned redacted - the platform does not hint at what it is withholding.
 */

export interface DatasetFilters {
  domain?: IntelligenceDomain
  classification?: DataClassification
  containsPersonalData?: boolean
  ownerDepartmentId?: string
  search?: string
}

async function datasets(user: User | null, filters: DatasetFilters = {}): Promise<Dataset[]> {
  await simulateLatency(`governance.datasets:${JSON.stringify(filters)}`)
  if (!user) return []

  const role = getRole(user.roleId)
  const ceiling = classificationCeiling(user)
  const scoped = scopeToTenant(user, DATASETS)

  let visible = filterByScope(
    user,
    scoped,
    (d) => ({ departmentId: d.ownerDepartmentId, domain: d.domain, classification: d.classification }),
    'dataset',
  ).filter((d) => (role ? datasetReadable(d, user.roleId, ceiling).readable : false))

  if (filters.domain) visible = visible.filter((d) => d.domain === filters.domain)
  if (filters.classification) visible = visible.filter((d) => d.classification === filters.classification)
  if (typeof filters.containsPersonalData === 'boolean') {
    visible = visible.filter((d) => d.containsPersonalData === filters.containsPersonalData)
  }
  if (filters.ownerDepartmentId) visible = visible.filter((d) => d.ownerDepartmentId === filters.ownerDepartmentId)
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    visible = visible.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.purpose.toLowerCase().includes(q) ||
        d.sourceSystem.toLowerCase().includes(q),
    )
  }

  return deepClone([...visible].sort((a, b) => a.name.localeCompare(b.name)))
}

async function dataset(user: User | null, id: string): Promise<Dataset | null> {
  const all = await datasets(user)
  return all.find((d) => d.id === id) ?? null
}

/** Every lineage graph the principal may read, for the metric selector. */
async function lineageGraphs(user: User | null): Promise<LineageGraph[]> {
  await simulateLatency('governance.lineageGraphs')
  if (!user) return []
  const scoped = scopeToTenant(user, LINEAGE_GRAPHS)
  const visible = filterByScope(user, scoped, (g) => ({ domain: g.domain, classification: g.classification }), 'dataset')
  return deepClone([...visible].sort((a, b) => a.metricLabel.localeCompare(b.metricLabel)))
}

export interface EvidenceBrowseFilters {
  kind?: EvidenceItem['kind']
  classification?: DataClassification
  wardId?: string
  departmentId?: string
  search?: string
  limit?: number
}

/** Browse the evidence corpus as a whole, rather than by explicit id set. */
async function browseEvidence(user: User | null, filters: EvidenceBrowseFilters = {}): Promise<EvidenceItem[]> {
  await simulateLatency(`governance.browseEvidence:${JSON.stringify(filters)}`)
  if (!user) return []

  const scoped = scopeToTenant(user, EVIDENCE_ITEMS)
  let visible = filterByScope(
    user,
    scoped,
    (e) => ({ wardIds: e.wardIds, departmentId: e.departmentId, classification: e.classification }),
    'evidence',
  )

  if (filters.kind) visible = visible.filter((e) => e.kind === filters.kind)
  if (filters.classification) visible = visible.filter((e) => e.classification === filters.classification)
  if (filters.wardId) visible = visible.filter((e) => e.wardIds.includes(filters.wardId as string))
  if (filters.departmentId) visible = visible.filter((e) => e.departmentId === filters.departmentId)
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    visible = visible.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.sourceSystem.toLowerCase().includes(q) ||
        e.sourceRecordRef.toLowerCase().includes(q),
    )
  }

  const sorted = [...visible].sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))
  return deepClone(sorted.slice(0, filters.limit ?? 120))
}

export interface GovernanceSummary {
  total: number
  withPersonalData: number
  restricted: number
  averageQuality: number
  shortestRetentionMonths: number
  unminimisedPersonalData: number
  /** Datasets withheld from this principal by role or classification. */
  withheldFromPrincipal: number
}

async function summary(user: User | null): Promise<GovernanceSummary> {
  const visible = await datasets(user)
  const base = governanceSummary(visible)
  return { ...base, withheldFromPrincipal: DATASETS.length - visible.length }
}

/** Datasets carrying personal data, with the minimisation applied to each. */
async function personalData(
  user: User | null,
): Promise<Array<{ dataset: Dataset; minimisation: string[]; hasMinimisation: boolean }>> {
  const visible = await datasets(user)
  return personalDataInventory(visible)
}

export const governanceService = {
  datasets,
  dataset,
  lineageGraphs,
  browseEvidence,
  summary,
  personalData,
}
