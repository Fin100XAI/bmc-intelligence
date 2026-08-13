/**
 * server/connectors/rainfall-poll.job.ts
 *
 * SCAFFOLDING — not wired into any build or run script. See
 * docs/architecture/03-connector-runtime.md for why this is the recommended
 * pilot connector and what "wired in" actually requires (a real `server/`
 * service, a real datastore, real IMD/AWS credentials — none of which this
 * file assumes or fakes).
 *
 * This is the SHAPE a real ingestion job takes in this codebase's own
 * conventions: a scheduled poll, a typed payload contract, a validation
 * step, and a write path that ends at the exact seam `src/services/client.ts`
 * already documents (`setCollection()` + `emitChange()` on the frontend,
 * once a real API sits between this job and the browser). No package in
 * `package.json` today provides an HTTP client or a scheduler — this file
 * intentionally does not import one, so it cannot silently participate in
 * `npm run typecheck` (it sits outside `tsconfig.app.json`'s `src`-only
 * `include`) or in any build script. Treat every `TODO` below as the actual
 * remaining work.
 */

/** One reading, at the shape the pilot ultimately needs to satisfy. */
export interface RainfallObservation {
  stationId: string
  stationName: string
  wardId: string
  observedAt: string /* ISO-8601 */
  rainfallMm1h: number
  rainfallMm24h: number
  rainfallMmSeasonTotal: number
  seasonNormalMm: number
}

export interface PollResult {
  observations: RainfallObservation[]
  fetchedAt: string
  source: 'imd-public-api' | 'state-aws-network'
}

/**
 * TODO(server): replace with a real HTTP client (undici/fetch is already
 * available in Node 18+, no new dependency required) hitting IMD's public
 * data endpoint or the state Automatic Weather Station network, with a real
 * API key sourced from environment configuration - never hard-coded.
 */
async function fetchStationReadings(): Promise<RainfallObservation[]> {
  throw new Error(
    'TODO(server): fetch real station readings. This job is architecture scaffolding, not a running connector - see docs/architecture/03-connector-runtime.md.',
  )
}

/**
 * TODO(server): validate the fetched payload against a schema (reuse the
 * canonical-entity discipline from docs/architecture/02-canonical-data-model.md
 * rather than inventing a second validation convention) before it is
 * trusted enough to write anywhere.
 */
function validate(observations: RainfallObservation[]): RainfallObservation[] {
  return observations.filter((o) => Number.isFinite(o.rainfallMm1h) && o.stationId.length > 0)
}

/**
 * TODO(server): write to a real time-series-shaped table (Postgres/Timescale
 * is the natural fit for append-only station readings at this cadence) and
 * update the corresponding row in the Data Sources register
 * (`DataSourceSpec` in `src/data/data-sources.data.ts`) with the real
 * last-sync time, record count and quality score this poll actually
 * produced - replacing that row's currently-simulated sync outcome.
 */
async function persist(_result: PollResult): Promise<void> {
  throw new Error('TODO(server): persist to a real datastore and update the Data Sources register.')
}

/**
 * The job's entry point. A real deployment schedules this - e.g. every 15
 * minutes during the monsoon season, less frequently outside it - with a
 * job runner (cron, a queue consumer, or a serverless scheduled function),
 * not by calling it directly from request-handling code.
 */
export async function runRainfallPoll(): Promise<PollResult> {
  const raw = await fetchStationReadings()
  const observations = validate(raw)
  const result: PollResult = { observations, fetchedAt: new Date().toISOString(), source: 'imd-public-api' }
  await persist(result)
  return result
}
