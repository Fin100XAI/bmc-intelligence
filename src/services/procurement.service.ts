import { CONTRACTORS, CONTRACTS } from '@/data/finance.data'
import { filterByScope } from '@/security/access'
import type { Contract, Contractor, ProjectCategory, TenderStage } from '@/types/finance'
import type { User } from '@/types/organisation'
import { deepClone, paginate, scopeToTenant, simulateLatency } from './client'
import type { Paged } from '@/types/common'

/**
 * src/services/procurement.service.ts
 *
 * Bulk contract and vendor reads.
 *
 * Procurement surfaces need the whole contract set, not a per-project fetch.
 * Every method scopes by tenant and then filters through the permission
 * engine - contracts are confidential, so a principal without the
 * `procurement:view` permission receives nothing rather than a partial set.
 *
 * Nothing here characterises the conduct of any vendor. Risk indicators
 * describe delivery and continuity exposure for management attention only.
 */

export interface ContractFilters {
  category?: ProjectCategory
  departmentId?: string
  contractorId?: string
  stage?: TenderStage
  wardId?: string
  /** Minimum composite risk indicator, 0–100. */
  minRisk?: number
  search?: string
  page?: number
  pageSize?: number
}

async function contracts(user: User | null, filters: ContractFilters = {}): Promise<Paged<Contract>> {
  await simulateLatency(`procurement.contracts:${JSON.stringify(filters)}`)

  const scoped = scopeToTenant(user, CONTRACTS)
  let visible = filterByScope(
    user,
    scoped,
    (c) => ({
      wardIds: c.wardIds,
      departmentId: c.departmentId,
      domain: 'procurement',
      classification: c.classification,
    }),
    'procurement',
  )

  if (filters.category) visible = visible.filter((c) => c.category === filters.category)
  if (filters.departmentId) visible = visible.filter((c) => c.departmentId === filters.departmentId)
  if (filters.contractorId) visible = visible.filter((c) => c.contractorId === filters.contractorId)
  if (filters.stage) visible = visible.filter((c) => c.stage === filters.stage)
  if (filters.wardId) visible = visible.filter((c) => c.wardIds.includes(filters.wardId as string))
  if (typeof filters.minRisk === 'number') visible = visible.filter((c) => c.riskScore >= (filters.minRisk as number))
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    visible = visible.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.reference.toLowerCase().includes(q) ||
        c.tenderReference.toLowerCase().includes(q),
    )
  }

  const sorted = [...visible].sort((a, b) => b.riskScore - a.riskScore)
  return paginate(deepClone(sorted), filters.page ?? 0, filters.pageSize ?? 200)
}

async function contract(user: User | null, id: string): Promise<Contract | null> {
  const page = await contracts(user, { pageSize: 1000 })
  return page.items.find((c) => c.id === id) ?? null
}

async function vendors(user: User | null): Promise<Contractor[]> {
  await simulateLatency('procurement.vendors')
  // Vendor records are only meaningful to a principal who may read contracts.
  const readable = await contracts(user, { pageSize: 1000 })
  if (readable.items.length === 0) return []
  const scoped = scopeToTenant(user, CONTRACTORS)
  const sorted = [...scoped].sort((a, b) => a.performanceIndex - b.performanceIndex)
  return deepClone(sorted)
}

export interface CategoryConcentration {
  category: ProjectCategory
  contractCount: number
  totalValueCrore: number
  topVendorId: string
  topVendorName: string
  topVendorSharePct: number
  /** True where a single vendor holds more than the departmental threshold. */
  aboveThreshold: boolean
  note: string
}

/** Category concentration - a delivery-continuity exposure, not a finding. */
async function concentration(user: User | null): Promise<CategoryConcentration[]> {
  const page = await contracts(user, { pageSize: 1000 })
  const byCategory = new Map<ProjectCategory, Contract[]>()
  for (const c of page.items) {
    const list = byCategory.get(c.category) ?? []
    list.push(c)
    byCategory.set(c.category, list)
  }

  const THRESHOLD = 40

  return Array.from(byCategory.entries())
    .map(([category, items]) => {
      const byVendor = new Map<string, number>()
      for (const c of items) byVendor.set(c.contractorId, (byVendor.get(c.contractorId) ?? 0) + c.valueCrore)
      const total = items.reduce((s, c) => s + c.valueCrore, 0)
      const top = [...byVendor.entries()].sort((a, b) => b[1] - a[1])[0]
      const sharePct = top && total > 0 ? Math.round((top[1] / total) * 1000) / 10 : 0
      const vendor = CONTRACTORS.find((v) => v.id === top?.[0])
      const aboveThreshold = sharePct > THRESHOLD

      return {
        category,
        contractCount: items.length,
        totalValueCrore: Math.round(total * 10) / 10,
        topVendorId: top?.[0] ?? '',
        topVendorName: vendor?.name ?? '-',
        topVendorSharePct: sharePct,
        aboveThreshold,
        note: aboveThreshold
          ? `A single supplier holds ${sharePct}% of contracted value in this category, above the ${THRESHOLD}% departmental threshold. This is a delivery-continuity exposure if that supplier underperforms. It makes no assertion about how any contract was awarded.`
          : `Supplier distribution in this category is within the ${THRESHOLD}% concentration threshold.`,
      }
    })
    .sort((a, b) => b.topVendorSharePct - a.topVendorSharePct)
}

export const procurementService = {
  contracts,
  contract,
  vendors,
  concentration,
}
