import { describe, expect, it } from 'vitest'
import { canAccess } from './access'
import { USER_BY_ID } from '@/auth/demo-users'
import { WARDS } from '@/data/reference'

/**
 * `canAccess` is the single enforcement point named on the Platform
 * Readiness page ("a single `canAccess` function evaluates role grants
 * together with ward, department, domain and classification attributes on
 * every read and write") - exercised here against the real demonstration
 * principals and real ward data rather than synthetic fixtures, so a change
 * to a role's grants or a principal's scope is caught here too.
 */
describe('canAccess', () => {
  it('denies a null principal outright', () => {
    const decision = canAccess(null, 'alert', 'view')
    expect(decision.allowed).toBe(false)
    expect(decision.basis).toBe('unknown-role')
  })

  it('a city-wide principal (Commissioner) can view alerts in any ward', () => {
    const commissioner = USER_BY_ID.get('user-commissioner')
    expect(commissioner).toBeDefined()
    const anyWard = WARDS[0]
    expect(anyWard).toBeDefined()
    const decision = canAccess(commissioner!, 'alert', 'view', { wardId: anyWard!.id })
    expect(decision.allowed).toBe(true)
    expect(decision.basis).toBe('granted')
  })

  it("a ward officer is allowed within their own ward and denied outside it", () => {
    const wardOfficer = USER_BY_ID.get('user-ward-officer')
    expect(wardOfficer).toBeDefined()
    const scope = wardOfficer!.scope.wardIds
    expect(scope).not.toBe('*')
    const ownWardId = (scope as string[])[0]!

    const withinScope = canAccess(wardOfficer!, 'intelligence', 'view', { wardId: ownWardId })
    expect(withinScope.allowed).toBe(true)

    const foreignWard = WARDS.find((w) => w.id !== ownWardId)
    expect(foreignWard).toBeDefined()
    const outsideScope = canAccess(wardOfficer!, 'intelligence', 'view', { wardId: foreignWard!.id })
    expect(outsideScope.allowed).toBe(false)
    expect(outsideScope.basis).toBe('ward-scope')
  })

  it('a role without the permission at all is denied on role-permission, not scope', () => {
    // An auditor reads the audit trail; approving a decision is not their function.
    const auditor = USER_BY_ID.get('user-auditor')
    expect(auditor).toBeDefined()
    const decision = canAccess(auditor!, 'decision', 'approve')
    expect(decision.allowed).toBe(false)
    expect(decision.basis).toBe('role-permission')
  })

  it('a request with no ward/department/domain context is not scope-denied', () => {
    const wardOfficer = USER_BY_ID.get('user-ward-officer')
    const decision = canAccess(wardOfficer!, 'intelligence', 'view')
    // May still be denied on role-permission depending on the role's grants,
    // but must never be denied for a scope reason when no scope was asked for.
    expect(['ward-scope', 'department-scope', 'domain-scope']).not.toContain(decision.basis)
  })
})
