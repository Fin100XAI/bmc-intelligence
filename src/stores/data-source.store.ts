import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { onAfterRebuild } from '@/data/runtime'
import type { DataClassification } from '@/types/common'
import type {
  DataSource,
  DataSourceQuality,
  DataSourceStatus,
  DataSourceSyncRun,
  SyncFrequency,
} from '@/types/governance'

/**
 * src/stores/data-source.store.ts
 *
 * Session state for the Data Sources administration surface. The seed register
 * is served read-only through `adminService.dataSources`; every mutation an
 * operator makes here — enabling, pausing, changing cadence, reclassifying,
 * changing retention, running a simulated sync, adding or removing a source —
 * is held in this store and layered over the seed by `applyDataSourceState`.
 *
 * It is interface state, not a database: nothing here is written back to any
 * service, and it is persisted only so a demonstration survives a reload.
 *
 * One deliberate asymmetry: a *sync* writes a run into the session history and
 * refreshes the figures it legitimately touches — last sync, record count,
 * latency, timeliness — but never completeness, validity, uniqueness or
 * consistency. Those are properties of the upstream data, not of how recently
 * someone pressed a button, and a register that improved its own quality score
 * on demand would be worth nothing to the steward reading it.
 */

/** The subset of a DataSource an operator can change in-session. */
export interface DataSourceOverride {
  enabled?: boolean
  status?: DataSourceStatus
  frequency?: SyncFrequency
  classification?: DataClassification
  retentionDays?: number
  ownerDepartmentId?: string
  lastSyncAt?: string
  recordsIngested?: number
  latencyMs?: number
  quality?: DataSourceQuality
  /** Runs performed this session, newest first, prepended to the seed history. */
  sessionRuns?: DataSourceSyncRun[]
}

export interface SyncResult {
  run: DataSourceSyncRun
  recordsIngested: number
  latencyMs: number
  /** Refreshed timeliness only; the other four dimensions are left alone. */
  timeliness: number
}

/** The operator-editable fields on the Edit source dialog. */
export type DataSourceEdit = Pick<
  DataSourceOverride,
  'classification' | 'retentionDays' | 'ownerDepartmentId' | 'frequency'
>

interface DataSourceState {
  /** Field-level overrides keyed by source id (seed and custom alike). */
  overrides: Record<string, DataSourceOverride>
  /** Sources added in-session through the Add data source form. */
  added: DataSource[]
  /** Seed source ids the operator has removed. */
  removed: string[]

  toggleEnabled: (id: string, nextEnabled: boolean) => void
  setFrequency: (id: string, frequency: SyncFrequency) => void
  updateSource: (id: string, patch: DataSourceEdit) => void
  recordSync: (source: DataSource, result: SyncResult) => void
  addSource: (source: DataSource) => void
  removeSource: (source: DataSource) => void
  resetAll: () => void
  /** True when the store holds any mutation over the seed. */
  hasChanges: () => boolean
  /** How many sources carry an operator change, for the header summary. */
  changedCount: () => number
}

export const useDataSourceStore = create<DataSourceState>()(
  persist(
    (set, get) => ({
      overrides: {},
      added: [],
      removed: [],

      toggleEnabled: (id, nextEnabled) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            // Pausing suspends ingestion; resuming leaves the feed stale until
            // its next (simulated) sync — it is not asserted healthy on resume.
            [id]: { ...s.overrides[id], enabled: nextEnabled, status: nextEnabled ? 'stale' : 'paused' },
          },
        })),

      setFrequency: (id, frequency) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], frequency } } })),

      updateSource: (id, patch) =>
        set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } } })),

      recordSync: (source, result) =>
        set((s) => {
          const existing = s.overrides[source.id]
          const seedQuality = source.quality
          return {
            overrides: {
              ...s.overrides,
              [source.id]: {
                ...existing,
                status:
                  result.run.outcome === 'failed'
                    ? 'error'
                    : result.run.outcome === 'partial'
                      ? 'degraded'
                      : 'healthy',
                lastSyncAt: result.run.startedAt,
                recordsIngested: result.recordsIngested,
                latencyMs: result.latencyMs,
                quality: seedQuality ? { ...seedQuality, timeliness: result.timeliness } : undefined,
                sessionRuns: [result.run, ...(existing?.sessionRuns ?? [])].slice(0, 24),
              },
            },
          }
        }),

      addSource: (source) => set((s) => ({ added: [source, ...s.added] })),

      removeSource: (source) =>
        set((s) => {
          const { [source.id]: _removed, ...restOverrides } = s.overrides
          return source.custom
            ? { added: s.added.filter((d) => d.id !== source.id), overrides: restOverrides }
            : { removed: [...s.removed, source.id], overrides: restOverrides }
        }),

      resetAll: () => set({ overrides: {}, added: [], removed: [] }),

      hasChanges: () => {
        const s = get()
        return Object.keys(s.overrides).length > 0 || s.added.length > 0 || s.removed.length > 0
      },

      changedCount: () => {
        const s = get()
        return Object.keys(s.overrides).length + s.added.length + s.removed.length
      },
    }),
    { name: 'bmc-mii.data-sources', version: 2 },
  ),
)

/**
 * Session overrides are keyed by connector id, and connector ids are stable
 * across corporations. Without this, pausing a feed in one corporation would
 * leave it paused after switching to another, and a connector an operator
 * added by hand would appear in a corporation that never provisioned it -
 * changes attributed to a deployment that never made them.
 */
onAfterRebuild(() => {
  useDataSourceStore.getState().resetAll()
})

/** Mean of the five dimensions — the single place the headline score is set. */
export function meanQualityScore(quality: DataSourceQuality): number {
  return Math.round(
    (quality.completeness + quality.validity + quality.timeliness + quality.uniqueness + quality.consistency) / 5,
  )
}

/**
 * Layers the session store over the read-only seed: drops removed sources,
 * appends in-session additions, applies field overrides by id, and prepends
 * this session's simulated runs to each source's history.
 */
export function applyDataSourceState(
  seed: DataSource[],
  state: Pick<DataSourceState, 'overrides' | 'added' | 'removed'>,
): DataSource[] {
  const kept = seed.filter((s) => !state.removed.includes(s.id))
  return [...kept, ...state.added].map((source) => {
    const override = state.overrides[source.id]
    if (!override) return source
    const { sessionRuns, quality, ...fields } = override
    const merged: DataSource = { ...source, ...fields }
    if (quality) {
      merged.quality = quality
      merged.qualityScore = meanQualityScore(quality)
    }
    if (sessionRuns?.length) {
      merged.syncHistory = [...sessionRuns, ...(source.syncHistory ?? [])]
    }
    return merged
  })
}
