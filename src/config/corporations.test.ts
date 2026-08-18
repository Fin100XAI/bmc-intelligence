import { describe, expect, it } from 'vitest'
import { CORPORATIONS, resolveDivisions, resolveWardCount, resolveZoneCount } from './corporations'

/**
 * These resolvers are the platform's multi-tenant claim made concrete - "a
 * single `CorporationRef` type... already shaped to hold any Maharashtra
 * municipal corporation, not just Brihanmumbai" only means something if the
 * resolvers actually behave sanely for whatever `CORPORATIONS` holds. Written
 * generically over the whole roster rather than against `bmc` by name, so
 * adding a second corporation (the platform's own stated next step - see
 * `PlatformReadinessPage.tsx`) is validated by this file without editing it.
 */
describe('corporation resolvers', () => {
  it('at least one corporation is on record', () => {
    expect(CORPORATIONS.length).toBeGreaterThan(0)
  })

  for (const corp of CORPORATIONS) {
    describe(`${corp.id}`, () => {
      it('resolves a positive, drawable ward count', () => {
        const count = resolveWardCount(corp)
        expect(count).toBeGreaterThan(0)
        expect(count).toBeLessThanOrEqual(30)
        expect(Number.isInteger(count)).toBe(true)
      })

      it('resolves a zone count no larger than half the ward count', () => {
        const wards = resolveWardCount(corp)
        const zones = resolveZoneCount(corp)
        expect(zones).toBeGreaterThanOrEqual(2)
        expect(zones).toBeLessThanOrEqual(Math.max(2, Math.floor(wards / 2)))
      })

      it('resolves exactly one division per resolved ward, and honours published names', () => {
        const wards = resolveWardCount(corp)
        const divisions = resolveDivisions(corp)
        expect(divisions).toHaveLength(wards)
        if (corp.divisions.length >= 3) {
          // Published divisions win outright - never truncated, never padded.
          expect(divisions.map((d) => d.name)).toEqual(corp.divisions.slice(0, wards).map((d) => d.name))
        }
      })

      it('every division has a non-empty name', () => {
        for (const division of resolveDivisions(corp)) {
          expect(division.name.trim().length).toBeGreaterThan(0)
        }
      })
    })
  }

  it('two different corporations do not collide on id', () => {
    const ids = CORPORATIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
