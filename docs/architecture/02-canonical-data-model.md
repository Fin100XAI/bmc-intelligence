# 02 — Canonical municipal data model

**Status:** informal. Real, consistent TypeScript interfaces exist per domain; there is no versioned, cross-domain entity model or master-data/entity-resolution layer. This is the actual precondition for the "reusable IP asset across ULBs" ambition — the types themselves are not it.

## What exists today

- ~30 domain type files under `src/types/*.ts` (`organisation.ts`, `finance.ts`, `city-domains.ts`, `civic-services.ts`, `legal.ts`, `enforcement.ts`, `correspondence.ts`, `heritage.ts`, `civic-participation.ts`, `infra-coordination.ts`, `development-plan.ts`, …), each internally consistent, each with its own `id: string` convention (`her-0001`, `enf-0042`, `bld-…`) and its own foreign-key style (`wardId: string`, `departmentId: string`, `contractorId: string`).
- Every record carries `tenantId: TenantId` (a plain string) for multi-tenant isolation, enforced once in `src/services/client.ts::scopeToTenant`.
- `src/data/reference.ts` is the closest thing to a master registry today: `WARDS`, `DEPARTMENTS`, `OFFICERS`, `ZONES` are each a single seeded source of truth other domains join against by id, with lookup helpers (`wardName()`, `departmentName()`, `officerDisplayName()`).
- **The gap this session surfaced directly:** `BuildingEntityPage.tsx` (just added) can only join a `BuildingRecord` against its ward's aggregate property and licence position, because `PropertySegment` and `LicenceRegister` are held per ward-and-segment/ward-and-category, not per individual premises. There is no shared `buildingId` (or `propertyId`, or `parcelId`) threaded through Property, Building, Licensing and Enforcement the way `wardId` is threaded through nearly everything.

## Target: a versioned entity model with real cross-domain identifiers

Not a rewrite of the existing type files — an **identifier layer above them**. Concretely:

1. **A canonical ID for every entity class that more than one domain needs to reference**, starting with the three that already have the most fan-out and the most acute known gap:
   - `WardId` — already exists, already consistent, already the model to copy.
   - `BuildingId` / `PropertyId` — does **not** exist as a shared identifier today. `PropertySegment` (aggregate) and `BuildingRecord` (individual) would both need to carry it, and Licensing/Enforcement records that concern a specific premises would carry it too, once premises-level data exists at all (see the note in `docs/architecture/03-connector-runtime.md` about property assessment being an aggregate, not per-parcel, dataset today).
   - `DepartmentId` — already exists, already consistent.
2. **A schema definition independent of the TypeScript interfaces that consume it** — JSON Schema (portable across the eventual server, any ETL job, and any other ULB deployment that isn't necessarily TypeScript) rather than only a `.ts` interface. See `src/canonical/` for the pilot.
3. **An entity-resolution service**, only once real ingested data exists: the actual hard problem a canonical model solves is not "what fields does a Ward have" but "are these two records from two different departmental systems the same ward" — matching on name/code fuzzily where two source systems disagree. This has no reasonable content until layer 1 (`docs/architecture/03-connector-runtime.md`) has a second real data source to reconcile against; scaffold the schema now, defer entity resolution until there's real ambiguity to resolve.

## Migration plan

1. Pilot with **Ward** (already canonical in shape, lowest risk) to prove the pattern: write `src/canonical/ward.schema.json`, and a thin adapter that asserts the existing `Ward` TypeScript interface satisfies it (a compile-time and a runtime check, not a rewrite).
2. Extend to **Department** the same way.
3. **Building/Property is the real work**, because it requires introducing an identifier that does not exist yet. Recommended shape: `BuildingId` is the anchor (matches the physical thing a Commissioner actually points at), and a `PropertyId` is 1:1 or 1:many with it (a single building can carry several property-tax assessments — multiple flats, multiple occupancy units, matching `BuildingRecord.occupancyUnits`). Land this by extending `BuildingRecord` with an optional `propertyIds: string[]` and back-filling `PropertySegment`-level detail down to individual `PropertyAssessment` records that carry it — which also happens to be the change that would let Property Intelligence stop being ward-aggregate-only (a real product improvement, not just a data-model exercise).
4. Once two or three canonical entities exist, revisit whether a formal MDM tool (e.g. an open-source entity-resolution library, or a lightweight Postgres-backed registry service) is justified, or whether the convention-plus-schema approach above is sufficient at this scale. Don't buy or build a full MDM platform before there are enough canonical entities for one to be worth operating.

## What stays exactly as it is

- Every existing domain type file, largely unchanged — the canonical layer sits above them as an identifier and schema discipline, not a replacement.
- `scopeToTenant` and the tenant-isolation model — canonical identifiers are still tenant-scoped the same way `WardId` already is.
