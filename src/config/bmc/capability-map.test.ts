import { describe, expect, it } from 'vitest'
import { areaWing, capabilityAreas, existingSystems } from './capability-map'
import { bmcPublicFeeds, bmcWebsiteMap } from './roadmap'
import { bmcProjects } from './public-money'
import { bmcWards } from './wards'
import { buildCases, loadDecisionLayer } from '@/services/decision-intelligence'
import { activeCorporation } from '@/config/municipality.config'
import { ALL_NAV_ITEMS } from '@/config/navigation'

/**
 * Mumbai's real-data layer must be wired end to end: every evidence id an
 * area, insight, project or ward cites must resolve, every evidence record
 * must name a source that exists, every working screen must be a real menu
 * page, and every area must sit under a department wing in the menu. A
 * missing id would otherwise fail silently - the figure simply would not show.
 */

const routes = new Set(ALL_NAV_ITEMS.map((i) => i.to))

describe('BMC real-data layer', () => {
  it('runs for BMC', () => {
    expect(activeCorporation.id).toBe('bmc')
  })

  const layer = loadDecisionLayer()
  const evidence = new Set(layer.evidence.map((e) => e.id))
  const sources = new Set(layer.sources.map((s) => s.id))

  it('has no duplicate source or evidence ids', () => {
    expect(evidence.size).toBe(layer.evidence.length)
    expect(sources.size).toBe(layer.sources.length)
  })

  it('names an existing source for every figure, with a quote and a read date', () => {
    for (const e of layer.evidence) {
      expect(sources.has(e.sourceId), e.id).toBe(true)
      expect(e.quote.length, e.id).toBeGreaterThan(0)
      expect(e.extractedOn, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    for (const s of layer.sources) expect(s.url, s.id).toMatch(/^https?:\/\//)
  })

  it('resolves every conflict pair', () => {
    for (const e of layer.evidence) for (const c of e.conflictsWith ?? []) expect(evidence.has(c), `${e.id} -> ${c}`).toBe(true)
  })

  it('resolves every evidence id cited by an area or insight', () => {
    for (const a of capabilityAreas()) {
      for (const id of a.evidenceIds ?? []) expect(evidence.has(id), `area ${a.n}: ${id}`).toBe(true)
      for (const i of a.insights ?? []) for (const id of i.evidenceIds) expect(evidence.has(id), `area ${a.n} insight: ${id}`).toBe(true)
    }
  })

  it('links every area to working screens that exist, under a menu wing', () => {
    for (const a of capabilityAreas()) {
      expect(a.today.length, `area ${a.n}`).toBeGreaterThan(0)
      for (const l of a.today) expect(routes.has(l.to), `area ${a.n}: ${l.to}`).toBe(true)
      expect(areaWing(a), `area ${a.n}`).toBeTruthy()
    }
  })

  it('numbers the areas 1 to n with no gaps', () => {
    const ns = capabilityAreas().map((a) => a.n)
    expect(ns).toEqual(ns.map((_, i) => i + 1))
  })

  it('resolves every evidence id cited by a project or ward', () => {
    for (const p of bmcProjects()) {
      for (const id of p.evidenceIds) expect(evidence.has(id), `${p.id}: ${id}`).toBe(true)
      for (const m of Object.values(p.money)) if (m) expect(evidence.has(m.evidenceId), `${p.id} money`).toBe(true)
      if (p.status) expect(evidence.has(p.status.evidenceId), `${p.id} status`).toBe(true)
    }
    for (const w of bmcWards()) for (const id of w.evidenceIds) expect(evidence.has(id), `ward ${w.code}: ${id}`).toBe(true)
  })

  it('places every located work inside Greater Mumbai and its surroundings', () => {
    for (const p of bmcProjects()) {
      const pt = p.location.point
      if (!pt) continue
      expect(pt.lat, p.id).toBeGreaterThan(18.8)
      expect(pt.lat, p.id).toBeLessThan(19.9)
      expect(pt.lon, p.id).toBeGreaterThan(72.7)
      expect(pt.lon, p.id).toBeLessThan(73.6)
    }
  })

  it('sums the census ward populations to the Greater Mumbai total', () => {
    expect(bmcWards().reduce((s, w) => s + (w.population2011 ?? 0), 0)).toBe(12_442_373)
  })

  it('maps systems, feeds and the portal', () => {
    expect(existingSystems().length).toBeGreaterThan(10)
    expect(bmcPublicFeeds().length).toBeGreaterThan(10)
    expect(bmcWebsiteMap().length).toBeGreaterThan(10)
  })

  it('raises cases from the evidence, including source contradictions', () => {
    const cases = buildCases(layer)
    expect(cases.length).toBeGreaterThan(0)
    expect(cases.some((c) => c.origin === 'contradiction')).toBe(true)
  })
})
