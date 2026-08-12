import { COMPLAINTS } from '@/data/operations.data'
import {
  categoryPosture,
  channelPosture,
  departmentHandoffs,
  recurringClusters,
  rootCauseAssociations,
  serviceSummary,
  type CategoryPosture,
  type ChannelPosture,
  type DepartmentHandoff,
  type RecurringCluster,
  type RootCauseAssociation,
  type ServiceIntelligenceSummary,
} from '@/domains/citizen-services/root-cause'
import { filterByScope } from '@/security/access'
import type { Complaint, ComplaintCategory } from '@/types/operations'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/citizen.service.ts
 *
 * Citizen service intelligence.
 *
 * Complaints are scoped by ward before anything is computed, so a ward officer
 * reads their own ward's service position and a city officer reads the
 * corporation's. Every aggregate below is derived from that scoped set, never
 * from the full corpus.
 *
 * The demonstration complaint record holds no citizen personal data - no name,
 * contact, address or identifier. Only category, locality, ward, department
 * and service timing are modelled, which is what service intelligence needs.
 */

export interface CitizenServiceFilters {
  wardId?: string
  category?: ComplaintCategory
  openOnly?: boolean
}

function scopedComplaints(user: User | null, filters: CitizenServiceFilters = {}): Complaint[] {
  const scoped = scopeToTenant(user, COMPLAINTS)
  let visible = filterByScope(
    user,
    scoped,
    (c) => ({ wardId: c.wardId, departmentId: c.departmentId, domain: 'citizen-services' }),
    'intelligence',
  )

  if (filters.wardId) visible = visible.filter((c) => c.wardId === filters.wardId)
  if (filters.category) visible = visible.filter((c) => c.category === filters.category)
  if (filters.openOnly) {
    visible = visible.filter((c) => c.status !== 'resolved' && c.status !== 'closed')
  }
  return visible
}

async function summary(user: User | null, filters: CitizenServiceFilters = {}): Promise<ServiceIntelligenceSummary> {
  await simulateLatency(`citizen.summary:${JSON.stringify(filters)}`)
  return serviceSummary(scopedComplaints(user, filters))
}

async function clusters(user: User | null, filters: CitizenServiceFilters = {}): Promise<RecurringCluster[]> {
  await simulateLatency(`citizen.clusters:${JSON.stringify(filters)}`)
  return deepClone(recurringClusters(scopedComplaints(user, filters)))
}

async function rootCauses(user: User | null, filters: CitizenServiceFilters = {}): Promise<RootCauseAssociation[]> {
  await simulateLatency(`citizen.rootCauses:${JSON.stringify(filters)}`)
  return deepClone(rootCauseAssociations(recurringClusters(scopedComplaints(user, filters))))
}

async function categories(user: User | null, filters: CitizenServiceFilters = {}): Promise<CategoryPosture[]> {
  await simulateLatency(`citizen.categories:${JSON.stringify(filters)}`)
  return deepClone(categoryPosture(scopedComplaints(user, filters)))
}

/**
 * Complaint volume and SLA position by the route the complaint arrived on.
 * Derived from the same scoped set as every other aggregate here, so a ward
 * officer reads their own ward's channel mix.
 */
async function channels(user: User | null, filters: CitizenServiceFilters = {}): Promise<ChannelPosture[]> {
  await simulateLatency(`citizen.channels:${JSON.stringify(filters)}`)
  return deepClone(channelPosture(scopedComplaints(user, filters)))
}

async function departments(user: User | null, filters: CitizenServiceFilters = {}): Promise<DepartmentHandoff[]> {
  await simulateLatency(`citizen.departments:${JSON.stringify(filters)}`)
  return deepClone(departmentHandoffs(scopedComplaints(user, filters)))
}

export const citizenService = {
  summary,
  clusters,
  rootCauses,
  categories,
  channels,
  departments,
}
