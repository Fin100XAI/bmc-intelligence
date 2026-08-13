# 07 — Persisted graph store

**Status:** correctly deferred. The render-time-join approach is the right call at today's scale; this document exists so the migration trigger is written down before someone hits it, not because it should be actioned now.

## What exists today

- `src/services/graph.service.ts` / `src/data/knowledge-graph.data.ts` — the Municipal Knowledge Graph's neighbourhood queries (focus node + first/second-degree relations) are computed by traversing the existing seeded arrays (`WARDS`, `CONTRACTS`, `PROJECTS`, `COUNCIL_RESOLUTIONS`, …) at request time, joined by their existing `wardId`/`departmentId`/`contractorId`-style foreign keys.
- `src/services/infrastructure-graph.service.ts` — the same pattern, specialised to one accountability chain (asset → ward → department → contractor → project → complaint → budget → incident) per query.
- `src/pages/strategic/KnowledgeGraphPage.tsx` — the richest interactive surface in the platform, and genuinely fast, because the dataset it's querying is small (thousands of rows, not millions) and lives in memory already.

## Why this is correctly deferred, not merely unbuilt

A dedicated graph database (Neo4j, Amazon Neptune, or similar) solves a problem this platform doesn't have yet: **multi-hop traversal at a scale where computing it on every request is too slow, or across a dataset too large to hold in memory.** At today's data volumes — even a real, fully-connected Brihanmumbai deployment is thousands to tens of thousands of entities, not millions — the render-time-join approach is faster to build, has no separate infrastructure to operate, and is exactly as correct. Introducing a graph database now would be solving next year's problem before this year's data exists to justify it.

## The actual migration trigger

Revisit this when **any** of the following becomes true, not on a calendar:

1. A Knowledge Graph query (`graph.service.ts`'s neighbourhood resolution) is measurably slow in production — not in this demo environment's synthetic dataset, but against real ingested volumes once item 03 (connector runtime) has landed real data.
2. A requested capability genuinely needs multi-hop traversal the current one/two-degree neighbourhood query can't express — e.g. "every path from Ward X to Contractor Y," which `KnowledgeGraphPage`'s own gap notes already name as currently unsupported.
3. The canonical data model (item 02) reaches enough entity types with enough cross-references that entity-resolution and graph query naturally become the same problem — at that point a real graph store may absorb both needs at once rather than requiring two separate solutions.

## What the migration would look like, when triggered

1. Stand up the graph store (Neo4j is the more common open-source choice for a first deployment; Neptune if already committed to AWS).
2. Write a one-time export from the existing seeded/ingested arrays into nodes and edges — the existing foreign-key convention (`wardId`, `contractorId`, …) already IS the edge list; this is a transformation, not new data modelling.
3. Point `graph.service.ts` and `infrastructure-graph.service.ts` at Cypher (or Gremlin) queries instead of in-memory array joins. The service method signatures (`neighbourhood()`, the scoped-chain resolver) don't need to change — only their implementation.
4. Keep the render-time approach as a fallback path for any deployment too small to justify running a graph database — this is a genuine architectural choice per-deployment, not a one-way door for the whole platform.

## What stays exactly as it is

- `GraphNeighbourhoodResult`, `ScopedInfrastructureChain` and every other type this layer already returns — a persisted store changes where the answer comes from, not its shape.
- `KnowledgeGraphPage.tsx` and `InfrastructureGraphPage.tsx` — unaffected by the swap, by design.
