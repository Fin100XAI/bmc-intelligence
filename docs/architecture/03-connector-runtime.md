# 03 — Connector / ingestion runtime

**Status:** governance layer built and genuinely good; zero live connections; no server exists to run a connector on.

## What exists today

- `src/pages/admin/DataSourcesPage.tsx` — the most operationally dense admin page in the platform: source register (category, owner, cadence, records ingested, a real 5-dimension data-quality score, status, SLA/freshness breach flag), enable/pause/edit, a **simulated** sync action (weighted succeeded/partial/failed outcome affecting only the timeliness dimension), a 5-tab detail drawer (overview, schema with personal-data flags, quality breakdown, sync history, downstream-consumer impact list).
- `src/pages/admin/ConnectorsPage.tsx` — the same connector population from a provisioning lens: auth mode (mTLS/OAuth2/API-key-vault/SFTP-key/not-configured), state (`simulation` | `adapter-ready` | `not-connected` | `review-required` — `'live'` is never a value in this environment), a per-connector "provisioning prerequisite" statement, and an exportable "provisioning request pack."
- `src/services/client.ts`'s own header comment already documents the intended swap pattern for exactly this layer: replace deterministic generation with a consumer that folds the latest message into the store via `setCollection()` then calls `emitChange()` (`src/services/store.ts`) — real, working functions, just never called by anything live today.
- **No `server/` directory exists.** `package.json` already references `server/src/index.ts`, `server:start`, `db:seed`, `db:import`, `db:verify`, `db:status` — these scripts point at files that were never committed. The earlier commit message on this repository states this explicitly: *"Frontend only. The API server, its MongoDB layer and the container build are deliberately not in this commit."* The connector runtime is therefore not a partially-built feature; it is a named-but-empty slot in the project's own layout.

## Decision: pick one pilot feed, wire it completely, before adding more rows to the catalogue

The temptation with a 20-row connector catalogue is to "connect a few more" — resist it. One real feed, working end to end, proves the pattern; twenty simulated rows prove nothing further. **Recommended pilot: IMD (India Meteorological Department) / state Automatic Weather Station rainfall data**, feeding `MonsoonIntelligencePage`'s Rainfall Observations register, for three reasons:

1. It's the platform's flagship page, so the pilot lands somewhere visible rather than in a back-office register.
2. Rainfall telemetry is a clean, append-only, low-ambiguity time series — no entity-resolution problem (item 02) to solve simultaneously with the ingestion problem.
3. IMD publishes station data through public and semi-public APIs already, so the pilot doesn't block on inter-departmental data-sharing agreements the way, say, a live SAP/ERP feed would.

## Migration steps

1. Build the missing `server/` — a small Node/Express (or Fastify) service is enough to start; it does not need to be the full eventual backend, only a real HTTP surface a connector job can write into and the frontend can eventually read from.
2. Write one real job (`server/connectors/rainfall-poll.job.ts`, scaffolded below): polls the chosen station endpoint on a schedule, validates the payload shape, writes into a real table (Postgres/Timescale for a time series is the natural fit; a document store works too at this volume).
3. Point `DataSourcesPage`'s "Rainfall Observations (IMD/AWS)" row at this job's real health/last-sync/records-ingested figures instead of its simulated ones — the UI contract (the `DataSourceSpec` shape) doesn't change, only where its numbers come from.
4. Replace `MonsoonIntelligencePage`'s rainfall-observation generation in `src/data/monsoon-ops.data.ts` with a real API call to the new server endpoint, following the exact pattern `client.ts` already documents: `setCollection('rainfallObservations', freshRows)` then `emitChange()`.
5. Only after this one pilot is genuinely live end to end, repeat the pattern for the next-highest-value feed (pumping-station telemetry for Storm Water is the natural second target — same "clean time series, no entity-resolution problem" shape).

## What stays exactly as it is

- `DataSourceSpec` and `ConnectorSpec`'s shapes, and both admin pages' UI — genuinely well-designed governance surfaces; the change is what feeds them, not their design.
- `setCollection()` / `emitChange()` / `subscribe()` in `src/services/store.ts` — already the correct seam, just unused.
