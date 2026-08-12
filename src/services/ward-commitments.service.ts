import {
  buildCommitmentsAcrossWards,
  buildWardCommitments,
  cityWideCommitmentCount,
  summariseCommitments,
  summariseWards,
} from '@/domains/wards/commitments'
import type { WardCommitment, WardCommitmentSummary } from '@/domains/wards/commitments'
import { WARDS, wardName } from '@/data/reference'
import { filterByScope } from '@/security/access'
import type { User, Ward } from '@/types/organisation'
import { ServiceError, assertAccess, deepClone, scopeToTenant, simulateLatency } from './client'

/**
 * src/services/ward-commitments.service.ts
 *
 * Reads of the ward commitments ledger.
 *
 * Scoped exactly as `ward.service.ts` scopes every other ward composite:
 * `resource: 'ward'` with a `domain: 'wards'` attribute so `AccessScope.domains`
 * partitions who sees ward composites at all, and a `wardId` attribute so
 * `AccessScope.wardIds` restricts which wards. A ward officer asking for the
 * city-wide reading receives the wards they hold, not a denial - the same
 * behaviour every other city-wide roll-up in the platform has.
 *
 * `@/domains/wards/commitments` does the joining. It is a pure function of a
 * ward id with no awareness of the acting principal, so access control stays
 * here: this module decides WHICH wards a principal may read, and the domain
 * module decides WHAT a ward's commitment position is.
 */

export type { WardCommitment, WardCommitmentSummary }

/**
 * One reading of the ledger - either a single ward, or the city-wide position
 * assembled from every ward the principal is authorised to see.
 */
export interface WardCommitmentLedger {
  scope: {
    /** Null for the city-wide reading across the principal's authorised wards. */
    wardId: string | null
    label: string
    /** How many wards the reading covers. */
    wardsCovered: number
  }
  /** The wards this principal may select, for the ward selector. */
  wards: Array<{ id: string; label: string }>
  commitments: WardCommitment[]
  summary: WardCommitmentSummary
  /** One row per authorised ward, for ranking wards against one another. */
  wardSummaries: WardCommitmentSummary[]
  /**
   * Commitments the corporation has made that name no ward and are therefore
   * outside this ledger by construction. Reported so the boundary of the
   * reading is stated rather than left to be discovered.
   */
  excluded: { resolutions: number; projects: number; decisions: number; total: number }
}

function authorisedWards(user: User | null): Ward[] {
  const scoped = scopeToTenant(user, WARDS)
  return filterByScope(user, scoped, (w) => ({ wardId: w.id, domain: 'wards' }), 'ward')
}

function requireWard(user: User | null, wardId: string): Ward {
  const ward = scopeToTenant(user, WARDS).find((w) => w.id === wardId)
  if (!ward) throw new ServiceError('not-found', `Ward "${wardId}" was not found.`)
  assertAccess(user, 'ward', 'view', { wardId, domain: 'wards' }, {
    resourceType: 'Ward',
    resourceId: ward.id,
    resourceLabel: ward.name,
  })
  return ward
}

/**
 * The commitment ledger for one ward, or - where `wardId` is omitted - for
 * every ward the principal holds.
 */
async function ledger(user: User | null, wardId?: string | null): Promise<WardCommitmentLedger> {
  await simulateLatency(`wardCommitments.ledger:${wardId ?? 'city'}`, 180, 520)

  const wards = authorisedWards(user)
  const options = wards.map((w) => ({ id: w.id, label: wardName(w.id) }))
  const wardSummaries = summariseWards(wards.map((w) => w.id)).sort(
    (a, b) => b.unactioned - a.unactioned || b.valueOutstandingCrore - a.valueOutstandingCrore,
  )
  const excluded = cityWideCommitmentCount()

  if (wardId) {
    const ward = requireWard(user, wardId)
    const commitments = buildWardCommitments(ward.id)
    return deepClone({
      scope: { wardId: ward.id, label: wardName(ward.id), wardsCovered: 1 },
      wards: options,
      commitments,
      summary: summariseCommitments(ward.id, wardName(ward.id), commitments),
      wardSummaries,
      excluded,
    })
  }

  // The city-wide reading counts a matter naming several wards once, so the
  // money on this screen is the corporation's position rather than the sum of
  // the ward readings - which would treble a three-ward resolution.
  const commitments = buildCommitmentsAcrossWards(wards.map((w) => w.id))
  const label = wards.length === WARDS.length ? 'All wards' : `${wards.length} authorised wards`

  return deepClone({
    scope: { wardId: null, label, wardsCovered: wards.length },
    wards: options,
    commitments,
    summary: summariseCommitments('city', label, commitments),
    wardSummaries,
    excluded,
  })
}

export const wardCommitmentsService = {
  ledger,
}
