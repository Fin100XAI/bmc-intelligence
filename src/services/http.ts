import { ServiceError, type ServiceErrorCode, type ServiceRequestOptions } from './client'

/**
 * src/services/http.ts
 *
 * The real transport, alongside the demonstration one.
 *
 * `client.ts` describes what a real adapter must preserve when it lands:
 * method signatures, the `User | null` first parameter, the four
 * `ServiceError` codes, and the audit contract. This module is that adapter's
 * plumbing, and it holds to all four.
 *
 * **The application is not cut over.** `API_BASE_URL` is read from
 * `VITE_API_BASE_URL`; when it is empty — which it is unless someone sets it —
 * every service behaves exactly as before, on the in-memory deterministic
 * data, with no server required. Migrated services check `isApiEnabled()` and
 * take the HTTP path only when one is configured. That is what allows the
 * migration to proceed one service at a time with `npm run verify` green
 * throughout, instead of as a single cutover where nothing works until
 * everything does.
 *
 * The `User` argument is still accepted by every migrated method and is still
 * used for the optimistic client-side permission check, but it is no longer
 * what establishes identity: the server reads that from a signed, httpOnly
 * session cookie it issued. A caller can now be wrong about who they are, and
 * the server will simply disagree.
 */

/**
 * The configured value, verbatim. Three meanings:
 *
 *   (empty)                    → demonstration mode; no server is contacted
 *   same-origin                → the API is served by whatever served this page
 *   http://host:port  or  /x   → an explicit prefix
 *
 * `same-origin` exists because an empty prefix and "no API" would otherwise be
 * the same string. In the intended production deployment one process serves
 * both the application and the API, so requests go to `/api/...` on the page's
 * own origin — no prefix at all, but very much an API. Collapsing that to the
 * empty string would silently drop the whole deployment back to demonstration
 * data, which is exactly the kind of quiet, plausible-looking failure this
 * platform is built to avoid.
 */
const CONFIGURED = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

const SAME_ORIGIN = 'same-origin'

/** Prefix placed before each path. Empty for same-origin. */
export const API_BASE_URL: string = CONFIGURED === SAME_ORIGIN ? '' : CONFIGURED.replace(/\/$/, '')

/** Whether an API is configured at all, independent of the prefix's length. */
const API_CONFIGURED = CONFIGURED.length > 0

/**
 * True inside a Node process — including one that has installed a jsdom
 * `window`, as `scripts/smoke-pages.mjs` does.
 *
 * `process.versions.node` is the discriminator rather than `typeof process`,
 * because bundlers sometimes define a partial `process.env` shim in browser
 * builds. Nothing defines `process.versions.node` in a browser.
 *
 * Read off `globalThis` with a local structural type rather than the ambient
 * `process` global: this module is part of the browser build, whose tsconfig
 * declares `types: ["vite/client"]` and deliberately does not include Node's
 * type definitions. Widening that to satisfy one probe would let genuinely
 * server-only APIs typecheck their way into the bundle.
 */
const IN_NODE_PROCESS =
  typeof (globalThis as { process?: { versions?: { node?: unknown } } }).process?.versions?.node ===
  'string'

/**
 * Whether a real API is configured AND reachable from this execution context.
 * Every migrated service branches on this.
 *
 * The second condition is not a detail. This transport authenticates with an
 * httpOnly session cookie, which exists only in a real browser: Node has no
 * cookie jar, and jsdom's is not connected to anything, so a request from
 * either arrives unauthenticated even when the server is running.
 *
 * Several harnesses in this repository load the application's modules outside
 * a browser. `scripts/smoke.mjs` runs them through Vite's SSR pipeline;
 * `scripts/smoke-pages.mjs` goes further and mounts every page against a jsdom
 * DOM, so `typeof window !== 'undefined'` is true there and is not sufficient
 * on its own. Both are asserting properties of the deterministic data, domain
 * and service layers, and must keep asserting them whether or not the
 * developer running them happens to have an API configured in `.env.local`.
 *
 * So the rule is: the HTTP transport activates in a real browser and nowhere
 * else. This is the same shape of guard `i18n/locale.ts` and `data/runtime.ts`
 * already apply around `localStorage`, for the same reason.
 */
export function isApiEnabled(): boolean {
  return API_CONFIGURED && typeof window !== 'undefined' && !IN_NODE_PROCESS
}

const VALID_CODES: ReadonlySet<string> = new Set<ServiceErrorCode>([
  'not-found',
  'forbidden',
  'invalid',
  'unavailable',
])

/**
 * Maps an HTTP status to a `ServiceErrorCode` for responses that did not
 * carry the server's own error envelope — a proxy timeout, a gateway error,
 * an HTML error page from something in front of the API.
 */
function codeForStatus(status: number): ServiceErrorCode {
  if (status === 400 || status === 422) return 'invalid'
  if (status === 401 || status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  return 'unavailable'
}

async function toServiceError(response: Response): Promise<ServiceError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Not JSON — a proxy or load balancer error page. Fall through to status.
  }

  const envelope = (body as { error?: { code?: unknown; detail?: unknown } } | null)?.error
  const code = typeof envelope?.code === 'string' && VALID_CODES.has(envelope.code)
    ? (envelope.code as ServiceErrorCode)
    : codeForStatus(response.status)
  const detail = typeof envelope?.detail === 'string' && envelope.detail.length > 0
    ? envelope.detail
    : `The service responded with HTTP ${response.status}.`

  return new ServiceError(code, detail)
}

interface RequestInput extends ServiceRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Query parameters. `undefined` and empty-string values are omitted. */
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
}

function buildUrl(path: string, query: RequestInput['query']): string {
  // `API_BASE_URL` is absolute in the intended configuration
  // (`http://localhost:4000`), but supporting a relative value matters: a
  // same-origin deployment behind one reverse proxy would set it to `/api`
  // or leave the host off entirely. The second argument is only consulted
  // when the first is relative, and is read lazily so this never touches
  // `window` on an absolute URL.
  const absolute = /^https?:\/\//i.test(API_BASE_URL)
  const url = absolute
    ? new URL(`${API_BASE_URL}${path}`)
    : new URL(`${API_BASE_URL}${path}`, window.location.origin)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/**
 * One request. Every migrated service method goes through here.
 *
 * `credentials: 'include'` is what carries the session cookie cross-origin in
 * development, where the application is on :5173 and the API on :4000. It
 * pairs with `cors({ credentials: true })` on the server; without both, the
 * cookie is silently not sent and every call resolves as unauthenticated.
 */
export async function request<T>(path: string, input: RequestInput = {}): Promise<T> {
  const { method = 'GET', query, body, signal } = input

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    // An aborted request is TanStack Query cancelling a superseded fetch, not
    // a failure. Rethrowing it as `unavailable` would surface a spurious
    // error banner every time an officer types in a filter box.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ServiceError(
      'unavailable',
      'The intelligence service could not be reached. Check the connection and retry.',
    )
  }

  if (!response.ok) throw await toServiceError(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

/** The envelope every list endpoint returns. */
export interface ListEnvelope<T> {
  items: T[]
}

/** The envelope every paged endpoint returns, matching `Paged<T>`. */
export interface PagedEnvelope<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
