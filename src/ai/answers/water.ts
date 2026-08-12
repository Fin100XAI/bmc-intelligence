import type { QueryIntentId } from '@/ai/nlu'
import type { AnswerContext, AnswerHandler, ComposedAnswer } from '@/ai/answer-kit'
import {
  VISUAL_COLOUR,
  anyInScope,
  bestEvidence,
  compositionVisual,
  deniedAnswer,
  emptyAnswer,
  fullWard,
  inScope,
  metricsVisual,
  rankedBarVisual,
  recommend,
  scopeSentence,
  shortWard,
  sourcesOf,
  standardLimitations,
  toneFor,
} from '@/ai/answer-kit'
import {
  PUMPING_STATIONS,
  RAINFALL_OBSERVATIONS,
  RESERVOIRS,
  SEWERAGE_NODES,
  STORM_DRAINS,
  TIDE_WINDOWS,
  WARD_MONSOON_READINESS,
  WATERLOGGING_SPOTS,
  WATER_ASSETS,
  WATER_ZONES,
  READINESS_BY_WARD,
  wardDrainageRisk,
} from '@/data/city.data'
import { COASTAL_SEGMENTS } from '@/data/social.data'
import { TREATMENT_COMPLIANCE_NORM } from '@/services/sewerage.service'
import { activeCorporation, hasCoastalJurisdiction } from '@/config/municipality.config'
import { canAccess } from '@/security/access'
import type { IntelligenceDomain } from '@/types/common'
import type { AIVisual } from '@/types/ai'
import type { CoastalSegment, SewerageNode, WaterloggingSpot } from '@/types/city-domains'
import { DEMO_NOW } from '@/utils/deterministic'
import {
  formatCompact,
  formatDelta,
  formatNumber,
  formatPercent,
  formatRelative,
  titleCase,
  truncate,
} from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/ai/answers/water.ts
 *
 * The six water-group retrieval routes: monsoon preparedness, waterlogging,
 * storm water drainage, water supply, sewerage and coastal frontage.
 *
 * Two disciplines govern everything in this file.
 *
 * The first is that **a simulation is not a forecast**. Several registers here
 * carry modelled figures - the current risk on a chronic waterlogging location,
 * the inundation exposure on a coastal segment - and every one of them is the
 * output of a declared rule model run over stated inputs. None is a
 * meteorological product, none carries a probability, and none is presented
 * with a date attached. Relatedly, readiness describes *preparedness*, not
 * outcome: a well-prepared ward can still flood under a sufficiently extreme
 * coincidence of rainfall and tide, and the answers say so.
 *
 * The second is that scope is enforced before anything is read. Ward-shaped
 * registers are filtered through `inScope`; zone-shaped registers - water
 * zones and coastal segments span several wards - through `anyInScope`. The
 * operational domain is a separate gate in the access model (a principal may
 * hold a ward but not the sewerage domain), so each route asks the permission
 * engine for its own domain before it retrieves anything, exactly as the
 * corresponding service does.
 */

/* ==========================================================================
   Published thresholds
   ========================================================================== */

/** Departmental monsoon readiness threshold, below which a ward is surfaced. */
const READINESS_FLOOR = 70
/** Operational threshold on the pump readiness index. */
const PUMP_READINESS_FLOOR = 80
/** Pre-monsoon desilting target for every maintained reach. */
const DESILTING_TARGET = 100
/** Non-revenue water above this percentage is flagged by the zonal register. */
const NRW_THRESHOLD = 34
/** Tail-end pressure service standard, metres head. */
const PRESSURE_STANDARD_M = 9
/** Potability compliance target across zonal sampling. */
const POTABILITY_TARGET = 92
/** Condition index below which an asset or node is treated as poor. */
const CONDITION_FLOOR = 50
/** Overflow events in 30 days at or above which a pattern reads as structural. */
const OVERFLOW_CLUSTER_THRESHOLD = 6
/** Tide height, in metres, at which gravity discharge through outfalls stops. */
const DISCHARGE_BLOCK_TIDE_M = 4.2
/** A coastal survey older than this many days no longer carries full weight. */
const SURVEY_CURRENCY_DAYS = 730

/**
 * The published composition of the ward readiness score, mirroring the weights
 * applied where `WARD_MONSOON_READINESS` is built in `@/data/city.data`. Named
 * in the answer so the operator can see what the number is made of rather than
 * being asked to trust it.
 */
const READINESS_WEIGHTS = 'pre-monsoon desilting completion (34%), pump readiness (28%), '
  + 'chronic-location mitigation (20%), response team allocation (10%) and deployed dewatering capacity (8%)'

/**
 * The published composition of a drain's blockage risk, mirroring the driver
 * weights applied where `STORM_DRAINS` is built in `@/data/city.data`.
 */
const BLOCKAGE_WEIGHTS = 'desilting shortfall (38%), recorded encroachment reports (22%), '
  + 'design discharge capacity against the reach catchment (22%) and ward flood exposure (18%)'

/* ==========================================================================
   Local helpers
   ========================================================================== */

/** Stable, scope-dependent suffix for the request log. */
function scopeKey(ctx: AnswerContext): string {
  if (ctx.narrowed) return ctx.scopeWards.map((w) => w.id).join('+')
  return `s${ctx.scopeWards.length}`
}

/**
 * The operational domain gate.
 *
 * Ward scope alone is not authority to read a domain: the access model carries
 * a separate domain dimension, and a principal holding every ward may still be
 * outside sewerage or coastal. Returns the refusal to hand straight back, or
 * `null` where retrieval may proceed.
 */
function domainRefusal(ctx: AnswerContext, domain: IntelligenceDomain, subject: string): ComposedAnswer | null {
  const decision = canAccess(ctx.user, 'ward', 'view', { domain })
  if (decision.allowed) return null
  return deniedAnswer(ctx, subject, decision.reason)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function total(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

/** Share of `part` in `whole`, guarded against an empty denominator. */
function share(part: number, whole: number): number {
  if (whole <= 0) return 0
  return (part / whole) * 100
}

/** Result rows the operator asked for, clamped to what a reading can carry. */
function take(ctx: AnswerContext, fallback: number, ceiling: number): number {
  return Math.max(1, Math.min(ctx.limit > 0 ? ctx.limit : fallback, ceiling))
}

/** Chart axis label - long register names do not survive a bar chart. */
function chartLabel(name: string): string {
  return truncate(name, 26)
}

/** Ward labels for a record that spans several wards, scope-limited. */
function scopedWardLabels(ctx: AnswerContext, wardIds: string[]): string {
  const inside = wardIds.filter((id) => inScope(ctx, id))
  if (inside.length === 0) return '-'
  return inside.map((id) => shortWard(id)).join(', ')
}

/** Days between the demonstration anchor and a recorded instant. */
function daysSince(iso: string): number {
  const parsed = new Date(iso).getTime()
  if (!Number.isFinite(parsed)) return 0
  return Math.round((DEMO_NOW.getTime() - parsed) / 86_400_000)
}

/* ==========================================================================
   Monsoon preparedness
   ========================================================================== */

function answerMonsoonReadiness(ctx: AnswerContext): ComposedAnswer {
  const refused = domainRefusal(ctx, 'monsoon', 'ward monsoon preparedness returns')
  if (refused) return refused

  const readiness = WARD_MONSOON_READINESS.filter((r) => inScope(ctx, r.wardId))
    .slice()
    .sort((a, b) => a.readinessScore - b.readinessScore)

  if (readiness.length === 0) {
    return emptyAnswer(
      ctx,
      'ward monsoon readiness',
      `${scopeSentence(ctx)} Preparedness returns are compiled per ward from the storm water drain register, `
        + 'pumping station telemetry and the chronic waterlogging location register.',
    )
  }

  const drains = STORM_DRAINS.filter((d) => inScope(ctx, d.wardId))
  const pumps = PUMPING_STATIONS.filter((p) => inScope(ctx, p.wardId))
  const spots = WATERLOGGING_SPOTS.filter((s) => inScope(ctx, s.wardId))
  const rain = RAINFALL_OBSERVATIONS.filter((o) => inScope(ctx, o.wardId))
  const blockedWindows = TIDE_WINDOWS.filter((tideWindow) => tideWindow.blocksDischarge)

  const meanReadiness = mean(readiness.map((r) => r.readinessScore))
  const belowFloor = readiness.filter((r) => r.readinessScore < READINESS_FLOOR)
  const meanDesilting = mean(readiness.map((r) => r.desiltingPct))
  const drainsShort = drains.filter((d) => d.desiltingCompletionPct < DESILTING_TARGET)
  const pumpsOperational = total(pumps.map((p) => p.pumpsOperational))
  const pumpsInstalled = total(pumps.map((p) => p.pumpsTotal))
  const withoutStandby = pumps.filter((p) => !p.standbyPowerAvailable)
  const chronicTotal = total(readiness.map((r) => r.floodSpots))
  const chronicMitigated = total(readiness.map((r) => r.spotsMitigated))
  const criticalUnmitigated = spots.filter((s) => s.criticalRoute && s.mitigationStatus !== 'completed')
  const teams = total(readiness.map((r) => r.teamsAllocated))
  const dewatering = total(readiness.map((r) => r.dewateringPumps))
  const floodProneResidents = total(ctx.scopeWards.filter((w) => w.floodProne).map((w) => w.population))
  const seasonToDate = mean(rain.map((o) => o.seasonTotalMm))
  const seasonNormal = mean(rain.map((o) => o.seasonNormalMm))
  const weakest = readiness[0]

  // `wardDrainageRisk` returns 0 for a ward with no recorded reach, which would
  // read as "no risk" rather than "no record". The distinction is kept.
  const wardsWithDrains = new Set(drains.map((d) => d.wardId))

  const rows = take(ctx, 8, 12)
  const lines = Math.min(rows, 3)

  const evidence = bestEvidence(ctx.user, {
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['sensor-reading', 'model-output'],
    count: 5,
  })

  const keyFindings = [
    ...readiness.slice(0, lines).map(
      (r) =>
        `${fullWard(r.wardId)} - readiness ${formatNumber(r.readinessScore)}/100, desilting ${formatPercent(r.desiltingPct, 0)}, `
        + `pump readiness ${formatPercent(r.pumpReadiness, 0)}, ${formatNumber(r.floodSpots)} chronic locations of which `
        + `${formatNumber(r.spotsMitigated)} are mitigated, ${formatNumber(r.teamsAllocated)} response teams and `
        + `${formatNumber(r.dewateringPumps)} dewatering pumps allocated.`
        + (r.gaps.length > 0 ? t(' Declared gap: {0}', r.gaps[0]) : ''),
    ),
    `Pre-monsoon desilting averages ${formatPercent(meanDesilting, 1)} completion across the scope, with `
      + `${formatNumber(drainsShort.length)} of ${formatNumber(drains.length)} maintained reaches short of the `
      + `${DESILTING_TARGET}% target and ${formatNumber(drains.filter((d) => d.desiltingCompletionPct < 70).length)} below 70%.`,
    `${formatNumber(pumpsOperational)} of ${formatNumber(pumpsInstalled)} pumps across ${formatNumber(pumps.length)} stations `
      + `are operational (${formatPercent(share(pumpsOperational, pumpsInstalled), 1)}), and `
      + `${formatNumber(withoutStandby.length)} stations record no standby power supply - which removes pumped discharge `
      + 'entirely during a supply interruption.',
    `${formatNumber(chronicTotal)} chronic waterlogging locations are recorded in scope, ${formatNumber(chronicMitigated)} with `
      + `completed mitigation (${formatPercent(share(chronicMitigated, chronicTotal), 1)}); `
      + `${formatNumber(criticalUnmitigated.length)} unmitigated locations sit on a designated critical route.`,
    `${formatNumber(teams)} response teams and ${formatNumber(dewatering)} dewatering pumps are allocated across the scope, `
      + `covering ${formatCompact(floodProneResidents)} residents in wards classified flood-prone.`,
    `Season-to-date rainfall averages ${formatNumber(seasonToDate)} mm against a divisional normal of `
      + `${formatNumber(seasonNormal)} mm (${formatDelta(seasonToDate - seasonNormal, ' mm', 0)}); `
      + `${formatNumber(blockedWindows.length)} of the ${formatNumber(TIDE_WINDOWS.length)} published discharge windows stand at `
      + `or above the ${DISCHARGE_BLOCK_TIDE_M} m level at which gravity discharge through outfalls is obstructed. Both are `
      + 'recorded observations, not a prediction of the season ahead.',
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'monsoon-headline',
      [
        {
          label: t('Mean readiness'),
          value: `${formatNumber(meanReadiness, 1)}/100`,
          support: `${formatNumber(readiness.length)} wards in scope`,
          tone: toneFor(meanReadiness, true),
        },
        {
          label: t('Below {0}', READINESS_FLOOR),
          value: formatNumber(belowFloor.length),
          support: 'wards under the departmental threshold',
          tone: belowFloor.length > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Mean desilting'),
          value: formatPercent(meanDesilting, 1),
          support: `against a ${DESILTING_TARGET}% target`,
          tone: toneFor(meanDesilting, true),
        },
        {
          label: t('Pump availability'),
          value: formatPercent(share(pumpsOperational, pumpsInstalled), 1),
          support: `${formatNumber(pumpsOperational)} of ${formatNumber(pumpsInstalled)} pumps operational`,
          tone: toneFor(share(pumpsOperational, pumpsInstalled), true),
        },
        {
          label: t('Unmitigated locations'),
          value: formatNumber(chronicTotal - chronicMitigated),
          support: `${formatNumber(criticalUnmitigated.length)} on a critical route`,
          tone: criticalUnmitigated.length > 0 ? 'critical' : 'default',
        },
      ],
      'Monsoon preparedness across the wards this answer covers.',
    ),
    rankedBarVisual({
      id: 'monsoon-readiness-by-ward',
      caption: t('Ward monsoon readiness - lowest first'),
      unit: '/100',
      higherIsBetter: true,
      data: readiness.slice(0, rows).map((r) => ({ label: shortWard(r.wardId), value: r.readinessScore })),
    }),
  ]

  const recommendedActions = [
    recommend({
      id: 'rec-monsoon-desilting',
      title: t('Close the outstanding pre-monsoon works in {0}', fullWard(weakest.wardId)),
      why:
        weakest.gaps[0]
        ?? t('Readiness of {0}/100 sits below the {1}-point departmental threshold.', formatNumber(weakest.readinessScore), READINESS_FLOOR),
      expectedImpact:
        'Completing desilting recovers assessed discharge capacity on the affected reaches, and restoring pump availability '
        + 'restores the only discharge mechanism that remains once gravity flow through the outfalls is obstructed.',
      departmentId: 'dept-stormwater',
      humanOwnerRole: t('Executive Engineer (SWD)'),
      confidence: 'high',
      dependencies: [t('Contractor mobilisation'), t('Traffic clearance for machinery access'), t('Muck disposal site availability')],
      risks: [
        t('Rain during the works reduces achievable progress and can reverse partially completed desilting'),
        t('Completion of works raises readiness; it does not guarantee that the ward will not flood'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    recommend({
      id: 'rec-monsoon-prepositioning',
      title: t('Pre-position dewatering capacity and response teams across the {0} wards below threshold', formatNumber(belowFloor.length)),
      why:
        `${formatNumber(belowFloor.length)} wards record readiness below ${READINESS_FLOOR}/100 while `
        + `${formatNumber(criticalUnmitigated.length)} unmitigated chronic locations sit on designated critical routes, `
        + 'where inundation interrupts emergency travel rather than only local movement.',
      expectedImpact:
        'Shortens the interval between an event beginning and dewatering starting, which is the variable that governs '
        + 'clearance time once a location has already accumulated water.',
      departmentId: 'dept-disaster',
      humanOwnerRole: t('Disaster Management Officer'),
      confidence: 'medium',
      dependencies: [t('Ward-level equipment availability'), t('Standby power at the receiving pumping stations')],
      risks: [
        t('Pre-positioning commits equipment to a specific geography and reduces flexibility elsewhere'),
        t('Allocation is planned against recorded exposure, not against any prediction of where rainfall will fall'),
      ],
      evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
    }),
  ]

  return {
    requestId: `q-monsoon-readiness-${ctx.user.id}-${scopeKey(ctx)}`,
    answer:
      `Mean monsoon readiness across the ${formatNumber(readiness.length)} wards in scope is `
      + `${formatNumber(meanReadiness, 1)}/100, and ${formatNumber(belowFloor.length)} wards sit below the `
      + `${READINESS_FLOOR}-point departmental threshold. Readiness is a published weighted composite of `
      + `${READINESS_WEIGHTS}, so a ward can fall short on completed works, on standing capacity, or on both, and the ward `
      + `rows below separate the two. ${scopeSentence(ctx)} Readiness describes preparedness and not outcome: a `
      + 'well-prepared ward can still flood under a sufficiently extreme coincidence of rainfall and tide, and the scenario '
      + 'outputs elsewhere in the platform are simulations produced by a declared rule model rather than forecasts.',
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Readiness describes preparedness, not outcome. A well-prepared ward can still flood under a sufficiently extreme '
        + 'coincidence of rainfall and tide, and a high score is not an assurance against inundation.',
      'Desilting completion is a works-progress return, not a measurement of realised discharge capacity. The two diverge '
        + 'where a reach silts again between completion and the first heavy rainfall.',
      'Rainfall and tide figures here are recorded observations. No forecast, probability or meteorological product is '
        + 'produced anywhere in this platform.',
    ],
    sources: sourcesOf(
      evidence,
      'Pre-Monsoon Preparedness Register (simulated)',
      'Storm Water Drain Register (simulated)',
      'SWD Pumping Telemetry (simulated)',
    ),
    domains: ['monsoon', 'stormwater'],
    supportingTable: {
      caption: t('Ward monsoon readiness - lowest first'),
      columns: [
        t('Ward'),
        t('Readiness'),
        t('Desilting'),
        t('Pump readiness'),
        t('Chronic locations'),
        t('Mitigated'),
        t('Response teams'),
        t('Drainage risk'),
      ],
      rows: readiness.slice(0, rows).map((r) => [
        fullWard(r.wardId),
        `${formatNumber(r.readinessScore)}/100`,
        formatPercent(r.desiltingPct, 0),
        formatPercent(r.pumpReadiness, 0),
        formatNumber(r.floodSpots),
        formatNumber(r.spotsMitigated),
        formatNumber(r.teamsAllocated),
        wardsWithDrains.has(r.wardId) ? `${formatNumber(wardDrainageRisk(r.wardId))}/100` : t('No reach recorded'),
      ]),
    },
    visuals,
    followUps: [
      t('Where is waterlogging risk concentrated?'),
      t('What is the state of the storm water drainage network?'),
      t('What is the disaster management readiness position?'),
    ],
  }
}

/* ==========================================================================
   Waterlogging and flood exposure
   ========================================================================== */

function answerWaterlogging(ctx: AnswerContext): ComposedAnswer {
  const refused = domainRefusal(ctx, 'monsoon', 'chronic waterlogging location records')
  if (refused) return refused

  const spots = WATERLOGGING_SPOTS.filter((s) => inScope(ctx, s.wardId))
    .slice()
    .sort((a, b) => b.currentRisk - a.currentRisk)

  if (spots.length === 0) {
    return emptyAnswer(
      ctx,
      'chronic waterlogging location',
      `${scopeSentence(ctx)} Chronic locations are recorded against a ward only where repeat inundation has been observed `
        + 'and surveyed, so an empty register means no such location has been recorded rather than that none can occur.',
    )
  }

  const unmitigated = spots.filter((s) => s.mitigationStatus !== 'completed')
  const criticalUnmitigated = unmitigated.filter((s) => s.criticalRoute)
  const byStatus: Array<{ id: WaterloggingSpot['mitigationStatus']; label: string; colour: string }> = [
    { id: 'completed', label: t('Mitigation completed'), colour: VISUAL_COLOUR.ok },
    { id: 'in-progress', label: t('Mitigation in progress'), colour: VISUAL_COLOUR.govt },
    { id: 'planned', label: t('Mitigation planned'), colour: VISUAL_COLOUR.warn },
    { id: 'not-started', label: t('Not started'), colour: VISUAL_COLOUR.crit },
  ]

  const meanChronic = mean(spots.map((s) => s.chronicIndex))
  const meanRisk = mean(spots.map((s) => s.currentRisk))
  const meanClearance = mean(spots.map((s) => s.averageClearanceMinutes))
  const eventsThisSeason = total(spots.map((s) => s.eventsThisSeason))
  const slowest = spots.slice().sort((a, b) => b.averageClearanceMinutes - a.averageClearanceMinutes)[0]

  const counts = new Map<string, number>()
  for (const spot of spots) counts.set(spot.wardId, (counts.get(spot.wardId) ?? 0) + 1)
  const concentrated = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
  const concentratedReadiness = concentrated ? READINESS_BY_WARD.get(concentrated[0]) : undefined

  const rows = take(ctx, 8, 12)
  const lines = Math.min(rows, 4)

  const evidence = bestEvidence(ctx.user, {
    term: 'Waterlogging risk model',
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['model-output', 'sensor-reading'],
    count: 5,
  })

  const priority = unmitigated.slice().sort((a, b) => b.chronicIndex - a.chronicIndex)[0] ?? spots[0]

  const keyFindings = [
    ...spots.slice(0, lines).map(
      (s) =>
        `${s.name} (${shortWard(s.wardId)}) - chronic index ${formatNumber(s.chronicIndex)}/100, modelled current risk `
        + `${formatNumber(s.currentRisk)}/100, ${formatNumber(s.eventsThisSeason)} events this season, mean clearance `
        + `${formatNumber(s.averageClearanceMinutes)} minutes, mitigation ${s.mitigationStatus.replace('-', ' ')}`
        + `${s.criticalRoute ? t(', on a designated critical route {0} km from the nearest hospital', formatNumber(s.nearestHospitalKm, 1)) : ''}.`,
    ),
    concentrated
      ? `Chronic locations concentrate in ${fullWard(concentrated[0])}: ${formatNumber(concentrated[1])} of the `
        + `${formatNumber(spots.length)} recorded locations in scope (${formatPercent(share(concentrated[1], spots.length), 1)})`
        + `${concentratedReadiness ? t(', against a ward monsoon readiness of {0}/100', formatNumber(concentratedReadiness.readinessScore)) : ''}.`
      : t('{0} chronic locations are recorded in scope.', formatNumber(spots.length)),
    `Mitigation status across the register: ${byStatus
      .map((b) => `${formatNumber(spots.filter((s) => s.mitigationStatus === b.id).length)} ${b.id.replace('-', ' ')}`)
      .join(', ')} - leaving ${formatNumber(unmitigated.length)} locations `
      + `(${formatPercent(share(unmitigated.length, spots.length), 1)}) without completed works.`,
    `${formatNumber(criticalUnmitigated.length)} unmitigated locations sit on a designated critical route, with a mean `
      + `clearance of ${formatNumber(mean(criticalUnmitigated.map((s) => s.averageClearanceMinutes)))} minutes and a mean `
      + `distance of ${formatNumber(mean(criticalUnmitigated.map((s) => s.nearestHospitalKm)), 1)} km to the nearest hospital. `
      + 'Route access, not depth, is what determines whether an inundated location interrupts emergency travel.',
    `Mean chronic index across the scope is ${formatNumber(meanChronic, 1)}/100 against a mean modelled current risk of `
      + `${formatNumber(meanRisk, 1)}/100; ${formatNumber(eventsThisSeason)} inundation events have been recorded this season `
      + `across the register${slowest ? t(', and the slowest recorded clearance is {0} minutes at {1}', formatNumber(slowest.averageClearanceMinutes), slowest.name) : ''}.`,
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'waterlogging-headline',
      [
        {
          label: t('Chronic locations'),
          value: formatNumber(spots.length),
          support: `${formatNumber(unmitigated.length)} without completed mitigation`,
          tone: unmitigated.length > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Mean chronic index'),
          value: `${formatNumber(meanChronic, 1)}/100`,
          support: 'recorded vulnerability, from event history',
          tone: toneFor(meanChronic, false),
        },
        {
          label: t('On critical routes'),
          value: formatNumber(criticalUnmitigated.length),
          support: 'unmitigated, emergency access affected',
          tone: criticalUnmitigated.length > 0 ? 'critical' : 'positive',
        },
        {
          label: t('Mean clearance'),
          value: `${formatNumber(meanClearance)} min`,
          support: `${formatNumber(eventsThisSeason)} events recorded this season`,
        },
      ],
      'Chronic waterlogging exposure across the wards this answer covers.',
    ),
    compositionVisual({
      id: 'waterlogging-mitigation',
      caption: t('Chronic locations by mitigation status'),
      segments: byStatus.map((b) => ({
        id: b.id,
        label: b.label,
        value: spots.filter((s) => s.mitigationStatus === b.id).length,
        colour: b.colour,
      })),
    }),
    rankedBarVisual({
      id: 'waterlogging-current-risk',
      caption: t('Modelled current risk by location - highest first (simulation, not a forecast)'),
      unit: '/100',
      higherIsBetter: false,
      data: spots.slice(0, rows).map((s) => ({ label: chartLabel(s.name), value: s.currentRisk })),
    }),
  ]

  const recommendedActions = [
    recommend({
      id: 'rec-waterlogging-mitigation',
      title: t('Advance mitigation works at {0} in {1}', priority.name, fullWard(priority.wardId)),
      why:
        `The location carries a chronic index of ${formatNumber(priority.chronicIndex)}/100 with `
        + `${formatNumber(priority.eventsThisSeason)} events recorded this season and mitigation currently `
        + `${priority.mitigationStatus.replace('-', ' ')}`
        + `${priority.criticalRoute ? t(', on a route designated critical for emergency access') : ''}.`,
      expectedImpact:
        'Completed mitigation at a chronic location historically reduces its modelled risk by the mitigation relief applied '
        + 'in the register, and shortens the clearance interval that governs how long the location stays impassable.',
      departmentId: 'dept-stormwater',
      humanOwnerRole: t('Executive Engineer (SWD)'),
      confidence: 'high',
      dependencies: [t('Works sanction and contractor mobilisation'), t('Utility diversion clearances'), t('Non-monsoon working window')],
      risks: [
        t('Mitigation at one location can transfer accumulation downstream unless the receiving reach is assessed with it'),
        t('The chronic index reflects recorded history; a location with fewer recorded events is not necessarily safer'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    recommend({
      id: 'rec-waterlogging-clearance',
      title: t('Pre-position dewatering at the slowest-clearing critical-route locations'),
      why:
        `Mean clearance across unmitigated critical-route locations stands at `
        + `${formatNumber(mean(criticalUnmitigated.map((s) => s.averageClearanceMinutes)))} minutes, during which the route is `
        + 'unavailable for emergency movement regardless of the depth reached.',
      expectedImpact:
        'Reduces the interval between accumulation and clearance without waiting for capital mitigation, which is the only '
        + 'lever available inside the current season.',
      departmentId: 'dept-disaster',
      humanOwnerRole: t('Disaster Management Officer'),
      confidence: 'medium',
      dependencies: [t('Dewatering pump availability'), t('Ward response team rostering')],
      risks: [t('Equipment committed to one location is unavailable at another during a simultaneous event')],
      evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
    }),
  ]

  return {
    requestId: `q-waterlogging-${ctx.user.id}-${scopeKey(ctx)}`,
    answer:
      `${formatNumber(spots.length)} chronic waterlogging locations are recorded within scope, `
      + `${formatNumber(unmitigated.length)} of them without completed mitigation and `
      + `${formatNumber(criticalUnmitigated.length)} of those on a designated critical route. The chronic index against each `
      + 'location is a recorded vulnerability derived from its own inundation history; the current risk figure beside it is a '
      + 'modelled output recalculated by the flood scenario engine from stated inputs - a simulation produced by a declared '
      + `rule model, carrying no probability and not to be read as a forecast. ${scopeSentence(ctx)} Mean recorded clearance `
      + `across the register is ${formatNumber(meanClearance)} minutes, which is the interval that determines how long a `
      + 'location remains impassable once it has accumulated water.',
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'The current risk figure is a simulation produced by a deterministic rule model over stated inputs. It is not a '
        + 'forecast, carries no probability, and must never be represented as a meteorological product.',
      'The chronic index is built from recorded event history. A location that has been observed less often will score lower '
        + 'without necessarily being less exposed, so absence from the top of this list is not an assurance.',
      'Clearance times are recorded means across past events. They describe past response, not the response a future event '
        + 'will receive.',
    ],
    sources: sourcesOf(
      evidence,
      'Chronic Waterlogging Location Register (simulated)',
      'Urban Flood Risk Model (demonstration)',
    ),
    domains: ['monsoon', 'stormwater'],
    supportingTable: {
      caption: t('Chronic waterlogging locations - highest modelled risk first'),
      columns: [
        t('Location'),
        t('Ward'),
        t('Chronic index'),
        t('Modelled risk'),
        t('Events this season'),
        t('Mean clearance'),
        t('Mitigation'),
        t('Critical route'),
      ],
      rows: spots.slice(0, rows).map((s) => [
        s.name,
        shortWard(s.wardId),
        `${formatNumber(s.chronicIndex)}/100`,
        `${formatNumber(s.currentRisk)}/100`,
        formatNumber(s.eventsThisSeason),
        `${formatNumber(s.averageClearanceMinutes)} min`,
        titleCase(s.mitigationStatus),
        s.criticalRoute ? t('Yes - {0} km to hospital', formatNumber(s.nearestHospitalKm, 1)) : t('No'),
      ]),
    },
    visuals,
    followUps: [
      t('How prepared are we for this monsoon?'),
      t('What is the state of the storm water drainage network?'),
      t('Which wards need the most attention?'),
    ],
  }
}

/* ==========================================================================
   Storm water drainage network
   ========================================================================== */

function answerStormwater(ctx: AnswerContext): ComposedAnswer {
  const refused = domainRefusal(ctx, 'stormwater', 'storm water drainage network records')
  if (refused) return refused

  const drains = STORM_DRAINS.filter((d) => inScope(ctx, d.wardId))
    .slice()
    .sort((a, b) => b.blockageRisk - a.blockageRisk)
  const pumps = PUMPING_STATIONS.filter((p) => inScope(ctx, p.wardId))
    .slice()
    .sort((a, b) => a.readinessIndex - b.readinessIndex)

  if (drains.length === 0 && pumps.length === 0) {
    return emptyAnswer(
      ctx,
      'storm water drainage',
      `${scopeSentence(ctx)} Maintained reaches and pumping stations are held against the ward they serve, so a ward with `
        + 'no recorded reach carries no entry in the network register.',
    )
  }

  const meanBlockage = mean(drains.map((d) => d.blockageRisk))
  const meanDesilting = mean(drains.map((d) => d.desiltingCompletionPct))
  const networkKm = total(drains.map((d) => d.lengthKm))
  const capacity = total(drains.map((d) => d.capacityCumecs))
  const shortOfTarget = drains.filter((d) => d.desiltingCompletionPct < DESILTING_TARGET)
  const encroachedReaches = drains.filter((d) => d.encroachmentReports > 0)
  const encroachmentReports = total(drains.map((d) => d.encroachmentReports))
  const pumpsOperational = total(pumps.map((p) => p.pumpsOperational))
  const pumpsInstalled = total(pumps.map((p) => p.pumpsTotal))
  const belowPumpFloor = pumps.filter((p) => p.readinessIndex < PUMP_READINESS_FLOOR)
  const withoutStandby = pumps.filter((p) => !p.standbyPowerAvailable)
  const pumpCapacity = total(pumps.map((p) => p.capacityCumecs))
  const largest = drains.slice().sort((a, b) => b.capacityCumecs - a.capacityCumecs)[0]
  const stalest = drains.slice().sort((a, b) => daysSince(b.lastInspectedAt) - daysSince(a.lastInspectedAt))[0]
  const worst = drains[0]

  const types: Array<{ id: string; label: string; colour: string }> = [
    { id: 'major-nallah', label: t('Major nallah'), colour: VISUAL_COLOUR.govt },
    { id: 'minor-nallah', label: t('Minor nallah'), colour: VISUAL_COLOUR.intel },
    { id: 'closed-drain', label: t('Closed drain'), colour: VISUAL_COLOUR.govtSoft },
    { id: 'culvert', label: t('Culvert'), colour: VISUAL_COLOUR.muted },
  ]

  const rows = take(ctx, 8, 12)
  const lines = Math.min(rows, 3)

  const evidence = bestEvidence(ctx.user, {
    term: 'Pumping station telemetry',
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['sensor-reading', 'model-output'],
    count: 5,
  })

  const keyFindings = [
    ...drains.slice(0, lines).map(
      (d) =>
        `${d.name} - blockage risk ${formatNumber(d.blockageRisk)}/100 across ${formatNumber(d.lengthKm, 1)} km of `
        + `${d.type.replace('-', ' ')}, desilting ${formatPercent(d.desiltingCompletionPct, 0)}, design discharge `
        + `${formatNumber(d.capacityCumecs, 1)} cumecs, ${formatNumber(d.encroachmentReports)} encroachment reports, `
        + `last inspected ${formatRelative(d.lastInspectedAt)}.`,
    ),
    `${formatNumber(shortOfTarget.length)} of ${formatNumber(drains.length)} maintained reaches are short of the `
      + `${DESILTING_TARGET}% pre-monsoon desilting target, and ${formatNumber(drains.filter((d) => d.desiltingCompletionPct < 70).length)} `
      + `sit below 70% completion. Mean completion across the scope is ${formatPercent(meanDesilting, 1)}.`,
    `${formatNumber(encroachedReaches.length)} reaches carry recorded encroachment reports, `
      + `${formatNumber(encroachmentReports)} in aggregate. Encroachment constrains the effective section of a reach `
      + 'independently of how completely it has been desilted, which is why the two are weighted separately.',
    `Aggregate design discharge across the scope is ${formatNumber(capacity, 1)} cumecs over `
      + `${formatNumber(networkKm, 1)} km of maintained network`
      + `${largest ? t(', with the single largest reach being {0} at {1} cumecs', largest.name, formatNumber(largest.capacityCumecs, 1)) : ''}.`,
    `${formatNumber(pumps.length)} pumping stations provide ${formatNumber(pumpCapacity, 1)} cumecs of pumped discharge; `
      + `${formatNumber(pumpsOperational)} of ${formatNumber(pumpsInstalled)} pumps are operational `
      + `(${formatPercent(share(pumpsOperational, pumpsInstalled), 1)}), ${formatNumber(belowPumpFloor.length)} stations sit `
      + `below the ${PUMP_READINESS_FLOOR}-point readiness threshold and ${formatNumber(withoutStandby.length)} have no standby power.`,
    stalest
      ? `The stalest inspection in scope is ${stalest.name}, last inspected ${formatRelative(stalest.lastInspectedAt)} `
        + `(${formatNumber(daysSince(stalest.lastInspectedAt))} days). A blockage risk computed from a stale inspection carries `
        + 'the age of that inspection with it.'
      : t('Mean blockage risk across the scope is {0}/100.', formatNumber(meanBlockage, 1)),
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'stormwater-headline',
      [
        {
          label: t('Maintained network'),
          value: `${formatNumber(networkKm, 1)} km`,
          support: `${formatNumber(drains.length)} reaches in scope`,
        },
        {
          label: t('Mean blockage risk'),
          value: `${formatNumber(meanBlockage, 1)}/100`,
          support: 'weighted composite, higher is worse',
          tone: toneFor(meanBlockage, false),
        },
        {
          label: t('Mean desilting'),
          value: formatPercent(meanDesilting, 1),
          support: `${formatNumber(shortOfTarget.length)} reaches short of target`,
          tone: toneFor(meanDesilting, true),
        },
        {
          label: t('Design discharge'),
          value: `${formatNumber(capacity, 1)} cumecs`,
          support: `plus ${formatNumber(pumpCapacity, 1)} cumecs pumped`,
        },
        {
          label: t('Stations below threshold'),
          value: formatNumber(belowPumpFloor.length),
          support: `${formatNumber(withoutStandby.length)} without standby power`,
          tone: belowPumpFloor.length > 0 ? 'warn' : 'positive',
        },
      ],
      'Drainage network condition across the wards this answer covers.',
    ),
    rankedBarVisual({
      id: 'stormwater-blockage-risk',
      caption: t('Blockage risk by reach - highest first'),
      unit: '/100',
      higherIsBetter: false,
      data: drains.slice(0, rows).map((d) => ({ label: chartLabel(d.name), value: d.blockageRisk })),
    }),
    compositionVisual({
      id: 'stormwater-network-composition',
      caption: t('Maintained network length by reach type (km)'),
      segments: types.map((entry) => ({
        id: entry.id,
        label: entry.label,
        value: Math.round(total(drains.filter((d) => d.type === entry.id).map((d) => d.lengthKm)) * 10) / 10,
        colour: entry.colour,
      })),
    }),
  ]

  const recommendedActions = [
    recommend({
      id: 'rec-stormwater-reach',
      title: worst
        ? t('Re-inspect and programme works on {0}', worst.name)
        : t('Programme a re-inspection cycle across the reaches below desilting target'),
      why: worst
        ? `The reach carries a blockage risk of ${formatNumber(worst.blockageRisk)}/100 with desilting at `
          + `${formatPercent(worst.desiltingCompletionPct, 0)}, ${formatNumber(worst.encroachmentReports)} recorded `
          + `encroachment reports and a design discharge of ${formatNumber(worst.capacityCumecs, 1)} cumecs.`
        : t('{0} reaches remain short of the {1}% target.', formatNumber(shortOfTarget.length), DESILTING_TARGET),
      expectedImpact:
        'The driver breakdown held against each reach separates a condition problem from a capacity or encroachment problem, '
        + 'which determines whether the correct intervention is desilting, enforcement, or a capacity augmentation proposal.',
      departmentId: 'dept-stormwater',
      humanOwnerRole: t('Executive Engineer (SWD)'),
      confidence: 'high',
      dependencies: [t('Survey team availability'), t('Access for desilting machinery'), t('Muck disposal site availability')],
      risks: [
        t('A reach may score high on exposure alone, where no works on the reach itself would change the position'),
        t('Encroachment findings are register entries and are not a determination against any person or occupier'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    recommend({
      id: 'rec-stormwater-pumps',
      title: t('Restore pump availability and standby power at the {0} stations below threshold', formatNumber(belowPumpFloor.length)),
      why:
        `${formatNumber(pumpsInstalled - pumpsOperational)} installed pumps are not operational and `
        + `${formatNumber(withoutStandby.length)} stations carry no standby power. Where gravity discharge through the `
        + 'outfalls is obstructed, pumped discharge is the only remaining mechanism.',
      expectedImpact:
        'Restores the discharge route that is depended upon precisely when gravity flow is unavailable, which is the interval '
        + 'during which accumulation is fastest.',
      departmentId: 'dept-stormwater',
      humanOwnerRole: t('Executive Engineer (SWD)'),
      confidence: 'medium',
      dependencies: [t('Spares and repair contract availability'), t('Generator hire or fixed standby provision')],
      risks: [t('Restoring availability does not increase installed capacity where the station is already capacity-limited')],
      evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
    }),
  ]

  return {
    requestId: `q-stormwater-${ctx.user.id}-${scopeKey(ctx)}`,
    answer:
      `${formatNumber(drains.length)} maintained drainage reaches totalling ${formatNumber(networkKm, 1)} km sit within `
      + `scope, carrying a mean blockage risk of ${formatNumber(meanBlockage, 1)}/100 and mean pre-monsoon desilting of `
      + `${formatPercent(meanDesilting, 1)}. Blockage risk is a published weighted composite of ${BLOCKAGE_WEIGHTS}, so a `
      + 'reach can score high on condition alone or on exposure alone, and the driver breakdown held against each record '
      + `distinguishes the two rather than leaving the reader to infer it. Pumped discharge across ${formatNumber(pumps.length)} `
      + `stations stands at ${formatNumber(pumpsOperational)} of ${formatNumber(pumpsInstalled)} pumps operational, with `
      + `${formatNumber(withoutStandby.length)} stations carrying no standby power. ${scopeSentence(ctx)}`,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Blockage risk is a condition and exposure composite computed from the last recorded inspection. Where that inspection '
        + 'is old, the score carries its age, and a reach can silt materially between inspections.',
      'Design discharge capacity is the assessed figure held on the register, not a measured flow. Realised capacity during '
        + 'an event depends on the state of the reach at that moment and on tailwater at the outfall.',
      'Encroachment reports are recorded observations against a reach. They are not a determination about any person, '
        + 'occupier or structure.',
    ],
    sources: sourcesOf(
      evidence,
      'Storm Water Drain Register (simulated)',
      'SWD Pumping Telemetry (simulated)',
      'Field Inspection Register (simulated)',
    ),
    domains: ['stormwater'],
    supportingTable: {
      caption: t('Drainage reaches by blockage risk - highest first'),
      columns: [
        t('Reach'),
        t('Ward'),
        t('Type'),
        t('Length'),
        t('Desilting'),
        t('Blockage risk'),
        t('Design discharge'),
        t('Last inspected'),
      ],
      rows: drains.slice(0, rows).map((d) => [
        d.name,
        shortWard(d.wardId),
        titleCase(d.type),
        `${formatNumber(d.lengthKm, 1)} km`,
        formatPercent(d.desiltingCompletionPct, 0),
        `${formatNumber(d.blockageRisk)}/100`,
        `${formatNumber(d.capacityCumecs, 1)} cumecs`,
        formatRelative(d.lastInspectedAt),
      ]),
    },
    visuals,
    followUps: [
      t('How prepared are we for this monsoon?'),
      t('Where is waterlogging risk concentrated?'),
      t('What is the sewerage treatment compliance position?'),
    ],
  }
}

/* ==========================================================================
   Water supply and distribution
   ========================================================================== */

function answerWaterSupply(ctx: AnswerContext): ComposedAnswer {
  const refused = domainRefusal(ctx, 'water', 'water distribution zone records')
  if (refused) return refused

  const zones = WATER_ZONES.filter((z) => anyInScope(ctx, z.wardIds))
    .slice()
    .sort((a, b) => b.deficitMld - a.deficitMld)

  if (zones.length === 0) {
    return emptyAnswer(
      ctx,
      'water distribution zone',
      `${scopeSentence(ctx)} Distribution zones span several wards, and a zone is read here only where at least one of its `
        + 'wards falls inside your authorised scope.',
    )
  }

  const assets = WATER_ASSETS.filter((a) => inScope(ctx, a.wardId))
  const supply = total(zones.map((z) => z.supplyMld))
  const demand = total(zones.map((z) => z.demandMld))
  const deficit = total(zones.map((z) => z.deficitMld))
  const aboveNrw = zones.filter((z) => z.nrwPct > NRW_THRESHOLD)
  const belowPressure = zones.filter((z) => z.pressureM < PRESSURE_STANDARD_M)
  const belowPotability = zones.filter((z) => z.qualityCompliancePct < POTABILITY_TARGET)
  const tankerTrips = total(zones.map((z) => z.tankerTripsPerDay))
  const interruptions = total(zones.map((z) => z.interruptions30d))
  const complaints = total(zones.map((z) => z.complaints30d))
  const meanHours = mean(zones.map((z) => z.supplyHours))
  const meanNrw = mean(zones.map((z) => z.nrwPct))
  const tankerLed = zones.slice().sort((a, b) => b.tankerTripsPerDay - a.tankerTripsPerDay)[0]
  const poorAssets = assets.filter((a) => a.conditionIndex < CONDITION_FLOOR)
  const stalestAsset = assets
    .slice()
    .sort((a, b) => daysSince(b.lastMaintenanceAt) - daysSince(a.lastMaintenanceAt))[0]
  const meanFill = mean(RESERVOIRS.map((r) => r.fillPct))
  const meanFillLastYear = mean(RESERVOIRS.map((r) => r.lastYearFillPct))
  const largestSource = RESERVOIRS.slice().sort((a, b) => b.usefulStorageMl - a.usefulStorageMl)[0]
  const worst = zones[0]

  const rows = take(ctx, 8, 12)
  const lines = Math.min(rows, 4)

  const evidence = bestEvidence(ctx.user, {
    term: 'Water distribution zone',
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['sensor-reading', 'model-output'],
    count: 5,
  })

  const keyFindings = [
    ...zones.slice(0, lines).map(
      (z) =>
        `${z.name} - supply ${formatNumber(z.supplyMld, 1)} MLD against assessed demand ${formatNumber(z.demandMld, 1)} MLD `
        + `(deficit ${formatNumber(z.deficitMld, 1)} MLD), pressure ${formatNumber(z.pressureM, 1)} m over `
        + `${formatNumber(z.supplyHours, 1)} hours, non-revenue water ${formatPercent(z.nrwPct, 1)}, potability compliance `
        + `${formatPercent(z.qualityCompliancePct, 1)}, ${formatNumber(z.tankerTripsPerDay)} tanker trips per day.`
        + (z.anomalies.length > 0 ? t(' Flagged: {0}', z.anomalies[0]) : ''),
    ),
    `Combined assessed deficit across the ${formatNumber(zones.length)} zones in scope is ${formatNumber(deficit, 1)} MLD, `
      + `${formatPercent(share(deficit, demand), 1)} of assessed demand, against ${formatNumber(supply, 1)} MLD supplied.`,
    `${formatNumber(aboveNrw.length)} zones exceed the ${NRW_THRESHOLD}% non-revenue water threshold (scope mean `
      + `${formatPercent(meanNrw, 1)}), ${formatNumber(belowPressure.length)} record mean pressure below the `
      + `${PRESSURE_STANDARD_M} m service standard, and ${formatNumber(belowPotability.length)} fall short of the `
      + `${POTABILITY_TARGET}% potability compliance target.`,
    `${formatNumber(tankerTrips)} tanker trips per day are recorded across the scope`
      + `${tankerLed ? t(', concentrated in {0} at {1} trips', tankerLed.name, formatNumber(tankerLed.tankerTripsPerDay)) : ''}. `
      + `Mean supply duration is ${formatNumber(meanHours, 1)} hours per day, with ${formatNumber(interruptions)} recorded `
      + `interruptions and ${formatCompact(complaints)} water complaints in the last 30 days.`,
    `${formatNumber(poorAssets.length)} of ${formatNumber(assets.length)} distribution assets in scope record a condition `
      + `index below ${CONDITION_FLOOR}/100`
      + `${stalestAsset ? t(', and the oldest recorded maintenance is {0}, last attended {1}', stalestAsset.name, formatRelative(stalestAsset.lastMaintenanceAt)) : ''}.`,
    `Bulk sources are held at corporation level and are not attributable to a ward: ${formatNumber(RESERVOIRS.length)} `
      + `sources at ${formatPercent(meanFill, 1)} mean fill against ${formatPercent(meanFillLastYear, 1)} at the same point `
      + `last year (${formatDelta(meanFill - meanFillLastYear, ' pp', 1)})`
      + `${largestSource ? t(', the largest being {0} at {1} and {2} days of supply at current draw', largestSource.name, formatPercent(largestSource.fillPct, 1), formatNumber(largestSource.daysOfSupply)) : ''}.`,
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'water-headline',
      [
        {
          label: t('Assessed deficit'),
          value: `${formatNumber(deficit, 1)} MLD`,
          support: `${formatPercent(share(deficit, demand), 1)} of assessed demand`,
          tone: toneFor(share(deficit, demand), false),
        },
        {
          label: t('Zones above NRW threshold'),
          value: `${formatNumber(aboveNrw.length)} of ${formatNumber(zones.length)}`,
          support: `threshold ${NRW_THRESHOLD}%, scope mean ${formatPercent(meanNrw, 1)}`,
          tone: aboveNrw.length > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Below pressure standard'),
          value: formatNumber(belowPressure.length),
          support: `service standard ${PRESSURE_STANDARD_M} m head`,
          tone: belowPressure.length > 0 ? 'critical' : 'positive',
        },
        {
          label: t('Mean supply duration'),
          value: `${formatNumber(meanHours, 1)} h/day`,
          support: `${formatNumber(tankerTrips)} tanker trips per day`,
        },
        {
          label: t('Bulk source fill'),
          value: formatPercent(meanFill, 1),
          support: `${formatDelta(meanFill - meanFillLastYear, ' pp', 1)} against last year`,
          tone: toneFor(meanFill, true),
        },
      ],
      'Distribution position across the zones intersecting this scope.',
    ),
    rankedBarVisual({
      id: 'water-deficit-by-zone',
      caption: t('Assessed supply deficit by zone - highest first'),
      unit: ' MLD',
      higherIsBetter: false,
      data: zones.slice(0, rows).map((z) => ({ label: chartLabel(z.name), value: z.deficitMld })),
    }),
  ]

  const recommendedActions = [
    recommend({
      id: 'rec-water-rebalance',
      title: worst
        ? t('Rebalance the supply schedule for {0} and commission a district metered area survey alongside it', worst.name)
        : t('Rebalance the zonal supply schedule and commission a district metered area survey alongside it'),
      why: worst
        ? `${worst.name} carries a deficit of ${formatNumber(worst.deficitMld, 1)} MLD against assessed demand with `
          + `tail-end pressure at ${formatNumber(worst.pressureM, 1)} m and non-revenue water at `
          + `${formatPercent(worst.nrwPct, 1)}. Schedule rebalancing frequently recovers tail-end pressure before any `
          + 'capital intervention is considered.'
        : t('Schedule rebalancing frequently recovers tail-end pressure before any capital intervention is considered.'),
      expectedImpact:
        'Delivers immediate partial relief while sub-zonal metering localises loss to specific network sections rather than '
        + 'to the zone as a whole, so the eventual capital case is made against a located loss.',
      departmentId: 'dept-hydraulic',
      humanOwnerRole: t('Executive Engineer (Hydraulic)'),
      confidence: 'medium',
      dependencies: [t('Zonal engineer availability'), t('Metering equipment'), t('Night-flow survey window')],
      risks: [
        t('Rebalancing can reduce pressure in adjoining areas; both must be monitored together'),
        t('Survey accuracy falls where supply hours are irregular, which is most common in exactly the zones of interest'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    ...(belowPotability.length > 0
      ? [
          recommend({
            id: 'rec-water-potability',
            title: t('Raise sampling frequency in the {0} zones below the potability target', formatNumber(belowPotability.length)),
            why:
              `${belowPotability.map((z) => z.name).slice(0, 3).join(', ')} record potability compliance below the `
              + `${POTABILITY_TARGET}% target. Compliance is a sampling result, and a sparse sample cannot separate a `
              + 'localised contamination path from a network-wide one.',
            expectedImpact:
              'A denser sample locates the affected network section, which is the precondition for any targeted repair or '
              + 'flushing programme.',
            departmentId: 'dept-hydraulic',
            humanOwnerRole: t('Executive Engineer (Hydraulic)'),
            confidence: 'medium',
            dependencies: [t('Laboratory throughput'), t('Sampling staff availability')],
            risks: [
              'A compliance shortfall is a sampling observation. It supports no conclusion about any health outcome, which '
                + 'is a matter for the public health surveillance return and not for this register',
            ],
            evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
          }),
        ]
      : []),
  ]

  return {
    requestId: `q-water-supply-${ctx.user.id}-${scopeKey(ctx)}`,
    answer:
      `Across the ${formatNumber(zones.length)} distribution zones intersecting your scope the combined assessed deficit is `
      + `${formatNumber(deficit, 1)} MLD against ${formatNumber(demand, 1)} MLD of assessed demand, `
      + `${formatPercent(share(deficit, demand), 1)} of demand. ${formatNumber(aboveNrw.length)} zones exceed the `
      + `${NRW_THRESHOLD}% non-revenue water threshold, ${formatNumber(belowPressure.length)} record mean pressure below the `
      + `${PRESSURE_STANDARD_M} m service standard, and ${formatNumber(belowPotability.length)} fall short of the `
      + `${POTABILITY_TARGET}% potability compliance target. Non-revenue water combines physical loss and commercial loss and `
      + 'the single figure does not separate them, so a high reading identifies where to survey rather than what to repair. '
      + `${scopeSentence(ctx)}`,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Non-revenue water combines physical loss and commercial loss. The figure alone does not distinguish between a leaking '
        + 'main and an unmetered connection, and the two carry entirely different interventions.',
      'Assessed demand is a modelled figure derived from resident share, not a metered consumption total. A deficit computed '
        + 'against it describes the assessment, not observed unmet consumption.',
      'Zonal pressure and supply hours are network means. A zone at the service standard on average can still carry tail-end '
        + 'streets below it.',
    ],
    sources: sourcesOf(
      evidence,
      'Hydraulic SCADA & Zonal Register (simulated)',
      'Bulk Source Storage Register (simulated)',
      'Municipal Asset Register (simulated)',
    ),
    domains: ['water'],
    supportingTable: {
      caption: t('Water distribution zones by assessed deficit - highest first'),
      columns: [t('Zone'), t('Wards in scope'), t('Supply'), t('Demand'), t('Deficit'), t('Pressure'), t('Supply hours'), t('Non-revenue water')],
      rows: zones.slice(0, rows).map((z) => [
        z.name,
        scopedWardLabels(ctx, z.wardIds),
        `${formatNumber(z.supplyMld, 1)} MLD`,
        `${formatNumber(z.demandMld, 1)} MLD`,
        `${formatNumber(z.deficitMld, 1)} MLD`,
        `${formatNumber(z.pressureM, 1)} m`,
        `${formatNumber(z.supplyHours, 1)} h`,
        formatPercent(z.nrwPct, 1),
      ]),
    },
    visuals,
    followUps: [
      t('What is the sewerage treatment compliance position?'),
      t('Which municipal assets are in the worst condition?'),
      t('Are there any public health signals I should know about?'),
    ],
  }
}

/* ==========================================================================
   Sewerage and treatment
   ========================================================================== */

function answerSewerage(ctx: AnswerContext): ComposedAnswer {
  const refused = domainRefusal(ctx, 'sewerage', 'sewerage network and treatment records')
  if (refused) return refused

  const nodes = SEWERAGE_NODES.filter((n) => inScope(ctx, n.wardId))
    .slice()
    .sort((a, b) => b.utilisationPct - a.utilisationPct)

  if (nodes.length === 0) {
    return emptyAnswer(
      ctx,
      'sewerage network',
      `${scopeSentence(ctx)} Treatment facilities and trunk-sewer reaches are held against the ward they stand in, so a ward `
        + 'with no recorded node carries no entry in the sewerage register.',
    )
  }

  // Trunk reaches carry no compliance figure and hold zero in that field.
  // Averaging them in would understate treatment performance by construction,
  // so compliance is computed across treatment facilities only.
  const facilities = nodes.filter((n) => n.type === 'treatment-facility')
  const trunk = nodes.filter((n) => n.type === 'trunk-sewer')
  const belowNorm = facilities.filter((n) => n.treatmentCompliancePct < TREATMENT_COMPLIANCE_NORM)
  const meanCompliance = mean(facilities.map((n) => n.treatmentCompliancePct))
  const designCapacity = total(nodes.map((n) => n.designCapacityMld))
  const currentLoad = total(nodes.map((n) => n.currentLoadMld))
  const meanUtilisation = mean(nodes.map((n) => n.utilisationPct))
  const overCapacity = nodes.filter((n) => n.utilisationPct > 100)
  const blockages = total(nodes.map((n) => n.blockages30d))
  const overflows = total(nodes.map((n) => n.overflowEvents30d))
  const meanCondition = mean(nodes.map((n) => n.conditionIndex))
  const poorCondition = nodes.filter((n) => n.conditionIndex < CONDITION_FLOOR)

  const overflowByWard = new Map<string, { overflows: number; blockages: number; nodes: number }>()
  for (const node of nodes) {
    const row = overflowByWard.get(node.wardId) ?? { overflows: 0, blockages: 0, nodes: 0 }
    row.overflows += node.overflowEvents30d
    row.blockages += node.blockages30d
    row.nodes += 1
    overflowByWard.set(node.wardId, row)
  }
  const clusters = Array.from(overflowByWard.entries())
    .filter(([, row]) => row.overflows >= OVERFLOW_CLUSTER_THRESHOLD)
    .sort((a, b) => b[1].overflows - a[1].overflows)
  const cluster = clusters[0]

  const worstFacility = facilities.slice().sort((a, b) => a.treatmentCompliancePct - b.treatmentCompliancePct)[0]
  const highestUtilisation = nodes[0]

  const rows = take(ctx, 8, 12)
  const lines = Math.min(rows, 3)
  const headline: SewerageNode[] = belowNorm.length > 0 ? belowNorm.slice(0, lines) : nodes.slice(0, lines)

  const evidence = bestEvidence(ctx.user, {
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['sensor-reading', 'model-output'],
    count: 5,
  })

  const keyFindings = [
    ...headline.map(
      (n) =>
        `${n.name} - ${n.type.replace('-', ' ')} at ${formatPercent(n.utilisationPct, 1)} of a `
        + `${formatNumber(n.designCapacityMld)} MLD design capacity (${formatNumber(n.currentLoadMld)} MLD carried)`
        + `${n.type === 'treatment-facility' ? t(', treated-effluent compliance {0} against the {1}% norm', formatPercent(n.treatmentCompliancePct, 1), TREATMENT_COMPLIANCE_NORM) : ''}`
        + `, ${formatNumber(n.blockages30d)} blockages and ${formatNumber(n.overflowEvents30d)} overflow events in 30 days, `
        + `condition ${formatNumber(n.conditionIndex)}/100.`,
    ),
    facilities.length > 0
      ? `Mean treated-effluent compliance across the ${formatNumber(facilities.length)} treatment facilities in scope is `
        + `${formatPercent(meanCompliance, 1)} against the published discharge norm of ${TREATMENT_COMPLIANCE_NORM}%, with `
        + `${formatNumber(belowNorm.length)} facilities below it`
        + `${worstFacility ? t(' and the lowest at {0} on {1}', worstFacility.name, formatPercent(worstFacility.treatmentCompliancePct, 1)) : ''}. `
        + `The ${formatNumber(trunk.length)} trunk-sewer reaches in scope carry no compliance figure and are excluded from `
        + 'this average rather than averaged in as zero.'
      : `No treatment facility falls within scope; the ${formatNumber(trunk.length)} trunk-sewer reaches read here carry no `
        + 'treated-effluent compliance figure, so no compliance position can be stated for this scope.',
    `Aggregate design capacity in scope is ${formatNumber(designCapacity)} MLD against a current load of `
      + `${formatNumber(currentLoad)} MLD, a mean utilisation of ${formatPercent(meanUtilisation, 1)}; `
      + `${formatNumber(overCapacity.length)} nodes run above 100% of design capacity`
      + `${highestUtilisation ? t(', the highest being {0} at {1}', highestUtilisation.name, formatPercent(highestUtilisation.utilisationPct, 1)) : ''}.`,
    `${formatNumber(blockages)} blockages and ${formatNumber(overflows)} overflow events were recorded across `
      + `${formatNumber(nodes.length)} nodes in the last 30 days.`,
    cluster
      ? `Overflow events cluster in ${fullWard(cluster[0])}: ${formatNumber(cluster[1].overflows)} events in 30 days across `
        + `${formatNumber(cluster[1].nodes)} nodes, at or above the ${OVERFLOW_CLUSTER_THRESHOLD}-event threshold at which `
        + 'repeat events at fixed nodes typically indicate a structural defect or persistent obstruction requiring a CCTV '
        + 'survey rather than routine jetting.'
      : `No ward in scope reaches the ${OVERFLOW_CLUSTER_THRESHOLD}-event overflow threshold at which a pattern reads as `
        + 'structural rather than incidental; recorded events sit within the range handled by routine maintenance.',
    `Mean network condition across the scope is ${formatNumber(meanCondition)}/100, with `
      + `${formatNumber(poorCondition.length)} nodes below ${CONDITION_FLOOR}/100.`,
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'sewerage-headline',
      [
        {
          label: t('Mean treatment compliance'),
          value: facilities.length > 0 ? formatPercent(meanCompliance, 1) : t('Not applicable'),
          support: `norm ${TREATMENT_COMPLIANCE_NORM}%, facilities only`,
          tone: facilities.length > 0 ? toneFor(meanCompliance, true) : 'default',
        },
        {
          label: t('Facilities below norm'),
          value: `${formatNumber(belowNorm.length)} of ${formatNumber(facilities.length)}`,
          support: 'treated effluent against discharge norm',
          tone: belowNorm.length > 0 ? 'warn' : 'positive',
        },
        {
          label: t('Mean utilisation'),
          value: formatPercent(meanUtilisation, 1),
          support: `${formatNumber(currentLoad)} MLD of ${formatNumber(designCapacity)} MLD design`,
          tone: toneFor(meanUtilisation, false),
        },
        {
          label: t('Overflow events (30 d)'),
          value: formatNumber(overflows),
          support: `${formatNumber(blockages)} blockages recorded alongside`,
          tone: clusters.length > 0 ? 'critical' : 'default',
        },
      ],
      'Sewerage collection and treatment across the wards this answer covers.',
    ),
    compositionVisual({
      id: 'sewerage-compliance-split',
      caption: t('Treatment facilities against the {0}% discharge norm', TREATMENT_COMPLIANCE_NORM),
      segments: [
        {
          id: 'at-or-above',
          label: t('At or above norm'),
          value: facilities.length - belowNorm.length,
          colour: VISUAL_COLOUR.ok,
        },
        { id: 'below', label: t('Below norm'), value: belowNorm.length, colour: VISUAL_COLOUR.crit },
        { id: 'trunk', label: t('Trunk reaches - no compliance figure'), value: trunk.length, colour: VISUAL_COLOUR.muted },
      ],
    }),
    ...(facilities.length > 0
      ? [
          rankedBarVisual({
            id: 'sewerage-compliance-by-facility',
            caption: t('Treated-effluent compliance by facility - lowest first'),
            unit: '%',
            higherIsBetter: true,
            data: facilities
              .slice()
              .sort((a, b) => a.treatmentCompliancePct - b.treatmentCompliancePct)
              .slice(0, rows)
              .map((n) => ({ label: chartLabel(n.name), value: n.treatmentCompliancePct })),
          }),
        ]
      : []),
  ]

  const recommendedActions = [
    recommend({
      id: 'rec-sewerage-compliance',
      title: worstFacility
        ? t('Review treatment performance at {0}', worstFacility.name)
        : t('Review trunk-sewer condition across the nodes carrying the highest utilisation'),
      why: worstFacility
        ? `Treated-effluent compliance stands at ${formatPercent(worstFacility.treatmentCompliancePct, 1)} against the `
          + `published discharge norm of ${TREATMENT_COMPLIANCE_NORM}%, with the facility running at `
          + `${formatPercent(worstFacility.utilisationPct, 1)} of its ${formatNumber(worstFacility.designCapacityMld)} MLD `
          + `design capacity and a condition index of ${formatNumber(worstFacility.conditionIndex)}/100.`
        : `Mean utilisation across the scope is ${formatPercent(meanUtilisation, 1)} with `
          + `${formatNumber(overCapacity.length)} nodes above design capacity.`,
      expectedImpact:
        'Separates a hydraulic overload from a process or condition problem, which determines whether the response is load '
        + 'diversion, a process intervention, or a capital case for augmentation.',
      departmentId: 'dept-sewerage',
      humanOwnerRole: t('Executive Engineer (Sewerage)'),
      confidence: 'medium',
      dependencies: [t('Effluent sampling schedule'), t('Process engineer availability'), t('Inlet flow metering')],
      risks: [
        'A compliance figure is a sampling result over a period, so a single reading cannot distinguish a persistent '
          + 'shortfall from an episodic one',
        t('Diverting load to relieve one facility transfers it to another that must be assessed at the same time'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    ...(cluster
      ? [
          recommend({
            id: 'rec-sewerage-cctv',
            title: t('Commission a CCTV survey of the overflow cluster in {0}', fullWard(cluster[0])),
            why:
              `${formatNumber(cluster[1].overflows)} overflow events and ${formatNumber(cluster[1].blockages)} blockages were `
              + `recorded across ${formatNumber(cluster[1].nodes)} nodes in 30 days, at or above the `
              + `${OVERFLOW_CLUSTER_THRESHOLD}-event threshold at which repeat events at fixed nodes read as a structural `
              + 'pattern rather than an incidental one.',
            expectedImpact:
              'Establishes whether the cause is a structural defect, a persistent obstruction or a capacity limit - three '
              + 'findings with three different remedies, only one of which routine jetting addresses.',
            departmentId: 'dept-sewerage',
            humanOwnerRole: t('Executive Engineer (Sewerage)'),
            confidence: 'medium',
            dependencies: [t('CCTV survey contract availability'), t('Traffic management for manhole access')],
            risks: [t('A survey without a follow-on works decision leaves the position unchanged')],
            evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
          }),
        ]
      : []),
  ]

  return {
    requestId: `q-sewerage-${ctx.user.id}-${scopeKey(ctx)}`,
    answer:
      (facilities.length > 0
        ? `Mean treated-effluent compliance across the ${formatNumber(facilities.length)} treatment facilities in scope is `
          + `${formatPercent(meanCompliance, 1)} against the published discharge norm of ${TREATMENT_COMPLIANCE_NORM}%, with `
          + `${formatNumber(belowNorm.length)} facilities below it. `
        : `No treatment facility falls within scope, so no treated-effluent compliance position can be stated against the `
          + `published discharge norm of ${TREATMENT_COMPLIANCE_NORM}%. `)
      + 'Compliance is averaged across treatment facilities only - trunk-sewer reaches carry no compliance figure and are '
      + `excluded rather than averaged in as zero. The collection network in scope records ${formatNumber(blockages)} `
      + `blockages and ${formatNumber(overflows)} overflow events in the last 30 days across ${formatNumber(nodes.length)} `
      + `nodes, at a mean utilisation of ${formatPercent(meanUtilisation, 1)} of design capacity. ${scopeSentence(ctx)}`,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Treated-effluent compliance is averaged across treatment facilities only. Trunk-sewer reaches hold zero in that field '
        + 'because they carry no treatment function, and including them would understate performance by construction.',
      'Utilisation is computed against design capacity, which is a nameplate figure. A node at or below 100% can still '
        + 'surcharge under a wet-weather inflow that the design figure does not describe.',
      'Overflow and blockage counts are 30-day operational records. A cluster identifies where to survey; it establishes no '
        + 'cause and makes no finding about any operator or contractor.',
    ],
    sources: sourcesOf(evidence, 'Sewerage Operations Register (simulated)', 'Field Inspection Register (simulated)'),
    domains: ['sewerage'],
    supportingTable: {
      caption: t('Sewerage nodes by utilisation of design capacity - highest first'),
      columns: [
        t('Node'),
        t('Ward'),
        t('Type'),
        t('Design capacity'),
        t('Current load'),
        t('Utilisation'),
        t('Treatment compliance'),
        t('Blockages / overflows (30 d)'),
      ],
      rows: nodes.slice(0, rows).map((n) => [
        n.name,
        shortWard(n.wardId),
        titleCase(n.type),
        `${formatNumber(n.designCapacityMld)} MLD`,
        `${formatNumber(n.currentLoadMld)} MLD`,
        formatPercent(n.utilisationPct, 1),
        n.type === 'treatment-facility' ? formatPercent(n.treatmentCompliancePct, 1) : t('Not applicable'),
        `${formatNumber(n.blockages30d)} / ${formatNumber(n.overflowEvents30d)}`,
      ]),
    },
    visuals,
    followUps: [
      t('What is the current water supply position?'),
      t('Where is waterlogging risk concentrated?'),
      t('Are there any public health signals I should know about?'),
    ],
  }
}

/* ==========================================================================
   Coastal and water-body protection
   ========================================================================== */

function answerCoastal(ctx: AnswerContext): ComposedAnswer {
  const refused = domainRefusal(ctx, 'coastal', 'coastal frontage records')
  if (refused) return refused

  if (!hasCoastalJurisdiction(activeCorporation)) {
    return emptyAnswer(
      ctx,
      'coastal frontage',
      `${activeCorporation.shortName} is not a coastal or creek-side corporation, so no shoreline, seawall, mangrove or `
        + 'promenade segment is held against it. That is a statement about the geography of the corporation, not a gap in '
        + 'the register.',
    )
  }

  const segments = COASTAL_SEGMENTS.filter((s) => anyInScope(ctx, s.wardIds))
    .slice()
    .sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex)

  if (segments.length === 0) {
    return emptyAnswer(
      ctx,
      'coastal frontage',
      `${scopeSentence(ctx)} Frontage segments span several wards, and a segment is read here only where at least one of its `
        + 'wards falls inside your authorised scope.',
    )
  }

  const lengthKm = total(segments.map((s) => s.lengthKm))
  const meanVulnerability = mean(segments.map((s) => s.vulnerabilityIndex))
  const unprotected = segments.filter((s) => s.protectionStatus === 'unprotected')
  const partial = segments.filter((s) => s.protectionStatus === 'partially-protected')
  const protectedSegments = segments.filter((s) => s.protectionStatus === 'protected')
  const mangroveHa = total(segments.map((s) => s.mangroveCoverHa))
  const inundationHa = total(segments.map((s) => s.inundationExposureHa))
  const stale = segments.filter((s) => daysSince(s.lastSurveyedAt) > SURVEY_CURRENCY_DAYS)
  const mostExposed = segments.slice().sort((a, b) => b.inundationExposureHa - a.inundationExposureHa)[0]
  const worst = segments[0]
  const highTide = TIDE_WINDOWS.filter((tideWindow) => tideWindow.type === 'high')
  const peakTide = highTide.length > 0 ? Math.max(...highTide.map((tideWindow) => tideWindow.heightM)) : 0

  const statuses: Array<{ id: CoastalSegment['protectionStatus']; label: string; colour: string }> = [
    { id: 'protected', label: t('Protected'), colour: VISUAL_COLOUR.ok },
    { id: 'partially-protected', label: t('Partially protected'), colour: VISUAL_COLOUR.warn },
    { id: 'unprotected', label: t('Unprotected'), colour: VISUAL_COLOUR.crit },
  ]

  const rows = take(ctx, 8, 12)
  const lines = Math.min(rows, 4)

  const evidence = bestEvidence(ctx.user, {
    wardIds: ctx.scopeWards.map((w) => w.id),
    kinds: ['model-output', 'sensor-reading'],
    count: 5,
  })

  const keyFindings = [
    ...segments.slice(0, lines).map(
      (s) =>
        `${s.name} - ${s.type} frontage of ${formatNumber(s.lengthKm, 1)} km across ${scopedWardLabels(ctx, s.wardIds)}, `
        + `vulnerability ${formatNumber(s.vulnerabilityIndex)}/100, ${s.protectionStatus.replace('-', ' ')}, `
        + `${formatNumber(s.mangroveCoverHa, 1)} ha mangrove cover, ${formatNumber(s.inundationExposureHa, 1)} ha modelled `
        + `inundation exposure, last surveyed ${formatRelative(s.lastSurveyedAt)}.`,
    ),
    `${formatNumber(unprotected.length)} segments totalling ${formatNumber(total(unprotected.map((s) => s.lengthKm)), 1)} km `
      + `are recorded unprotected and ${formatNumber(partial.length)} partially protected, against `
      + `${formatNumber(protectedSegments.length)} protected; that is `
      + `${formatPercent(share(total(unprotected.map((s) => s.lengthKm)), lengthKm), 1)} of the `
      + `${formatNumber(lengthKm, 1)} km of frontage in scope carrying no protection works.`,
    `Modelled inundation exposure across the scope is ${formatNumber(inundationHa, 1)} hectares at the one-metre sea-level `
      + 'scenario the register is built against. That is a modelled exposure figure from a declared scenario - it carries no '
      + 'date, no probability and no assertion that the scenario will occur'
      + `${mostExposed ? t(', and it concentrates in {0} at {1} ha', mostExposed.name, formatNumber(mostExposed.inundationExposureHa, 1)) : ''}.`,
    `Mangrove cover recorded across the scope is ${formatNumber(mangroveHa, 1)} hectares. Mangrove is carried in this `
      + 'register as recorded cover, not as an assessed protective contribution, and no attenuation benefit is asserted here.',
    `${formatNumber(stale.length)} of ${formatNumber(segments.length)} segments were last surveyed more than `
      + `${SURVEY_CURRENCY_DAYS} days ago, which limits the weight the vulnerability index on those segments can carry: the `
      + 'index is computed from the survey, so it ages with it.',
    `The published tidal series records a peak high-tide height of ${formatNumber(peakTide, 2)} m, above the `
      + `${DISCHARGE_BLOCK_TIDE_M} m level at which gravity discharge through outfalls is obstructed on `
      + `${formatNumber(TIDE_WINDOWS.filter((tideWindow) => tideWindow.blocksDischarge).length)} of the ${formatNumber(TIDE_WINDOWS.length)} `
      + 'windows. Tidal obstruction and coastal vulnerability are separate registers and are reported here side by side, not '
      + 'combined into a single exposure figure.',
  ]

  const visuals: AIVisual[] = [
    metricsVisual(
      'coastal-headline',
      [
        {
          label: t('Frontage in scope'),
          value: `${formatNumber(lengthKm, 1)} km`,
          support: `${formatNumber(segments.length)} segments`,
        },
        {
          label: t('Mean vulnerability'),
          value: `${formatNumber(meanVulnerability, 1)}/100`,
          support: 'erosion and inundation composite',
          tone: toneFor(meanVulnerability, false),
        },
        {
          label: t('Unprotected'),
          value: `${formatNumber(unprotected.length)} of ${formatNumber(segments.length)}`,
          support: `${formatNumber(total(unprotected.map((s) => s.lengthKm)), 1)} km with no protection works`,
          tone: unprotected.length > 0 ? 'critical' : 'positive',
        },
        {
          label: t('Modelled inundation exposure'),
          value: `${formatNumber(inundationHa, 1)} ha`,
          support: 'one-metre sea-level scenario - a simulation, not a projection',
        },
        {
          label: t('Surveys out of currency'),
          value: formatNumber(stale.length),
          support: `last surveyed over ${SURVEY_CURRENCY_DAYS} days ago`,
          tone: stale.length > 0 ? 'warn' : 'positive',
        },
      ],
      'Coastal frontage across the wards this answer covers.',
    ),
    compositionVisual({
      id: 'coastal-protection-status',
      caption: t('Frontage length by protection status (km)'),
      segments: statuses.map((s) => ({
        id: s.id,
        label: s.label,
        value: Math.round(total(segments.filter((x) => x.protectionStatus === s.id).map((x) => x.lengthKm)) * 10) / 10,
        colour: s.colour,
      })),
    }),
    rankedBarVisual({
      id: 'coastal-vulnerability',
      caption: t('Vulnerability index by frontage segment - highest first'),
      unit: '/100',
      higherIsBetter: false,
      data: segments.slice(0, rows).map((s) => ({ label: chartLabel(s.name), value: s.vulnerabilityIndex })),
    }),
  ]

  const recommendedActions = [
    recommend({
      id: 'rec-coastal-protection',
      title: worst
        ? t('Bring forward the protection assessment for {0}', worst.name)
        : t('Bring forward protection assessments across the unprotected frontage'),
      why: worst
        ? `The segment carries a vulnerability index of ${formatNumber(worst.vulnerabilityIndex)}/100 across `
          + `${formatNumber(worst.lengthKm, 1)} km, is recorded ${worst.protectionStatus.replace('-', ' ')}, and holds `
          + `${formatNumber(worst.inundationExposureHa, 1)} ha of modelled inundation exposure. It was last surveyed `
          + `${formatRelative(worst.lastSurveyedAt)}.`
        : `${formatNumber(unprotected.length)} segments are recorded unprotected across `
          + `${formatNumber(total(unprotected.map((s) => s.lengthKm)), 1)} km of frontage.`,
      expectedImpact:
        'An assessment against a current survey establishes whether the appropriate response is a protection work, a '
        + 'managed-realignment position or continued monitoring - three outcomes the vulnerability index alone cannot '
        + 'distinguish.',
      departmentId: 'dept-coastal',
      humanOwnerRole: t('Chief Engineer (Coastal Cell)'),
      confidence: 'medium',
      dependencies: [
        t('Coastal regulation zone clearances'),
        t('Bathymetric and shoreline survey window'),
        t('State coastal authority concurrence'),
      ],
      risks: [
        t('Protection works at one segment can transfer erosion along the frontage unless the adjoining cells are assessed with it'),
        t('The vulnerability index is computed from the last survey and ages with it; a stale index supports a survey decision, not a works decision'),
      ],
      evidenceRefs: evidence.slice(0, 3).map((e) => e.id),
    }),
    ...(stale.length > 0
      ? [
          recommend({
            id: 'rec-coastal-survey',
            title: t('Re-survey the {0} segments outside survey currency', formatNumber(stale.length)),
            why:
              `${stale.map((s) => s.name).slice(0, 3).join(', ')} were last surveyed more than ${SURVEY_CURRENCY_DAYS} days `
              + 'ago. Every figure held against those segments - vulnerability, protection status and modelled exposure - is '
              + 'computed from that survey and carries its age.',
            expectedImpact:
              'Restores the evidential basis for prioritisation, so that capital is allocated against a current shoreline '
              + 'position rather than a historic one.',
            departmentId: 'dept-coastal',
            humanOwnerRole: t('Chief Engineer (Coastal Cell)'),
            confidence: 'high',
            dependencies: [t('Survey contract availability'), t('Fair-weather survey window outside the monsoon')],
            risks: [t('A re-survey can move a segment in either direction; it is not, in itself, a case for works')],
            evidenceRefs: evidence.slice(0, 2).map((e) => e.id),
          }),
        ]
      : []),
  ]

  return {
    requestId: `q-coastal-${ctx.user.id}-${scopeKey(ctx)}`,
    answer:
      `${formatNumber(segments.length)} frontage segments totalling ${formatNumber(lengthKm, 1)} km fall within your scope, `
      + `carrying a mean vulnerability index of ${formatNumber(meanVulnerability, 1)}/100; `
      + `${formatNumber(unprotected.length)} are recorded unprotected and ${formatNumber(partial.length)} partially `
      + `protected. Modelled inundation exposure across those segments is ${formatNumber(inundationHa, 1)} hectares at the `
      + 'one-metre sea-level scenario the register is built against - a modelled exposure figure from a declared scenario, '
      + `not a projection of what will occur, and carrying neither a date nor a probability. ${formatNumber(mangroveHa, 1)} `
      + `hectares of mangrove cover are recorded across the scope, and ${formatNumber(stale.length)} segments were last `
      + `surveyed more than ${SURVEY_CURRENCY_DAYS} days ago, which limits the weight their vulnerability index can carry. `
      + `${scopeSentence(ctx)}`,
    keyFindings,
    evidence,
    recommendedActions,
    risksAndLimitations: [
      ...standardLimitations(),
      'Inundation exposure is a modelled output at a stated one-metre sea-level scenario. It is a simulation produced for '
        + 'preparedness planning, not a projection, and carries no date, probability or assertion that the scenario will occur.',
      'The vulnerability index is computed from the last recorded survey and ages with it. Segments outside survey currency '
        + 'are identified above precisely so that a stale index is not read as a current one.',
      'Mangrove cover is recorded as observed extent. No protective or attenuation benefit is assessed or asserted from it '
        + 'anywhere in this register.',
    ],
    sources: sourcesOf(evidence, 'Coastal Frontage Survey Register (simulated)', 'Urban Flood Risk Model (demonstration)'),
    domains: ['coastal', 'environment'],
    supportingTable: {
      caption: t('Coastal frontage segments by vulnerability - highest first'),
      columns: [
        t('Segment'),
        t('Type'),
        t('Wards in scope'),
        t('Length'),
        t('Vulnerability'),
        t('Protection'),
        t('Mangrove cover'),
        t('Last surveyed'),
      ],
      rows: segments.slice(0, rows).map((s) => [
        s.name,
        titleCase(s.type),
        scopedWardLabels(ctx, s.wardIds),
        `${formatNumber(s.lengthKm, 1)} km`,
        `${formatNumber(s.vulnerabilityIndex)}/100`,
        titleCase(s.protectionStatus),
        `${formatNumber(s.mangroveCoverHa, 1)} ha`,
        formatRelative(s.lastSurveyedAt),
      ]),
    },
    visuals,
    followUps: [
      t('How prepared are we for this monsoon?'),
      t('Where is waterlogging risk concentrated?'),
      t('What is the disaster management readiness position?'),
    ],
  }
}

/* ==========================================================================
   Registry
   ========================================================================== */

export const waterHandlers: Partial<Record<QueryIntentId, AnswerHandler>> = {
  'monsoon-readiness': answerMonsoonReadiness,
  waterlogging: answerWaterlogging,
  stormwater: answerStormwater,
  'water-supply': answerWaterSupply,
  sewerage: answerSewerage,
  coastal: answerCoastal,
}
