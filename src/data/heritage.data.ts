import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type {
  ConservationStatus,
  HeritageGrade,
  HeritageManagingAuthority,
  HeritageSite,
  HeritageSiteCategory,
  HeritageTourismPosition,
} from '@/types/heritage'
import { det, isoDaysFromAnchor } from '@/utils/deterministic'
import { WARDS } from './reference'
import { CITY_SCALE, scaled, scaledCount } from './scale'
import { stateFrom } from './city.data'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * src/data/heritage.data.ts
 *
 * Real, named sites ground the Brihanmumbai deployment only - Rani Bagh
 * (Veermata Jijabai Bhonsle Udyan) and the Bhau Daji Lad Museum within it,
 * the Hanging Gardens and Kamala Nehru Park on Malabar Hill, Marine Drive
 * and Girgaon Chowpatty, Mahim Nature Park, and the Kala Ghoda / Fort
 * heritage precinct that sits within the UNESCO-inscribed Victorian and Art
 * Deco Ensemble of Mumbai. Every other corporation sees a generic,
 * clearly-labelled site template, in keeping with the rest of this data
 * layer's naming discipline - a landlocked corporation does not get a
 * promenade, and no corporation is shown a heritage asset borrowed from a
 * different city.
 *
 * Grading, condition, footfall and revenue for every site - including the
 * named Brihanmumbai ones - remain modelled demonstration data.
 */

export let HERITAGE_SITES: HeritageSite[] = []
export let HERITAGE_TOURISM_POSITION: HeritageTourismPosition = {
  sitesOnRegister: 0,
  gradeICount: 0,
  atRiskOrEncroached: 0,
  underRestoration: 0,
  annualFootfallTotal: 0,
  revenueCollectedLakhTotal: 0,
}

interface SiteSpec {
  name: string
  category: HeritageSiteCategory
  grade: HeritageGrade
  authority: HeritageManagingAuthority
  hasFootfall: boolean
}

function build$BMC_SITE_SPECS(): SiteSpec[] {
  return [
    { name: t('Veermata Jijabai Bhonsle Udyan (Rani Bagh) & Zoo'), category: 'zoo', grade: 'grade-iia', authority: 'corporation', hasFootfall: true },
    { name: t('Dr. Bhau Daji Lad Museum'), category: 'museum', grade: 'grade-i', authority: 'corporation', hasFootfall: true },
    { name: t('Hanging Gardens (Pherozeshah Mehta Gardens)'), category: 'viewpoint-garden', grade: 'ungraded', authority: 'corporation', hasFootfall: true },
    { name: t('Kamala Nehru Park'), category: 'viewpoint-garden', grade: 'ungraded', authority: 'corporation', hasFootfall: true },
    { name: t('Marine Drive Promenade'), category: 'promenade-beach', grade: 'grade-i', authority: 'corporation', hasFootfall: false },
    { name: t('Girgaon Chowpatty'), category: 'promenade-beach', grade: 'ungraded', authority: 'corporation', hasFootfall: false },
    { name: t('Mahim Nature Park'), category: 'nature-park', grade: 'ungraded', authority: 'trust-private', hasFootfall: true },
    { name: t('Kala Ghoda Heritage Precinct'), category: 'heritage-precinct', grade: 'grade-i', authority: 'corporation', hasFootfall: false },
    { name: t('Fort Heritage Precinct'), category: 'heritage-precinct', grade: 'grade-i', authority: 'corporation', hasFootfall: false },
  ]
}

function build$GENERIC_SITE_SPECS(): SiteSpec[] {
  return [
    { name: t('Central Museum'), category: 'museum', grade: 'grade-iia', authority: 'corporation', hasFootfall: true },
    { name: t('Old Town Heritage Precinct'), category: 'heritage-precinct', grade: 'grade-i', authority: 'state', hasFootfall: false },
    { name: t('Municipal Zoological Garden'), category: 'zoo', grade: 'ungraded', authority: 'corporation', hasFootfall: true },
    { name: t('Riverside Promenade'), category: 'promenade-beach', grade: 'ungraded', authority: 'corporation', hasFootfall: false },
    { name: t('Heritage Clock Tower'), category: 'heritage-structure', grade: 'grade-iia', authority: 'corporation', hasFootfall: false },
    { name: t('Central Nature Park'), category: 'nature-park', grade: 'ungraded', authority: 'corporation', hasFootfall: true },
  ]
}
let BMC_SITE_SPECS: SiteSpec[] = build$BMC_SITE_SPECS()
let GENERIC_SITE_SPECS: SiteSpec[] = build$GENERIC_SITE_SPECS()
registerLayer(() => {
  BMC_SITE_SPECS = build$BMC_SITE_SPECS()
  GENERIC_SITE_SPECS = build$GENERIC_SITE_SPECS()
})

registerLayer(() => {
  const scale = CITY_SCALE
  const isBmc = activeCorporation.id === 'bmc'
  const specs = isBmc ? BMC_SITE_SPECS : GENERIC_SITE_SPECS
  // Fort/Kala Ghoda's real ward is the island city core; every other named
  // site draws deterministically from the ward roster so at least one
  // plausible ward is attached without asserting a specific, unverified one.

  HERITAGE_SITES = specs.map((spec, i) => {
    const r = det(`heritage:${i}`)
    const ward = r.pick(WARDS)
    const condition = r.round(30, 96, 0)
    const conservation: ConservationStatus = condition >= 78 ? 'well-maintained'
      : condition >= 60 ? 'requires-repair'
      : r.chance(0.5) ? 'under-restoration'
      : condition >= 40 ? 'at-risk' : 'encroached'

    return {
      id: `her-${String(i + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      name: spec.name,
      wardId: ward.id,
      category: spec.category,
      centroid: { lat: ward.centroid.lat + r.float(-0.01, 0.01), lng: ward.centroid.lng + r.float(-0.01, 0.01) },
      heritageGrade: spec.grade,
      managingAuthority: spec.authority,
      conservationStatus: conservation,
      annualFootfall: spec.hasFootfall ? scaledCount(r.int(180000, 2600000), scale.population, 8000) : undefined,
      entryFeeRupees: spec.hasFootfall ? r.pick([0, 10, 25, 50]) : undefined,
      revenueCollectedLakh: spec.hasFootfall && spec.authority === 'corporation'
        ? scaled(r.int(40, 620), scale.budget, 1) : undefined,
      openToPublic: conservation !== 'encroached',
      accessibleEntrance: r.chance(0.42),
      lastInspectedAt: isoDaysFromAnchor(-r.int(10, 420)),
      state: stateFrom(condition),
    }
  })

  const atRisk = HERITAGE_SITES.filter((s) => s.conservationStatus === 'at-risk' || s.conservationStatus === 'encroached')
  HERITAGE_TOURISM_POSITION = {
    sitesOnRegister: HERITAGE_SITES.length,
    gradeICount: HERITAGE_SITES.filter((s) => s.heritageGrade === 'grade-i').length,
    atRiskOrEncroached: atRisk.length,
    underRestoration: HERITAGE_SITES.filter((s) => s.conservationStatus === 'under-restoration').length,
    annualFootfallTotal: HERITAGE_SITES.reduce((s, x) => s + (x.annualFootfall ?? 0), 0),
    revenueCollectedLakhTotal: Math.round(HERITAGE_SITES.reduce((s, x) => s + (x.revenueCollectedLakh ?? 0), 0) * 10) / 10,
  }
})
