import { useSyncExternalStore } from 'react'

/* ---------------------------------------------------------------------------
 * ACTIVE-CORPORATION RUNTIME
 *
 * The Urban Intelligence Core is deployment-neutral, but until now this build
 * resolved exactly one tenant (Brihanmumbai) at module load and never moved
 * again. This runtime makes the ACTIVE MUNICIPAL CORPORATION switchable while
 * the application is running - any of Maharashtra's municipal corporations -
 * and rebuilds every data layer for it.
 *
 * How it works, and why it needs almost no change at the page level:
 *
 *   - Each layer (`municipality.config`, `geography`, `reference`, every
 *     `*.data.ts`, `demo-users`) exports its records as `let` bindings and
 *     registers a rebuild callback through `registerLayer`.
 *   - A layer's rebuild reads its upstream dependencies through ordinary ESM
 *     imports. Those imports are LIVE bindings, and because a module's imports
 *     always evaluate before its own body, registration order is a valid
 *     topological order for the dependency graph. Replaying the rebuilds in
 *     registration order therefore guarantees every layer sees freshly-rebuilt
 *     upstream data.
 *   - `municipality.config` is the only layer that reads the active id (via
 *     `getActiveCorporationId`); everything downstream just reads the config
 *     and the layers above it.
 *
 * On a switch we rebuild every layer in order, then bump a version React
 * subscribes to - the routed subtree is keyed by it and remounts, so every page
 * re-reads the now-current bindings. The pages themselves are untouched.
 *
 * This does NOT move the demonstration clock. `DEMO_NOW`
 * (`src/utils/deterministic.ts`) stays frozen across a corporation switch, so
 * freshness labels, audit ages and evidence timestamps remain internally
 * consistent no matter which corporation is being shown.
 * ------------------------------------------------------------------------- */

/**
 * The zustand persistence key for the corporation selection. Declared here
 * rather than imported from the store because this module must not depend on
 * anything - it is the root of the layer graph and is evaluated first.
 */
export const CORPORATION_STORAGE_KEY = 'bmc-mii.corporation'

/** The corporation this build resolves to when nothing has been selected. */
export const DEFAULT_CORPORATION_ID = 'bmc'

/**
 * Resolve the initial corporation from persisted state BEFORE any data module
 * evaluates, so the very first build is already the right corporation and the
 * interface never flashes another corporation's figures on a reload.
 */
function readInitialCorporationId(): string {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_CORPORATION_ID
    const raw = localStorage.getItem(CORPORATION_STORAGE_KEY)
    if (!raw) return DEFAULT_CORPORATION_ID
    const id: unknown = JSON.parse(raw)?.state?.corporationId
    return typeof id === 'string' && id.length > 0 ? id : DEFAULT_CORPORATION_ID
  } catch {
    // Corrupt or unreadable storage falls through to the default rather than
    // failing the application boot.
    return DEFAULT_CORPORATION_ID
  }
}

let activeCorporationId: string = readInitialCorporationId()
let version = 0

const rebuilders: Array<() => void> = []
const listeners = new Set<() => void>()

/** The corporation every data layer is currently built for. */
export function getActiveCorporationId(): string {
  return activeCorporationId
}

/** Monotonic counter, incremented once per corporation switch. */
export function getActiveVersion(): number {
  return version
}

/**
 * Register a data layer. `rebuild` is invoked once immediately - that is the
 * initial build for the current corporation - and again, in registration
 * order, on every subsequent switch.
 */
export function registerLayer(rebuild: () => void): void {
  rebuilders.push(rebuild)
  rebuild()
}

/**
 * Hooks that must run after every layer has been rebuilt but before React is
 * told anything changed - resetting the in-session service store, clearing the
 * query cache, dropping a stale ward selection. Registered by modules that
 * hold derived state rather than seed data.
 */
const afterRebuildHooks: Array<() => void> = []

export function onAfterRebuild(hook: () => void): void {
  afterRebuildHooks.push(hook)
}

/**
 * Replay every layer's rebuild in registration order, run the after-rebuild
 * hooks, and bump the version React subscribes to.
 *
 * Two things move the whole picture at once: choosing a different municipal
 * corporation, and choosing a different language. They are the same operation
 * from this module's point of view - the layers below hold seeded figures AND
 * the words that describe them, and both are drawn afresh here. The seeds
 * themselves are keyed on the corporation and never on the language, so
 * switching to Marathi renames the municipal picture without moving a single
 * figure in it.
 */
export function rebuildAllLayers(): void {
  for (const rebuild of rebuilders) rebuild()
  for (const hook of afterRebuildHooks) hook()
  version += 1
  for (const listener of listeners) listener()
}

/**
 * Switch the active corporation and rebuild every layer in dependency order.
 * Synchronous by design: the entire dataset is consistent before React is
 * given the chance to re-render against a half-rebuilt picture.
 */
export function setActiveCorporation(id: string): void {
  if (id === activeCorporationId) return
  activeCorporationId = id
  rebuildAllLayers()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * React hook returning a value that changes on every corporation switch. Key a
 * subtree by it to force a clean remount so pages re-read the rebuilt data.
 */
export function useActiveVersion(): number {
  return useSyncExternalStore(subscribe, getActiveVersion, getActiveVersion)
}
