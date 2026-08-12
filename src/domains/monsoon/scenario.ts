import type { ConfidenceLevel } from '@/types/common'
import type {
  MonsoonScenarioInput,
  MonsoonScenarioResult,
  WaterloggingSpot,
} from '@/types/city-domains'
import {
  PUMPING_STATIONS,
  RAINFALL_OBSERVATIONS,
  READINESS_BY_WARD,
  STORM_DRAINS,
  TIDE_WINDOWS,
  WARD_MONSOON_READINESS,
  WATERLOGGING_SPOTS,
} from '@/data/city.data'
import { HOSPITALS } from '@/data/social.data'
import { WARDS, WARD_BY_ID, wardName } from '@/data/reference'
import { onAfterRebuild } from '@/data/runtime'
import { isoFromAnchor } from '@/utils/deterministic'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * Urban flood scenario engine.
 *
 * DETERMINISTIC AND PURE. The same inputs always produce the same outputs.
 *
 * Every output of this engine is a SIMULATION produced by a declared rule
 * model. It is not a forecast, not a meteorological product, and must never
 * be represented as either. The interface labels every result accordingly.
 */

/** Published driver weights. Rendered in the explainability panel. */
export const MONSOON_DRIVER_WEIGHTS = {
  rainfallIntensity: 0.3,
  tideObstruction: 0.24,
  drainCapacity: 0.18,
  pumpAvailability: 0.16,
  duration: 0.12,
} as const

function build$MONSOON_DRIVER_LABELS(): Record<keyof typeof MONSOON_DRIVER_WEIGHTS, string> {
  return {
  rainfallIntensity: t('Rainfall intensity against drain capacity'),
  tideObstruction: t('Tidal obstruction of gravity discharge'),
  drainCapacity: t('Pre-monsoon desilting shortfall'),
  pumpAvailability: t('Pumping capacity availability'),
  duration: t('Duration of continuous rainfall'),
}
}
export let MONSOON_DRIVER_LABELS: Record<keyof typeof MONSOON_DRIVER_WEIGHTS, string> = build$MONSOON_DRIVER_LABELS()
registerLayer(() => {
  MONSOON_DRIVER_LABELS = build$MONSOON_DRIVER_LABELS()
})

export const MONSOON_DRIVER_EXPLANATIONS: Record<keyof typeof MONSOON_DRIVER_WEIGHTS, string> = {
  rainfallIntensity:
    'Rainfall above roughly 65 mm in 24 hours begins to exceed the design intensity of much of the network. The driver scales non-linearly beyond that point.',
  tideObstruction:
    'Above about 4.2 m, tide height prevents gravity discharge through outfalls, so accumulated water cannot leave regardless of drain condition. This is the dominant driver during a coincidence event.',
  drainCapacity:
    'Every percentage point of desilting left incomplete before the season reduces effective discharge capacity on the affected reaches.',
  pumpAvailability:
    'Where gravity discharge is obstructed, pumped discharge is the only remaining mechanism. Reduced availability removes that mechanism.',
  duration:
    'Sustained rainfall saturates catchments and removes the recovery interval between peaks, so the same intensity produces greater accumulation.',
}

/** Current observed conditions, derived from the demonstration observations. */
function deriveBaselineInputs(): MonsoonScenarioInput {
  // Median rather than mean: a single extremely-heavy station reading should
  // not present the whole city as being under extreme rainfall.
  const rainfall = [...RAINFALL_OBSERVATIONS].map((r) => r.last24hMm).sort((a, b) => a - b)
  const medianRain = rainfall[Math.floor(rainfall.length / 2)] ?? 40

  // The NEXT high tide chronologically, not the highest in the whole window.
  // Using the maximum made the current-conditions baseline more severe than
  // the heavy-rain-and-high-tide scenario, which is the wrong way round.
  const nowMs = new Date(isoFromAnchor(0)).getTime()
  const upcomingHighTides = TIDE_WINDOWS.filter((tideWindow) => tideWindow.type === 'high' && new Date(tideWindow.at).getTime() >= nowMs).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  )
  const nextHighTide = upcomingHighTides[0] ?? TIDE_WINDOWS.find((tideWindow) => tideWindow.type === 'high')

  const pumpAvailability =
    (PUMPING_STATIONS.reduce((s, p) => s + p.pumpsOperational / Math.max(p.pumpsTotal, 1), 0) /
      Math.max(PUMPING_STATIONS.length, 1)) *
    100
  const desilting =
    STORM_DRAINS.reduce((s, d) => s + d.desiltingCompletionPct, 0) / Math.max(STORM_DRAINS.length, 1)

  return {
    rainfallMm24h: Math.round(medianRain),
    tideHeightM: Math.round((nextHighTide?.heightM ?? 3.8) * 100) / 100,
    pumpAvailabilityPct: Math.round(pumpAvailability),
    desiltingCompletionPct: Math.round(desilting),
    durationHours: 12,
  }
}

/**
 * Local shape only. The public type is `MonsoonScenarioPreset` in
 * `src/services/monsoon.service.ts`, which is what pages consume; declaring it
 * here as well would put two identically-named interfaces into the codebase for
 * no gain, and the domain layer must not import upward from the services layer.
 */
interface ScenarioPreset {
  id: string
  label: string
  description: string
  inputs: MonsoonScenarioInput
}

/** The declared scenarios, all stated relative to the current baseline. */
function buildPresets(base: MonsoonScenarioInput): ScenarioPreset[] {
  return [
    {
      id: 'current',
      label: t('Current conditions'),
      description: t('The position as currently observed across the rainfall, tide, pump and desilting registers.'),
      inputs: base,
    },
    {
      id: 'heavy-rain',
      label: t('Heavy rainfall'),
      description: t('Heavy rainfall of 115 mm over 24 hours with the tide window unchanged.'),
      inputs: { ...base, rainfallMm24h: 115, durationHours: 14 },
    },
    {
      id: 'heavy-rain-high-tide',
      label: t('Heavy rainfall + high tide'),
      description:
        t('Heavy rainfall coinciding with a 4.6 m high tide - gravity discharge is obstructed and pumped discharge becomes the only mechanism.'),
      inputs: { ...base, rainfallMm24h: 132, tideHeightM: 4.6, durationHours: 16 },
    },
    {
      id: 'extreme',
      label: t('Extreme rainfall + high tide + reduced pumping'),
      description:
        t('Extremely heavy rainfall of 240 mm, a 4.8 m spring tide and pumping capacity reduced to 62% - the compound worst case for preparedness planning.'),
      inputs: {
        rainfallMm24h: 240,
        tideHeightM: 4.8,
        pumpAvailabilityPct: 62,
        desiltingCompletionPct: Math.max(50, base.desiltingCompletionPct - 14),
        durationHours: 24,
      },
    },
    {
      id: 'well-prepared',
      label: t('Well-prepared benchmark'),
      description:
        t('The same rainfall as the heavy-rain case with desilting complete and full pumping availability - the benchmark against which preparedness investment is assessed.'),
      inputs: {
        rainfallMm24h: 115,
        tideHeightM: base.tideHeightM,
        pumpAvailabilityPct: 100,
        desiltingCompletionPct: 100,
        durationHours: 14,
      },
    },
  ]
}

/**
 * The current-conditions baseline and the presets built from it are DERIVED
 * STATE, not seed data: every figure in them is read out of the rainfall, tide,
 * pumping and drain registers. Computed once at module load they would keep
 * describing the previous corporation after a switch - a Nagpur deployment
 * offering Brihanmumbai's observed rainfall and tide height as "current
 * conditions" - so both are `let` bindings, rebuilt after every layer rebuild.
 * `onAfterRebuild` rather than `registerLayer` because these derive from the
 * data layers rather than being one of them, and nothing upstream reads them.
 */
export let DEFAULT_MONSOON_SCENARIO: MonsoonScenarioInput = deriveBaselineInputs()

export let MONSOON_SCENARIO_PRESETS: ScenarioPreset[] = buildPresets(DEFAULT_MONSOON_SCENARIO)

onAfterRebuild(() => {
  DEFAULT_MONSOON_SCENARIO = deriveBaselineInputs()
  MONSOON_SCENARIO_PRESETS = buildPresets(DEFAULT_MONSOON_SCENARIO)
})

/** Normalises each declared driver to 0–100 for a given input set. */
function driverScores(inputs: MonsoonScenarioInput): Record<keyof typeof MONSOON_DRIVER_WEIGHTS, number> {
  // Rainfall: linear to 65 mm, then steepening - the network design threshold.
  const rain = inputs.rainfallMm24h
  const rainfallIntensity =
    rain <= 65 ? (rain / 65) * 45 : Math.min(100, 45 + ((rain - 65) / 175) * 55 + Math.pow((rain - 65) / 175, 2) * 18)

  // Tide: negligible below 3.6 m, steep above 4.2 m where outfalls are blocked.
  const tide = inputs.tideHeightM
  const tideObstruction =
    tide <= 3.6 ? (tide / 3.6) * 18 : tide <= 4.2 ? 18 + ((tide - 3.6) / 0.6) * 32 : Math.min(100, 50 + ((tide - 4.2) / 0.8) * 50)

  const drainCapacity = Math.min(100, Math.max(0, (100 - inputs.desiltingCompletionPct) * 1.85))
  const pumpAvailability = Math.min(100, Math.max(0, (100 - inputs.pumpAvailabilityPct) * 1.6))
  const duration = Math.min(100, (Math.max(0, inputs.durationHours - 4) / 32) * 100)

  return { rainfallIntensity, tideObstruction, drainCapacity, pumpAvailability, duration }
}

function weightedRisk(scores: Record<keyof typeof MONSOON_DRIVER_WEIGHTS, number>): number {
  return (Object.keys(scores) as Array<keyof typeof MONSOON_DRIVER_WEIGHTS>).reduce(
    (sum, key) => sum + scores[key] * MONSOON_DRIVER_WEIGHTS[key],
    0,
  )
}

/** Names the driver contributing most to the modelled movement. */
function dominantDriver(scores: Record<keyof typeof MONSOON_DRIVER_WEIGHTS, number>): keyof typeof MONSOON_DRIVER_WEIGHTS {
  let best: keyof typeof MONSOON_DRIVER_WEIGHTS = 'rainfallIntensity'
  let bestValue = -1
  for (const key of Object.keys(scores) as Array<keyof typeof MONSOON_DRIVER_WEIGHTS>) {
    const contribution = scores[key] * MONSOON_DRIVER_WEIGHTS[key]
    if (contribution > bestValue) {
      bestValue = contribution
      best = key
    }
  }
  return best
}

/** Ward exposure multiplier from its structural vulnerability. */
function wardExposure(wardId: string): number {
  const ward = WARD_BY_ID.get(wardId)
  if (!ward) return 1
  const readiness = READINESS_BY_WARD.get(wardId)
  const floodFactor = ward.floodProne ? 1.28 : 0.72
  const spotFactor = 1 + Math.min(0.35, ward.waterloggingSpots * 0.022)
  const readinessFactor = readiness ? 1 + (70 - Math.min(readiness.readinessScore, 100)) / 240 : 1
  return floodFactor * spotFactor * readinessFactor
}

export function runMonsoonScenario(inputs: MonsoonScenarioInput): MonsoonScenarioResult {
  const scores = driverScores(inputs)
  const baseRisk = weightedRisk(scores)
  const dominant = dominantDriver(scores)

  const baselineScores = driverScores(DEFAULT_MONSOON_SCENARIO)
  const baselineRiskCity = weightedRisk(baselineScores)

  const wardRisks = WARDS.map((ward) => {
    const exposure = wardExposure(ward.id)
    const baselineRisk = Math.round(Math.min(100, Math.max(2, baselineRiskCity * exposure)))
    const scenarioRisk = Math.round(Math.min(100, Math.max(2, baseRisk * exposure)))
    const readiness = READINESS_BY_WARD.get(ward.id)

    const parts: string[] = [MONSOON_DRIVER_LABELS[dominant].toLowerCase()]
    if (ward.floodProne) parts.push(t('flood-prone low-lying exposure'))
    if (readiness && readiness.desiltingPct < 92) parts.push(t('desilting at {0}%', readiness.desiltingPct.toFixed(0)))
    if (readiness && readiness.pumpReadiness < 80) parts.push(t('pump readiness at {0}%', readiness.pumpReadiness))
    if (ward.waterloggingSpots >= 8) parts.push(t('{0} chronic locations', ward.waterloggingSpots))

    return {
      wardId: ward.id,
      baselineRisk,
      scenarioRisk,
      delta: scenarioRisk - baselineRisk,
      driverSummary: `Dominant driver: ${parts.join('; ')}.`,
    }
  }).sort((a, b) => b.scenarioRisk - a.scenarioRisk)

  // Chronic locations crossing the operational attention threshold.
  const spotResults = scenarioSpotRisks(inputs)
  const spotsAtRisk = spotResults.filter((s) => s.scenarioRisk >= 60).length
  const criticalRoutesAtRisk = spotResults.filter((s) => s.spot.criticalRoute && s.scenarioRisk >= 55).length

  // Hospitals whose approach degrades under the scenario. Only facilities
  // with inpatient capacity are counted - a dispensary losing road access is
  // an inconvenience; a hospital losing it is an emergency-access failure.
  const hospitalsWithAccessRisk = HOSPITALS.filter((hospital) => {
    if (hospital.bedsTotal < 20) return false
    const wardRisk = wardRisks.find((w) => w.wardId === hospital.wardId)
    if (!wardRisk) return false
    const degraded = hospital.accessibilityIndex - wardRisk.scenarioRisk * 0.4
    return degraded < 42
  }).length

  // Population exposed: ward population weighted by modelled risk above threshold.
  const estimatedPopulationExposed = Math.round(
    wardRisks.reduce((sum, wr) => {
      const ward = WARD_BY_ID.get(wr.wardId)
      if (!ward || wr.scenarioRisk < 45) return sum
      return sum + ward.population * ((wr.scenarioRisk - 45) / 100) * 0.42
    }, 0),
  )

  // Deployment recommendations, ranked by exposure. Advisory only.
  const recommendedDeployments = wardRisks
    .filter((wr) => wr.scenarioRisk >= 55)
    .slice(0, 8)
    .map((wr) => {
      const readiness = READINESS_BY_WARD.get(wr.wardId)
      const shortfall = Math.max(1, Math.round((wr.scenarioRisk - 50) / 12))
      const resource =
        readiness && readiness.pumpReadiness < 78
          ? t('Dewatering pump set')
          : readiness && readiness.desiltingPct < 88
            ? t('Emergency desilting crew')
            : t('Disaster response team')
      return {
        wardId: wr.wardId,
        resource,
        quantity: shortfall,
        rationale: t('{0} moves from {1} to {2} under this scenario. {3} Pre-positioning {4} × {5} addresses the binding constraint. Requires approval by a named officer before any deployment.', wardName(wr.wardId), wr.baselineRisk, wr.scenarioRisk, wr.driverSummary, shortfall, resource.toLowerCase()),
      }
    })

  const readinessScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        WARD_MONSOON_READINESS.reduce((s, r) => s + r.readinessScore, 0) / Math.max(WARD_MONSOON_READINESS.length, 1) -
          (baseRisk - baselineRiskCity) * 0.42,
      ),
    ),
  )

  // Confidence falls where inputs sit outside the range the model was shaped on.
  const implausible =
    inputs.rainfallMm24h > 300 || inputs.tideHeightM > 5.2 || inputs.durationHours > 48
  const marginal = inputs.rainfallMm24h > 200 || inputs.tideHeightM > 4.8
  const confidence: ConfidenceLevel = implausible ? 'low' : marginal ? 'medium' : 'high'

  return {
    inputs,
    cityRisk: Math.round(Math.min(100, Math.max(0, baseRisk))),
    readinessScore,
    wardRisks,
    spotsAtRisk,
    criticalRoutesAtRisk,
    hospitalsWithAccessRisk,
    estimatedPopulationExposed,
    recommendedDeployments,
    generatedAt: isoFromAnchor(0),
    isSimulation: true,
    confidence,
  }
}

/** Recomputes every chronic waterlogging location under the scenario. */
export function scenarioSpotRisks(
  inputs: MonsoonScenarioInput,
): Array<{ spot: WaterloggingSpot; scenarioRisk: number; delta: number }> {
  const scores = driverScores(inputs)
  const cityRisk = weightedRisk(scores)
  const baselineCityRisk = weightedRisk(driverScores(DEFAULT_MONSOON_SCENARIO))

  return WATERLOGGING_SPOTS.map((spot) => {
    const mitigationRelief =
      spot.mitigationStatus === 'completed' ? 0.7 : spot.mitigationStatus === 'in-progress' ? 0.86 : 1

    // A chronic location is by definition more exposed than the city average -
    // that is what makes it chronic. The weight therefore spans below and
    // above 1.0 rather than only scaling the city figure down.
    const chronicWeight = 0.55 + (spot.chronicIndex / 100) * 0.8
    const exposure = wardExposure(spot.wardId)
    const routeFactor = spot.criticalRoute ? 1.1 : 1

    const score = (city: number): number =>
      Math.round(Math.min(100, Math.max(2, city * chronicWeight * mitigationRelief * routeFactor * exposure)))

    const scenarioRisk = score(cityRisk)
    return { spot, scenarioRisk, delta: scenarioRisk - score(baselineCityRisk) }
  }).sort((a, b) => b.scenarioRisk - a.scenarioRisk)
}

/** Driver breakdown for the explainability panel. */
export function monsoonDriverBreakdown(inputs: MonsoonScenarioInput): Array<{
  id: string
  label: string
  weight: number
  rawScore: number
  contribution: number
  explanation: string
}> {
  const scores = driverScores(inputs)
  return (Object.keys(scores) as Array<keyof typeof MONSOON_DRIVER_WEIGHTS>).map((key) => ({
    id: key,
    label: MONSOON_DRIVER_LABELS[key],
    weight: MONSOON_DRIVER_WEIGHTS[key],
    rawScore: Math.round(scores[key]),
    contribution: Math.round(scores[key] * MONSOON_DRIVER_WEIGHTS[key] * 10) / 10,
    explanation: MONSOON_DRIVER_EXPLANATIONS[key],
  }))
}

/** The statement rendered against every scenario output. */
export const SIMULATION_STATEMENT =
  'This is a simulation produced by a deterministic rule model using the inputs shown. It is not a forecast, not a meteorological product, and must not be represented as either. It is intended for preparedness planning and resource prioritisation only.'
