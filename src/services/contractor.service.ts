import { CONTRACTORS } from '@/data/finance.data'
import {
  buildAllContractorProfiles,
  contractorPerformanceBands,
  type ContractorProfile,
  type PerformanceBand,
} from '@/domains/contractors/performance'
import { projectService } from './project.service'
import { procurementService } from './procurement.service'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/contractor.service.ts
 *
 * Supplier delivery intelligence.
 *
 * A contractor profile is assembled ONLY from the contracts and projects the
 * acting principal may already read. That is deliberate: totals computed over
 * records a principal cannot open would disclose their contents in aggregate,
 * so the profile is built on the permitted subset and says so where the
 * subset is partial.
 *
 * Nothing in this service characterises the conduct of any supplier. The
 * indicators describe delivery exposure for management attention only.
 */

export interface ContractorFilters {
  category?: string
  departmentId?: string
  /** Only suppliers at or below this performance index. */
  maxPerformance?: number
  /** Only suppliers carrying at least one risk indicator. */
  withRiskOnly?: boolean
  search?: string
}

async function profiles(user: User | null, filters: ContractorFilters = {}): Promise<ContractorProfile[]> {
  await simulateLatency(`contractor.profiles:${JSON.stringify(filters)}`)

  // Both reads are already permission-filtered by their own services.
  const [contractPage, projectPage] = await Promise.all([
    procurementService.contracts(user, { pageSize: 1000 }),
    projectService.list(user, { pageSize: 1000 }),
  ])

  if (contractPage.items.length === 0 && projectPage.items.length === 0) return []

  let built = buildAllContractorProfiles(contractPage.items, projectPage.items)

  // A supplier with no readable record at all is not shown - an empty profile
  // would imply the corporation holds nothing on them, which is not the claim.
  built = built.filter((p) => p.activeContracts.length + p.closedContracts.length + p.projects.length > 0)

  if (filters.category) built = built.filter((p) => p.categories.includes(filters.category as never))
  if (filters.departmentId) built = built.filter((p) => p.departments.includes(filters.departmentId as string))
  if (typeof filters.maxPerformance === 'number') {
    built = built.filter((p) => p.performanceIndex <= (filters.maxPerformance as number))
  }
  if (filters.withRiskOnly) built = built.filter((p) => p.riskIndicators.length > 0)
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    built = built.filter(
      (p) => p.contractor.name.toLowerCase().includes(q) || p.contractor.registrationRef.toLowerCase().includes(q),
    )
  }

  return deepClone(built)
}

async function profile(user: User | null, contractorId: string): Promise<ContractorProfile | null> {
  const all = await profiles(user)
  return all.find((p) => p.contractor.id === contractorId) ?? null
}

async function bands(user: User | null): Promise<PerformanceBand[]> {
  const all = await profiles(user)
  return contractorPerformanceBands(all)
}

export interface ContractorPortfolioSummary {
  suppliers: number
  totalContractedCrore: number
  totalPaidCrore: number
  meanPerformanceIndex: number
  suppliersUnderReview: number
  suppliersWithRiskIndicators: number
  totalExtensions: number
  openObservations: number
  /** Suppliers the principal cannot read, so totals are known to be partial. */
  suppliersOutsideScope: number
}

async function portfolio(user: User | null): Promise<ContractorPortfolioSummary> {
  const all = await profiles(user)
  const scopedTotal = scopeToTenant(user, CONTRACTORS).length

  const totalContractedCrore = all.reduce((s, p) => s + p.totalContractedCrore, 0)
  const totalPaidCrore = all.reduce((s, p) => s + p.totalPaidCrore, 0)
  const meanPerformanceIndex =
    all.length > 0 ? Math.round(all.reduce((s, p) => s + p.performanceIndex, 0) / all.length) : 0

  return {
    suppliers: all.length,
    totalContractedCrore: Math.round(totalContractedCrore * 10) / 10,
    totalPaidCrore: Math.round(totalPaidCrore * 10) / 10,
    meanPerformanceIndex,
    suppliersUnderReview: all.filter((p) => p.state === 'review-required').length,
    suppliersWithRiskIndicators: all.filter((p) => p.riskIndicators.length > 0).length,
    totalExtensions: all.reduce((s, p) => s + p.totalExtensions, 0),
    openObservations: all.reduce((s, p) => s + p.openObservations, 0),
    suppliersOutsideScope: Math.max(0, scopedTotal - all.length),
  }
}

export const contractorService = {
  profiles,
  profile,
  bands,
  portfolio,
}
