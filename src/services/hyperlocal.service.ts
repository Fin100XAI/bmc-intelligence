import { COMPLAINTS } from '@/data/operations.data'
import {
  hyperlocalCells,
  hyperlocalWardRollup,
  type HyperlocalCell,
  type HyperlocalWardRollup,
} from '@/domains/hyperlocal/signals'
import { filterByScope } from '@/security/access'
import type { Complaint } from '@/types/operations'
import type { User } from '@/types/organisation'
import { deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/hyperlocal.service.ts
 *
 * Locality-level intelligence.
 *
 * The complaint set is scoped by ward before any locality is computed, so a
 * ward officer sees the hyperlocal picture of their own ward and nothing more.
 * Localities are the corporation's own place references; no citizen address or
 * personal data is read or returned.
 */

export interface HyperlocalFilters {
  wardId?: string
  /** Only localities at or above this composite score. */
  minScore?: number
  /** Only localities where at least this many distinct signal types stack. */
  minSignalTypes?: number
}

function scopedComplaints(user: User | null, wardId?: string): Complaint[] {
  const scoped = scopeToTenant(user, COMPLAINTS)
  const visible = filterByScope(
    user,
    scoped,
    (c) => ({ wardId: c.wardId, departmentId: c.departmentId, domain: 'citizen-services' }),
    'intelligence',
  )
  return wardId ? visible.filter((c) => c.wardId === wardId) : visible
}

async function cells(user: User | null, filters: HyperlocalFilters = {}): Promise<HyperlocalCell[]> {
  await simulateLatency(`hyperlocal.cells:${JSON.stringify(filters)}`)

  let built = hyperlocalCells(scopedComplaints(user, filters.wardId))
  if (typeof filters.minScore === 'number') {
    built = built.filter((c) => c.compositeScore >= (filters.minScore as number))
  }
  if (typeof filters.minSignalTypes === 'number') {
    built = built.filter((c) => c.signalTypes >= (filters.minSignalTypes as number))
  }
  return deepClone(built)
}

async function wardRollup(user: User | null, filters: HyperlocalFilters = {}): Promise<HyperlocalWardRollup[]> {
  await simulateLatency(`hyperlocal.wardRollup:${JSON.stringify(filters)}`)
  return deepClone(hyperlocalWardRollup(hyperlocalCells(scopedComplaints(user, filters.wardId))))
}

export interface HyperlocalSummary {
  localities: number
  criticalLocalities: number
  stackedLocalities: number
  worstScore: number
  totalOpenComplaints: number
}

async function summary(user: User | null, filters: HyperlocalFilters = {}): Promise<HyperlocalSummary> {
  await simulateLatency(`hyperlocal.summary:${JSON.stringify(filters)}`)
  const built = hyperlocalCells(scopedComplaints(user, filters.wardId))

  return {
    localities: built.length,
    criticalLocalities: built.filter((c) => c.severity === 'critical').length,
    stackedLocalities: built.filter((c) => c.signalTypes >= 4).length,
    worstScore: built.length > 0 ? Math.max(...built.map((c) => c.compositeScore)) : 0,
    totalOpenComplaints: built.reduce((s, c) => s + c.openComplaints, 0),
  }
}

export const hyperlocalService = {
  cells,
  wardRollup,
  summary,
}
