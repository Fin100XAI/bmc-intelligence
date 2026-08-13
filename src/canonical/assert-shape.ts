import type { Department, Ward } from '@/types/organisation'

/**
 * src/canonical/assert-shape.ts
 *
 * Compile-time proof that the platform's existing `Ward` and `Department`
 * types already satisfy the pilot canonical schemas in this directory
 * (`ward.schema.json`, `department.schema.json`) - so the canonical layer
 * for those two entities is a naming and documentation exercise, not a data
 * migration. `building.schema.json` has no equivalent assertion here on
 * purpose: nothing in the codebase satisfies it yet, which is the actual
 * gap `docs/architecture/02-canonical-data-model.md` names.
 *
 * This file is never imported at runtime. Its only job is to fail
 * `npm run typecheck` if `Ward` or `Department` ever drift from the shape
 * the JSON Schemas describe, without requiring a schema-validation library
 * as a new runtime dependency for what is, today, a build-time contract.
 */

type CanonicalWardShape = {
  id: string
  tenantId: string
  code: string
  name: string
  zoneId: string
  population: number
  areaSqKm: number
  households: number
  wardOfficerId: string
}

type CanonicalDepartmentShape = {
  id: string
  tenantId: string
  name: string
  shortName: string
  headOfficerId: string
}

// `extends` rather than an exact match: the canonical shape is a required
// SUBSET of fields every consumer can rely on - Ward and Department are
// free to carry additional platform-specific fields (centroid, polygon,
// healthScore, staffCount, budgetCrore, ...) beyond it.
type _WardSatisfiesCanonical = Ward extends CanonicalWardShape ? true : never
type _DepartmentSatisfiesCanonical = Department extends CanonicalDepartmentShape ? true : never

// Referenced only so the type-level assertions above are not reported as
// unused - there is no runtime behaviour in this file.
export const CANONICAL_WARD_CHECK: _WardSatisfiesCanonical = true
export const CANONICAL_DEPARTMENT_CHECK: _DepartmentSatisfiesCanonical = true
