import { activeCorporation } from '@/config/municipality.config'
import { det } from '@/utils/deterministic'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/naming.ts
 *
 * CORPORATION-APPROPRIATE PLACE AND FACILITY NAMES
 *
 * The seed data was written for Mumbai and is full of Mumbai: Bhatsa and
 * Upper Vaitarna reservoirs, the Mithi river, Deonar and Kanjurmarg landfills,
 * Dadar, Andheri, Colaba. Every one of those is correct for Brihanmumbai and
 * wrong - conspicuously, embarrassingly wrong - for Nagpur or Solapur.
 *
 * This module is the single place data layers ask for a place name. It answers
 * from the active corporation's REAL published localities and water bodies
 * first, and only falls back to a neutral constructed name when the
 * corporation publishes nothing to draw on. It never borrows a real place name
 * from a different city: a Nagpur deployment will not be shown a Mithi river,
 * and it will not be shown an invented river either.
 *
 * Fallback names are deliberately plain - "Northern Source Reservoir",
 * "Sector 4 Transfer Station" - so it is obvious at a glance that they are
 * modelled facility labels rather than real named assets.
 */

const COMPASS = ['Northern', 'Eastern', 'Southern', 'Western', 'Central'] as const

/** Live bindings, rebuilt on corporation switch. */
export let CITY_NAME = ''
export let CORPORATION_SHORT_NAME = ''
/** Real published localities of the active corporation. May be empty. */
export let LOCALITIES: string[] = []
/** Real named water bodies of the active corporation, as drawn on the map. */
export let WATER_BODIES: string[] = []
/** Real bulk supply sources - dams, reservoirs, barrages. Never the sea. */
export let WATER_SOURCES: string[] = []
/** Real named forest, hill or protected area, where the city has one. */
export let GREEN_BELT: string | null = null

registerLayer(() => {
  const corp = activeCorporation
  // `t(corp.city)` rather than the raw field: this is the single place every
  // generated facility, department and locality name in the data layer reads
  // the city name from, so a raw English value here would leave "Mumbai"
  // hard-coded into dozens of downstream strings regardless of language.
  CITY_NAME = t(corp.city)
  CORPORATION_SHORT_NAME = corp.shortName
  LOCALITIES = [...corp.localities]
  WATER_BODIES = [...corp.form.waterBodies]
  WATER_SOURCES = [...corp.waterSources]
  GREEN_BELT = corp.form.greenBelt
})

/**
 * `count` locality names for the active corporation. Real published localities
 * come first, in the corporation's own order; anything beyond them is a
 * neutral constructed sector name rather than a borrowed or invented place.
 */
export function localityNames(count: number): string[] {
  const out = LOCALITIES.slice(0, count)
  for (let i = out.length; i < count; i += 1) {
    out.push(t('{0} Sector {1}', CITY_NAME, i + 1))
  }
  return out
}

/** One locality, chosen deterministically from the seed. */
export function localityFor(seed: string): string {
  if (LOCALITIES.length === 0) return t('{0} Sector {1}', CITY_NAME, (Math.abs(seed.length * 7) % 9) + 1)
  return det(`locality:${seed}`).pick(LOCALITIES)
}

/**
 * `count` water source names - reservoirs, rivers, lakes the corporation draws
 * from or manages. Real names first, then neutral constructed source labels.
 */
export function waterSourceNames(count: number): string[] {
  // The corporation's real bulk sources first - these are what a water supply
  // surface is actually describing. Only then the map's water features, and
  // only then a constructed label.
  const out: string[] = []
  for (const name of [...WATER_SOURCES, ...WATER_BODIES]) {
    if (out.length >= count) break
    if (!out.includes(name)) out.push(name)
  }
  for (let i = out.length; i < count; i += 1) {
    const compass = COMPASS[i % COMPASS.length] as string
    out.push(t('{0} Source Reservoir{1}', compass, i >= COMPASS.length ? ` ${Math.floor(i / COMPASS.length) + 1}` : ''))
  }
  return out
}

/**
 * A municipal facility label - a landfill, transfer station, treatment plant.
 * Always constructed, never a real facility name from another city, because
 * naming a real waste-processing site in the wrong city is the kind of error
 * that ends a demonstration.
 */
export function facilityName(kind: string, index: number): string {
  const compass = COMPASS[index % COMPASS.length] as string
  return `${compass} ${kind}${index >= COMPASS.length ? ` ${Math.floor(index / COMPASS.length) + 1}` : ''}`
}

/**
 * The prefix municipal reference numbers carry - `BMC/INC/2026/0114`,
 * `NMC/GRV/2026/0087`. Every register in the platform (incidents, complaints,
 * contracts, capital works, audit entries) must use this one helper: a
 * corporation whose seeded records are numbered `NMC/…` while records raised
 * during the session are numbered `MCGM/…` is a register nobody can reconcile.
 */
export function referencePrefix(register: string): string {
  return `${CORPORATION_SHORT_NAME.replace(/[^A-Za-z]/g, '').toUpperCase()}/${register}`
}

/** A civic landmark label used where seed data named a specific Mumbai place. */
export function landmarkName(seed: string, kind: string): string {
  const locality = localityFor(seed)
  return `${locality} ${kind}`
}
