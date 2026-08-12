import { getActiveCorporationId } from '@/data/runtime'

/**
 * Deterministic pseudo-random generation.
 *
 * The demonstration environment must never produce different figures on
 * re-render or reload - an intelligence platform whose numbers move without
 * cause is not credible. Every dataset is derived from a fixed seed via
 * mulberry32, so the same seed always yields the same municipal picture.
 */

/** mulberry32 - small, fast, well-distributed 32-bit PRNG. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 32-bit hash of a string - used to seed per-entity generators. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A deterministic generator bound to a namespace string. */
export class Deterministic {
  private readonly rng: () => number

  constructor(namespace: string) {
    this.rng = createRng(hashSeed(namespace))
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.rng() * (max - min)
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  /** Rounded float with fixed decimal places. */
  round(min: number, max: number, decimals = 1): number {
    const factor = 10 ** decimals
    return Math.round(this.float(min, max) * factor) / factor
  }

  /** Pick one element. Throws on empty input rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Deterministic.pick called with an empty collection')
    return items[Math.floor(this.rng() * items.length)] as T
  }

  /** Pick `count` distinct elements (or all, if fewer are available). */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items]
    const out: T[] = []
    const n = Math.min(count, pool.length)
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(this.rng() * pool.length)
      out.push(pool.splice(idx, 1)[0] as T)
    }
    return out
  }

  /** True with the given probability. */
  chance(probability: number): boolean {
    return this.rng() < probability
  }

  /**
   * Weighted pick. Weights need not sum to 1.
   */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let r = this.rng() * total
    for (const [value, weight] of entries) {
      r -= weight
      if (r <= 0) return value
    }
    return entries[entries.length - 1]![0]
  }

  /**
   * Generates a smooth series with mild noise around a moving baseline -
   * far more believable than pure noise for operational indicators.
   */
  series(
    length: number,
    options: { start: number; drift?: number; volatility?: number; min?: number; max?: number; decimals?: number },
  ): number[] {
    const { start, drift = 0, volatility = 0.05, min = -Infinity, max = Infinity, decimals = 1 } = options
    const factor = 10 ** decimals
    const out: number[] = []
    let current = start
    for (let i = 0; i < length; i += 1) {
      const shock = (this.rng() - 0.5) * 2 * volatility * Math.max(Math.abs(current), 1)
      current = current + drift + shock
      current = Math.min(max, Math.max(min, current))
      out.push(Math.round(current * factor) / factor)
    }
    return out
  }
}

/**
 * Convenience factory, and the single choke point that makes every modelled
 * figure in the platform corporation-dependent.
 *
 * The namespace is prefixed with the active municipal corporation's id before
 * it is hashed. That matters because roughly two thirds of the seeds in this
 * codebase are index-only, department-id or fixed-literal strings -
 * `det('contractor:3')`, `det('audit:12')`, `det('dept:dept-hydraulic')`.
 * Without the prefix, Pune and Nagpur would draw from exactly the same
 * generator as Mumbai and produce identical contractor performance, identical
 * audit trails and identical AI request logs, differing only where a ward id
 * happened to reach the seed. Switching corporation would change the labels
 * and leave the intelligence untouched, which is worse than not switching at
 * all.
 *
 * Determinism is unaffected: the seed is still a pure function of its inputs,
 * and the same corporation always yields the same municipal picture.
 */
export function det(namespace: string): Deterministic {
  return new Deterministic(`${getActiveCorporationId()}::${namespace}`)
}

/**
 * A fixed reference instant for the whole demonstration environment.
 *
 * All relative timestamps are derived from this anchor so that screenshots,
 * audit trails and freshness indicators remain internally consistent. It is
 * advanced only by explicit user action (never silently on each render).
 */
export const DEMO_NOW = new Date('2026-07-24T09:20:00+05:30')

/** Offset minutes from the demonstration anchor, returned as ISO-8601. */
export function isoFromAnchor(offsetMinutes: number): string {
  return new Date(DEMO_NOW.getTime() + offsetMinutes * 60_000).toISOString()
}

/** Offset days from the demonstration anchor, returned as ISO-8601. */
export function isoDaysFromAnchor(offsetDays: number): string {
  return isoFromAnchor(offsetDays * 24 * 60)
}
