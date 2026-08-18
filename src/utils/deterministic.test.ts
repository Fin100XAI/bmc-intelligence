import { describe, expect, it } from 'vitest'
import { createRng, Deterministic, hashSeed } from './deterministic'

/**
 * The whole demonstration environment rests on one guarantee: the same seed
 * always produces the same figures, so a page never shows different numbers
 * on two renders or two reloads. These tests exist to catch a change that
 * would quietly break that guarantee - e.g. swapping in `Math.random()`
 * somewhere, or a seed that isn't actually a pure function of its inputs.
 */
describe('createRng / hashSeed', () => {
  it('the same seed produces the same sequence', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a()).not.toBe(b())
  })

  it('every draw stays within [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('hashSeed is a pure function of its input', () => {
    expect(hashSeed('bmc::alerts')).toBe(hashSeed('bmc::alerts'))
    expect(hashSeed('bmc::alerts')).not.toBe(hashSeed('pune::alerts'))
  })
})

describe('Deterministic', () => {
  it('the same namespace always yields the same values', () => {
    const a = new Deterministic('alert:sla:test-1')
    const b = new Deterministic('alert:sla:test-1')
    expect(a.int(1, 100)).toBe(b.int(1, 100))
    expect(a.float(0, 1)).toBe(b.float(0, 1))
    expect(a.pick(['x', 'y', 'z'])).toBe(b.pick(['x', 'y', 'z']))
  })

  it('int() stays within the inclusive bound, including a single-value range', () => {
    const d = new Deterministic('bounds-check')
    for (let i = 0; i < 100; i += 1) {
      const v = d.int(3, 3)
      expect(v).toBe(3)
    }
    const d2 = new Deterministic('bounds-check-2')
    for (let i = 0; i < 100; i += 1) {
      const v = d2.int(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThanOrEqual(20)
    }
  })

  it('pick() only ever returns an element from the input', () => {
    const d = new Deterministic('pick-check')
    const pool = ['red', 'amber', 'green']
    for (let i = 0; i < 50; i += 1) {
      expect(pool).toContain(d.pick(pool))
    }
  })

  it('pick() throws on an empty collection rather than returning undefined', () => {
    const d = new Deterministic('empty-pick')
    expect(() => d.pick([])).toThrow()
  })

  it('sample() returns distinct elements, capped at the pool size', () => {
    const d = new Deterministic('sample-check')
    const pool = [1, 2, 3, 4, 5]
    const sample = d.sample(pool, 3)
    expect(sample).toHaveLength(3)
    expect(new Set(sample).size).toBe(3)
    const overSample = d.sample(pool, 50)
    expect(overSample).toHaveLength(pool.length)
  })

  it('weighted() only ever returns one of the supplied values', () => {
    const d = new Deterministic('weighted-check')
    const entries: Array<[string, number]> = [
      ['low', 1],
      ['high', 99],
    ]
    for (let i = 0; i < 50; i += 1) {
      expect(['low', 'high']).toContain(d.weighted(entries))
    }
  })

  it('series() respects min/max clamping and returns the requested length', () => {
    const d = new Deterministic('series-check')
    const series = d.series(20, { start: 50, drift: 0, volatility: 0.5, min: 0, max: 100 })
    expect(series).toHaveLength(20)
    for (const value of series) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })
})
