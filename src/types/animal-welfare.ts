import type { IsoDateTime, OperationalState, TenantId } from './common'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * src/types/animal-welfare.ts
 *
 * Cattle pounds and the prevention of cruelty to animals - function 15 of the
 * Twelfth Schedule, and one of the oldest duties a municipal corporation
 * carries.
 *
 * THE SHAPE OF THIS DOMAIN IS AN ARGUMENT ABOUT WHAT COUNTS AS A RESULT. The
 * Animal Birth Control (Dogs) Rules make sterilisation - not removal, not
 * relocation, not destruction - the lawful method of controlling the
 * free-roaming dog population. That settles the method, and it means the
 * sterilisation rate is an INPUT: it is what the corporation does. The DOG BITE
 * RATE is the OUTCOME: it is what a resident walking to a bus stop at six in
 * the morning actually experiences. A corporation that reports sterilisation
 * numbers without bite rates is reporting activity, not results, and this
 * module's types are deliberately built so that the two are held side by side
 * and neither can be published without the other.
 *
 * `AnimalWelfareUnit` is therefore the estate - what the corporation operates
 * and what throughput it achieves - while `WardAnimalSignal` is the outcome the
 * ward records against it. Cattle pounds sit in the same estate because they
 * are the same statutory function, though the public interest in them is as
 * much about nuisance and traffic safety as about the animal: cattle loose on a
 * carriageway are a road-accident cause before they are a welfare case.
 *
 * Figures are modelled demonstration data, as everywhere else in this platform.
 * No live departmental or veterinary system is contacted.
 */

/* ==========================================================================
   Vocabulary
   ========================================================================== */

/**
 * The kinds of unit a corporation operates under this function. Kept as a
 * closed union because the statutory basis for each differs - an Animal Birth
 * Control centre operates under the ABC (Dogs) Rules, a cattle pound under the
 * corporation's own nuisance and impounding powers.
 */
export type AnimalWelfareUnitKind =
  | 'sterilisation-centre'
  | 'cattle-pound'
  | 'veterinary-hospital'
  | 'animal-shelter'
  | 'rabies-clinic'

function build$ANIMAL_WELFARE_UNIT_KIND_LABEL(): Record<AnimalWelfareUnitKind, string> {
  return {
  'sterilisation-centre': t('Animal Birth Control Centre'),
  'cattle-pound': t('Cattle Pound'),
  'veterinary-hospital': t('Veterinary Hospital'),
  'animal-shelter': t('Animal Shelter'),
  'rabies-clinic': t('Anti-Rabies Clinic'),
}
}
export let ANIMAL_WELFARE_UNIT_KIND_LABEL: Record<AnimalWelfareUnitKind, string> = build$ANIMAL_WELFARE_UNIT_KIND_LABEL()
registerLayer(() => {
  ANIMAL_WELFARE_UNIT_KIND_LABEL = build$ANIMAL_WELFARE_UNIT_KIND_LABEL()
})

/**
 * Who runs the unit. Most Animal Birth Control capacity in Maharashtra is
 * delivered by recognised NGO partners under contract rather than by
 * corporation establishment, which is lawful and usually sensible - but it does
 * mean the corporation's own inspection record is the only assurance it holds,
 * so `lastInspectedAt` is not an administrative field here, it is the control.
 */
export type AnimalWelfareOperator = 'corporation' | 'ngo-partner'

function build$ANIMAL_WELFARE_OPERATOR_LABEL(): Record<AnimalWelfareOperator, string> {
  return {
  corporation: t('Corporation'),
  'ngo-partner': t('NGO Partner'),
}
}
export let ANIMAL_WELFARE_OPERATOR_LABEL: Record<AnimalWelfareOperator, string> = build$ANIMAL_WELFARE_OPERATOR_LABEL()
registerLayer(() => {
  ANIMAL_WELFARE_OPERATOR_LABEL = build$ANIMAL_WELFARE_OPERATOR_LABEL()
})

/* ==========================================================================
   The estate - what the corporation operates
   ========================================================================== */

export interface AnimalWelfareUnit {
  id: string
  tenantId: TenantId
  name: string
  wardId: string
  kind: AnimalWelfareUnitKind
  /** Sanctioned animal holding capacity of the unit. */
  capacity: number
  /**
   * Animals held on the reference date. Exceeding `capacity` is the single
   * most common welfare finding at a shelter or pound, so the figure is held
   * unclamped rather than presented as an occupancy percentage that hides it.
   */
  animalsInCare: number
  /** Sterilisations performed in the last 30 days. The statutory method. */
  sterilisations30d: number
  /** Anti-rabies doses administered in the last 30 days. */
  rabiesVaccinations30d: number
  /** Stray cattle impounded in the last 30 days. Pounds only. */
  cattleImpounded30d: number
  operatedBy: AnimalWelfareOperator
  /** Condition of the unit, on the platform's common operational scale. */
  state: OperationalState
  /** Date of the corporation's last recorded inspection of the unit. */
  lastInspectedAt: IsoDateTime
}

/* ==========================================================================
   The outcome - what the ward records
   ========================================================================== */

/**
 * The result side of the function, held per ward. `sterilisedPct` is the input
 * the corporation controls; `bitesPer10kPopulation` is the outcome residents
 * feel. Publishing the first without the second is the failure mode this type
 * exists to prevent.
 */
export interface WardAnimalSignal {
  wardId: string
  tenantId: TenantId
  /** Modelled free-roaming dog population in the ward. */
  estimatedStrayPopulation: number
  /** Share of the estimated stray population sterilised and ear-notched. */
  sterilisedPct: number
  /** Dog bite cases reported at municipal facilities in the last 30 days. */
  dogBites30d: number
  /** The comparable figure - bites per 10,000 residents over the same period. */
  bitesPer10kPopulation: number
}

/* ==========================================================================
   Movement over time
   ========================================================================== */

/**
 * Monthly city totals. The inverse relationship between the two headline series
 * - sterilisations rising, bites falling - is the whole case for the programme,
 * and it is only visible over months, never in a single reporting period.
 */
export interface AnimalWelfareTrendPoint {
  month: string
  sterilisations: number
  vaccinations: number
  dogBites: number
}
