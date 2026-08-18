import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCollection, hydrateStore, resetStore, setCollection } from './store'
import type { Alert } from '@/types/intelligence'

/**
 * `store.ts` is this session's persistence seam: `hydrateStore` overlays
 * whatever a tenant has persisted onto the deterministic seed before the
 * store is first built, and `setCollection` fire-and-forgets a write-through
 * PUT for the four whitelisted collections. Both paths are mocked at the
 * `fetch` boundary here rather than against a real dev-server plugin, so
 * this suite runs anywhere Vitest does - no running Vite server required.
 *
 * The very first test in this file is order-sensitive on purpose: `store.ts`
 * builds its module-scoped store lazily, once, on first access, and
 * `hydrateStore` only has an effect if it resolves before that first access.
 * Every subsequent test calls `resetStore()` first to get a clean slate, so
 * only this one exercises the true "before anything has touched the store
 * yet" boot path.
 */

function fetchMock(overlay: Record<string, unknown[]>): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const collection = new URL(url, 'http://localhost').pathname.split('/').pop()!
    return {
      ok: true,
      json: async () => ({ records: overlay[collection] ?? [] }),
    } as Response
  })
}

describe('store hydration (first-boot path)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a persisted alert overlays the deterministic seed on first access', async () => {
    const hydratedAlert = { id: 'sim-hydrated-1', tenantId: 'test-tenant', title: 'Hydrated Alert', status: 'escalated' } as unknown as Alert
    vi.stubGlobal('fetch', fetchMock({ alerts: [hydratedAlert] }))

    await hydrateStore('test-tenant')
    const alerts = getCollection('alerts')

    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.id).toBe('sim-hydrated-1')
  })
})

describe('store write-through and hydration fallback', () => {
  beforeEach(() => {
    resetStore()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('setCollection on a whitelisted collection PUTs the full array with the record tenantId', () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ ok: true }) }) as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const alerts = [{ id: 'a1', tenantId: 'tenant-x', status: 'open' } as unknown as Alert]
    setCollection('alerts', alerts)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('/api/state/alerts')
    expect(init?.method).toBe('PUT')
    const body = JSON.parse(init?.body as string)
    expect(body.tenantId).toBe('tenant-x')
    expect(body.records).toEqual(alerts)
  })

  it('setCollection on a non-whitelisted collection never calls fetch', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    setCollection('notifications', [])

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('setCollection with an empty array never calls fetch (no tenant to scope the write to)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    setCollection('alerts', [])

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a failed fetch during hydration is swallowed - hydrateStore never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable')
      }),
    )

    await expect(hydrateStore('test-tenant')).resolves.toBeUndefined()
  })

  it('a failed write-through during setCollection is swallowed - the caller is never blocked or thrown at', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable')
      }),
    )

    expect(() => setCollection('alerts', [{ id: 'a1', tenantId: 'tenant-x', status: 'open' } as unknown as Alert])).not.toThrow()
  })
})
