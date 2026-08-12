import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import { SEVERITY_ORDER } from '@/types/common'
import type {
  ConfidenceLevel,
  DataClassification,
  IntelligenceDomain,
  Severity,
} from '@/types/common'
import type {
  Alert,
  AlertStatus,
  IntelligenceGenerator,
  IntelligenceItem,
  IntelligenceStatus,
  IntelligenceType,
  NotificationItem,
  RecommendedAction,
} from '@/types/intelligence'
import type { Ward } from '@/types/organisation'
import { det, isoFromAnchor } from '@/utils/deterministic'
import { buildFreshness, REFRESH_CADENCE } from './freshness'
import { EVIDENCE_ITEMS } from './evidence.data'
import { landmarkName, localityFor, waterSourceNames } from './naming'
import { WARDS, WARD_BY_ID, wardName } from './reference'
import { registerLayer } from './runtime'
import { t } from '@/i18n'

/**
 * Intelligence corpus.
 *
 * Templates describe institutionally realistic municipal signals. Each is
 * instantiated against wards whose modelled condition actually warrants it,
 * so the intelligence picture agrees with the ward, monsoon, finance and
 * project pictures rather than contradicting them.
 *
 * Every place a narrative points at - a neighbourhood, a corridor, a water
 * body - is drawn from the ACTIVE corporation's own published localities and
 * water bodies through `./naming.ts`, or is a constructed neutral label. A
 * real place name is never borrowed from another city.
 *
 * Signals that only make sense on a shoreline are written around the
 * corporation's own geography instead: a coastal corporation reads seawalls
 * and tides, a riverine one embankments and river stage, an inland one tank
 * bunds and a saturated catchment. The exposure being described is the same
 * in every case - water that will not drain away when it rains hardest.
 *
 * Every export below is a LIVE BINDING, rebuilt on a corporation switch.
 */

/**
 * Place labels an item's narrative can point at, resolved once per instance so
 * the same item always names the same locality.
 */
interface PlaceContext {
  /** A named neighbourhood of the active corporation. */
  locality: string
  /** A second, different neighbourhood, for narratives naming a pair. */
  neighbour: string
  /** A constructed corridor label - never a real road from another city. */
  corridor: string
  /** The corporation's own principal water body, or a neutral source label. */
  water: string
}

interface IntelTemplate {
  key: string
  type: IntelligenceType
  domain: IntelligenceDomain
  departmentId: string
  title: (ward: string, place: PlaceContext) => string
  description: (ward: string, place: PlaceContext) => string
  explanation: string
  severityBase: Severity
  classification: DataClassification
  generator: IntelligenceGenerator
  /** Selection predicate - controls which wards the signal is raised against. */
  applies?: (wardId: string) => boolean
  actions: Array<Omit<RecommendedAction, 'id' | 'requiresHumanApproval' | 'departmentId'>>
  contributingDomains?: IntelligenceDomain[]
  citizensAffectedFactor?: number
}

const floodProne = (wardId: string): boolean => WARD_BY_ID.get(wardId)?.floodProne ?? false
const highRisk = (wardId: string): boolean => (WARD_BY_ID.get(wardId)?.riskScore ?? 0) >= 52
const dense = (wardId: string): boolean => {
  const w = WARD_BY_ID.get(wardId)
  return w ? w.population / w.areaSqKm > 30_000 : false
}

/**
 * The median number of chronic waterlogging locations across the corporation's
 * own wards - the threshold that separates land at the water's edge from land
 * that is merely low-lying.
 */
function medianWaterloggingSpots(): number {
  if (WARDS.length === 0) return 0
  const spots = WARDS.map((w) => w.waterloggingSpots).sort((a, b) => a - b)
  return spots[Math.floor(spots.length / 2)] ?? 0
}

/**
 * Water's-edge exposure.
 *
 * The seed rule for this was `region !== 'Eastern Suburbs' && floodProne`,
 * which is a Brihanmumbai-only test - its Eastern Suburbs face the creek and
 * the mainland rather than the open shoreline. That region name does not exist
 * for a generated city, whose regions are compass bands, so the intent is
 * expressed here through the ward's own attributes instead: flood-prone, and
 * carrying at least as many chronic waterlogging locations as the median ward
 * of the same corporation. That is the same exposure the region test was
 * standing in for, stated in terms every corporation actually has.
 */
function waterEdge(wardId: string, medianSpots: number): boolean {
  const w = WARD_BY_ID.get(wardId)
  return w !== undefined && w.floodProne && w.waterloggingSpots >= medianSpots
}

/**
 * How this corporation's geography produces a "the water cannot get away"
 * risk, and what its protective asset is called.
 *
 * A coastal corporation has a seawall and a tide; a riverine one an embankment
 * and a river in spate; a lakeside one a bund at full supply level; an inland
 * one tank bunds over a catchment that saturates. Only a corporation that
 * actually has a shoreline is ever shown shoreline language.
 */
interface WaterEdgeFraming {
  /** Noun phrase naming the protective works, used in a signal title. */
  protection: string
  /** What the protective structure is called in prose. */
  asset: string
  /** The frontage that structure protects. */
  frontage: string
  /** The season the protection is tested in. */
  peakWindow: string
  /** The window inside which repairs must be completed. */
  repairWindow: string
  /** The statutory clearance a repair on that frontage requires. */
  clearance: string
  /** The coincidence that turns heavy rain into standing water. */
  coincidence: string
  /** Why the drains stop discharging under that coincidence. */
  blockedOutfall: string
}

function waterEdgeFraming(): WaterEdgeFraming {
  const form = activeCorporation.form
  const body = form.waterBodies[0] ?? waterSourceNames(1)[0] ?? t('the principal water body')

  switch (form.type) {
    case 'coastal':
    case 'creek-side':
      return {
        protection: 'Shoreline protection',
        asset: 'seawall',
        frontage: 'the protected shoreline',
        peakWindow: 'high-tide season',
        repairWindow: 'spring tide window',
        clearance: 'Coastal regulation clearance',
        coincidence: 'a heavy-rain and high-tide coincidence',
        blockedOutfall: 'the tide holds the outfalls shut',
      }
    case 'riverine':
      return {
        protection: 'Embankment protection',
        asset: 'embankment',
        frontage: `the ${body} embankment`,
        peakWindow: 'peak river-stage season',
        repairWindow: 'pre-monsoon window',
        clearance: 'Irrigation department clearance',
        coincidence: 'a heavy-rain and high river-stage coincidence',
        blockedOutfall: 'the river stands above outfall level',
      }
    case 'lakeside':
      return {
        protection: 'Foreshore protection',
        asset: 'bund',
        frontage: `the ${body} foreshore`,
        peakWindow: 'full-supply-level season',
        repairWindow: 'pre-monsoon window',
        clearance: 'Lake conservation clearance',
        coincidence: 'a heavy-rain and full-supply-level coincidence',
        blockedOutfall: 'the lake stands above outfall level',
      }
    default:
      return {
        protection: 'Bund and revetment protection',
        asset: 'tank bund and nallah revetment',
        frontage: `the ${body} catchment edge`,
        peakWindow: 'monsoon peak',
        repairWindow: 'pre-monsoon window',
        clearance: 'Watershed and irrigation clearance',
        coincidence: 'a heavy-rain and saturated-catchment coincidence',
        blockedOutfall: 'the catchment is already saturated and the outfall surcharged',
      }
  }
}

/**
 * Templates are rebuilt per corporation because several of them are written
 * around the corporation's own geography and its own ward statistics.
 */
function intelTemplates(): IntelTemplate[] {
  const edge = waterEdgeFraming()
  const medianSpots = medianWaterloggingSpots()

  return [
    {
      key: 'drain-capacity',
      type: 'risk',
      domain: 'stormwater',
      departmentId: 'dept-stormwater',
      applies: floodProne,
      title: (w) => t('Drain capacity shortfall against forecast intensity in {0}', w),
      description: (w, p) =>
        t('Modelled discharge capacity across the major nallah network in {0} falls short of the intensity indicated in the 48-hour rainfall outlook, with desilting completion below the pre-monsoon target on three reaches including the reach through {1}.', w, p.locality),
      explanation:
        'Raised because modelled peak inflow exceeds assessed discharge capacity on more than one reach while desilting completion remains under the departmental target. Both conditions have held for three consecutive assessment cycles.',
      severityBase: 'high',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['monsoon', 'stormwater', 'roads'],
      citizensAffectedFactor: 0.18,
      actions: [
        {
          title: t('Complete outstanding desilting on identified reaches'),
          rationale: t('Discharge capacity recovers materially once accumulated silt is removed from the three reaches flagged below target.'),
          expectedImpact: t('Restores an estimated 18–24% of design discharge capacity on the affected reaches.'),
          effort: 'medium',
          horizon: '7-days',
          dependencies: [t('Contractor mobilisation'), t('Traffic clearance for machinery access')],
          risks: [t('Rain during works may reduce achievable progress')],
          confidence: 'high',
        },
        {
          title: t('Pre-position two additional dewatering pumps'),
          rationale: t('Standby dewatering capacity shortens clearance time at chronic locations when discharge capacity is constrained.'),
          expectedImpact: t('Reduces modelled clearance time at chronic spots by approximately 35 minutes.'),
          effort: 'low',
          horizon: '24-hours',
          dependencies: [t('Pump availability from the central pool')],
          risks: [t('Diverts resources from other wards if the outlook changes')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'waterlogging-recurrence',
      type: 'anomaly',
      domain: 'monsoon',
      departmentId: 'dept-stormwater',
      applies: floodProne,
      title: (w) => t('Repeat waterlogging at locations previously reported mitigated in {0}', w),
      description: (w, p) =>
        t('Two locations in {0} recorded as mitigated in the previous pre-monsoon cycle - at {1} and {2} - have logged waterlogging events again this season, indicating the recorded mitigation has not held.', w, p.locality, p.neighbour),
      explanation:
        'Flagged because the location appears in the mitigated register while also appearing in current-season waterlogging reports. This is a data-consistency and works-effectiveness signal, not an assertion of wrongdoing.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'correlation-engine',
      contributingDomains: ['monsoon', 'projects', 'stormwater'],
      citizensAffectedFactor: 0.06,
      actions: [
        {
          title: t('Re-inspect both locations and reconcile the mitigation register'),
          rationale: t('The register and field condition disagree; the register must be corrected before the next preparedness assessment.'),
          expectedImpact: t('Restores confidence in preparedness reporting for the ward.'),
          effort: 'low',
          horizon: '7-days',
          dependencies: [t('Ward engineering staff availability')],
          risks: [t('None material')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'pump-availability',
      type: 'asset-failure',
      domain: 'stormwater',
      departmentId: 'dept-stormwater',
      applies: floodProne,
      title: (w) => t('Pumping capacity below operational threshold in {0}', w),
      description: (w, p) =>
        t('Operational pump availability at the storm-water pumping station at {0}, serving {1}, has fallen below the departmental readiness threshold, with one unit out of service pending a mechanical repair.', p.locality, w),
      explanation:
        'Raised when operational pumps fall below 80% of installed capacity at a station serving a flood-prone ward during the monsoon window.',
      severityBase: 'high',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['stormwater', 'monsoon', 'assets'],
      citizensAffectedFactor: 0.12,
      actions: [
        {
          title: t('Expedite the outstanding mechanical repair'),
          rationale: t('Restoring the out-of-service unit returns the station to full installed capacity ahead of the next high-intensity window.'),
          expectedImpact: t('Returns station availability to 100% of installed capacity.'),
          effort: 'medium',
          horizon: '24-hours',
          dependencies: [t('Spare availability'), t('Contractor attendance')],
          risks: [t('Spare lead time may exceed the repair window')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'water-nrw',
      type: 'anomaly',
      domain: 'water',
      departmentId: 'dept-hydraulic',
      title: (w) => t('Non-revenue water divergence in the distribution zone serving {0}', w),
      description: (w) =>
        t('Zonal non-revenue water in the distribution zone serving {0} has risen against the trailing quarter without a corresponding change in assessed consumption, indicating possible network loss requiring investigation.', w),
      explanation:
        'Raised when the difference between bulk input and billed consumption moves more than two standard deviations from the zone baseline over four consecutive weeks.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'model',
      contributingDomains: ['water', 'assets', 'revenue'],
      citizensAffectedFactor: 0.04,
      actions: [
        {
          title: t('Commission a district metered area survey for the affected zone'),
          rationale: t('Sub-zonal metering localises loss to specific network sections rather than the zone as a whole.'),
          expectedImpact: t('Localises the divergence to a network section within 14 days.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Metering equipment availability'), t('Night-flow survey window')],
          risks: [t('Survey accuracy is reduced where supply hours are irregular')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'water-pressure',
      type: 'service-deterioration',
      domain: 'water',
      departmentId: 'dept-hydraulic',
      applies: dense,
      title: (w) => t('Sustained low-pressure supply affecting tail-end areas of {0}', w),
      description: (w, p) =>
        t('Network pressure at tail-end monitoring points in {0}, worst at {1}, has remained below the service standard through the supply window for six consecutive days, with a corresponding rise in tanker dependency.', w, p.locality),
      explanation:
        'Raised when tail-end pressure remains below the service standard for more than five consecutive supply cycles and tanker trips increase in the same area.',
      severityBase: 'high',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['water', 'wards'],
      citizensAffectedFactor: 0.22,
      actions: [
        {
          title: t('Rebalance the zonal supply schedule and verify valve settings'),
          rationale: t('Tail-end pressure is frequently recoverable through schedule rebalancing before capital intervention is considered.'),
          expectedImpact: t('Modelled recovery of 2–4 m head at tail-end points within one supply cycle.'),
          effort: 'low',
          horizon: '24-hours',
          dependencies: [t('Zonal engineer availability')],
          risks: [t('May reduce pressure in adjoining areas - monitor both')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'waste-missed',
      type: 'sla-breach',
      domain: 'waste',
      departmentId: 'dept-solid-waste',
      title: (w) => t('Collection coverage below standard on three consecutive rounds in {0}', w),
      description: (w, p) =>
        t('Door-to-door collection coverage in {0} has fallen below the departmental standard on three consecutive rounds, concentrated on two routes serving {1} and {2} where vehicle availability has been irregular.', w, p.locality, p.neighbour),
      explanation:
        'Raised when route adherence falls below the standard on three consecutive rounds for the same route pair, distinguishing systemic shortfall from single-day disruption.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['waste', 'wards', 'health'],
      citizensAffectedFactor: 0.14,
      actions: [
        {
          title: t('Reallocate two vehicles from the zonal reserve to the affected routes'),
          rationale: t('Coverage shortfall correlates with vehicle availability rather than crew strength on these routes.'),
          expectedImpact: t('Restores coverage to standard within two collection cycles.'),
          effort: 'low',
          horizon: 'immediate',
          dependencies: [t('Zonal transport reserve availability')],
          risks: [t('Reduces reserve capacity for other wards')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'waste-hotspot',
      type: 'service-deterioration',
      domain: 'waste',
      departmentId: 'dept-solid-waste',
      applies: dense,
      title: (w, p) => t('Recurring waste accumulation hotspot persisting at {0} in {1}', p.locality, w),
      description: (w, p) =>
        t('A single location at {0} in {1} has generated repeat accumulation reports across six weeks despite scheduled clearance, indicating a mismatch between the collection schedule and actual generation at that point.', p.locality, w),
      explanation:
        'Raised where a location generates repeat reports at a rate more than three times the ward median while remaining on the standard collection schedule.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'correlation-engine',
      contributingDomains: ['waste', 'health'],
      citizensAffectedFactor: 0.05,
      actions: [
        {
          title: t('Increase clearance frequency and assess a secondary collection point'),
          rationale: t('Persistent recurrence under a standard schedule usually indicates under-provisioned frequency rather than crew performance.'),
          expectedImpact: t('Modelled reduction of repeat reports by 60% over four weeks.'),
          effort: 'low',
          horizon: '7-days',
          dependencies: [t('Route schedule amendment')],
          risks: [t('Additional round increases route time; monitor downstream stops')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'road-defect-cluster',
      type: 'risk',
      domain: 'roads',
      departmentId: 'dept-roads',
      title: (w, p) => t('Defect concentration on the {0} emergency access route in {1}', p.corridor, w),
      description: (w, p) =>
        t('Surface defects on the {0}, a designated emergency access route in {1}, have accumulated beyond the departmental threshold, with the corridor forming the primary approach to a major hospital.', p.corridor, w),
      explanation:
        'Raised when defect density on a segment classified as an emergency route exceeds threshold and the segment carries hospital access. Both factors raise the priority weighting.',
      severityBase: 'high',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['roads', 'hospitals', 'emergency'],
      citizensAffectedFactor: 0.09,
      actions: [
        {
          title: t('Issue a priority work order for corridor rectification'),
          rationale: t('Emergency route status and hospital access together place this segment in the highest priority band of the defect engine.'),
          expectedImpact: t('Restores corridor condition index above the emergency-route minimum.'),
          effort: 'medium',
          horizon: '7-days',
          dependencies: [t('Contractor availability'), t('Night-working permission')],
          risks: [t('Night working constrained by residential proximity')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'road-repeat-failure',
      type: 'anomaly',
      domain: 'roads',
      departmentId: 'dept-roads',
      title: (w) => t('Repeat surface failure on a recently rectified segment in {0}', w),
      description: (w, p) =>
        t('A road segment at {0} in {1}, rectified within the defect liability period, has recorded fresh surface failures, warranting a technical review of the rectification and the liability position.', p.locality, w),
      explanation:
        'Raised where new defects are recorded on a segment inside its defect liability period. This is a quality-assurance signal requiring technical assessment, not a finding against the contractor.',
      severityBase: 'medium',
      classification: 'confidential',
      generator: 'correlation-engine',
      contributingDomains: ['roads', 'procurement', 'projects'],
      citizensAffectedFactor: 0.03,
      actions: [
        {
          title: t('Commission a technical assessment before determining liability'),
          rationale: t('Repeat failure may result from workmanship, utility cutting or drainage; the cause must be established before any liability position is taken.'),
          expectedImpact: t('Establishes cause and the correct rectification route within 14 days.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Third-party testing laboratory availability')],
          risks: [t('Testing may be inconclusive if the failure surface is disturbed')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'health-vector',
      type: 'health-warning',
      domain: 'health',
      departmentId: 'dept-health',
      applies: (w) => floodProne(w) || dense(w),
      title: (w) => t('Vector-borne indicator rising above the seasonal band in {0}', w),
      description: (w, p) =>
        t('Aggregate reported cases of vector-borne illness in {0} have moved above the seasonal band for two consecutive reporting periods, coinciding with elevated water stagnation reports in the {1} cluster.', w, p.locality),
      explanation:
        'Raised when aggregate case counts exceed the seasonal band for two consecutive periods. Correlation with stagnation reports is contextual only - correlation does not establish causation.',
      severityBase: 'high',
      classification: 'confidential',
      generator: 'model',
      contributingDomains: ['health', 'monsoon', 'waste'],
      citizensAffectedFactor: 0.02,
      actions: [
        {
          title: t('Intensify vector control operations in the identified locality cluster'),
          rationale: t('Targeted intensification in the specific cluster is more effective than uniform ward-wide activity.'),
          expectedImpact: t('Historical comparable interventions reduced the indicator within three reporting periods.'),
          effort: 'medium',
          horizon: '7-days',
          dependencies: [t('Vector control staff availability'), t('Insecticide stock')],
          risks: [t('Effect is lagged; the indicator may rise before it falls')],
          confidence: 'medium',
        },
        {
          title: t('Clear standing water at the co-located stagnation reports'),
          rationale: t('Removing breeding sites addresses a plausible contributing factor while the epidemiological assessment continues.'),
          expectedImpact: t('Removes identified breeding sites within the cluster.'),
          effort: 'low',
          horizon: '24-hours',
          dependencies: [t('Ward sanitation crew')],
          risks: [t('None material')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'hospital-capacity',
      type: 'risk',
      domain: 'hospitals',
      departmentId: 'dept-hospitals',
      title: (w) => t('Critical care occupancy approaching capacity at the facility serving {0}', w),
      description: (w) =>
        t('Critical care occupancy at the major facility serving {0} has held above 88% for four consecutive days with emergency presentations also elevated, reducing surge headroom.', w),
      explanation:
        'Raised when critical care occupancy exceeds 85% for more than three consecutive days while emergency load is simultaneously above its trailing median.',
      severityBase: 'high',
      classification: 'confidential',
      generator: 'rule-engine',
      contributingDomains: ['hospitals', 'health', 'emergency'],
      citizensAffectedFactor: 0.01,
      actions: [
        {
          title: t('Activate the inter-facility referral protocol for elective critical care'),
          rationale: t('Referral of elective critical care preserves surge headroom for emergency presentations.'),
          expectedImpact: t('Recovers an estimated 6–9% of critical care headroom.'),
          effort: 'low',
          horizon: 'immediate',
          dependencies: [t('Receiving facility confirmation')],
          risks: [t('Transfer burden on receiving facilities')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'project-schedule',
      type: 'project-delay',
      domain: 'projects',
      departmentId: 'dept-projects',
      title: (w) => t('Schedule variance exceeding tolerance on a capital work in {0}', w),
      description: (w, p) =>
        t('A capital work at {0} in {1} has accumulated schedule variance beyond the departmental tolerance, with two consecutive milestones slipped and physical progress trailing financial progress.', p.locality, w),
      explanation:
        'Raised when schedule variance exceeds tolerance and payment progress leads physical progress by more than 12 percentage points across two reporting cycles.',
      severityBase: 'high',
      classification: 'confidential',
      generator: 'rule-engine',
      contributingDomains: ['projects', 'procurement', 'budget'],
      citizensAffectedFactor: 0.07,
      actions: [
        {
          title: t('Convene a milestone recovery review with the executing agency'),
          rationale: t('Two consecutive slippages indicate a structural constraint that a recovery plan must address explicitly.'),
          expectedImpact: t('Produces a dated recovery plan with revised milestone commitments.'),
          effort: 'low',
          horizon: '7-days',
          dependencies: [t('Executing agency attendance'), t('Site engineer report')],
          risks: [t('Recovery plans without resource change frequently slip again')],
          confidence: 'high',
        },
        {
          title: t('Hold further payment release pending physical verification'),
          rationale: t('Payment progress leading physical progress requires verification before further release. This is a control step, not a finding.'),
          expectedImpact: t('Realigns financial and physical progress.'),
          effort: 'low',
          horizon: 'immediate',
          dependencies: [t('Site measurement by the executive engineer')],
          risks: [t('May affect contractor cash flow - assess before applying')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'budget-variance',
      type: 'revenue-exception',
      domain: 'budget',
      departmentId: 'dept-finance',
      title: (w) => t('Capital expenditure trailing the phased plan for works in {0}', w),
      description: (w) =>
        t('Capital expenditure booked against works in {0} is materially behind the phased plan for the year to date, placing the annual utilisation target at risk.', w),
      explanation:
        'Raised where booked plus committed expenditure trails the phased plan by more than 15 percentage points at the reporting date.',
      severityBase: 'medium',
      classification: 'confidential',
      generator: 'rule-engine',
      contributingDomains: ['budget', 'projects'],
      actions: [
        {
          title: t('Review the works programme and re-phase realistically'),
          rationale: t('Where under-spend results from delivery constraints rather than accounting lag, the phasing itself requires correction.'),
          expectedImpact: t('Produces a defensible revised phasing for the remainder of the year.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Departmental works programme review')],
          risks: [t('Re-phasing may surface an implicit reduction in annual delivery')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'revenue-collection',
      type: 'revenue-exception',
      domain: 'revenue',
      departmentId: 'dept-assessment',
      title: (w) => t('Property tax collection efficiency below the ward cohort in {0}', w),
      description: (w) =>
        t('Collection efficiency in {0} is materially below comparable wards for the year to date, with arrears concentrated in a small number of large assessments.', w),
      explanation:
        'Raised where collection efficiency is more than one standard deviation below the cohort of demographically comparable wards.',
      severityBase: 'medium',
      classification: 'confidential',
      generator: 'model',
      contributingDomains: ['revenue', 'property'],
      actions: [
        {
          title: t('Initiate structured recovery engagement on the largest arrears'),
          rationale: t('Arrears concentration means a small number of engagements addresses the majority of the shortfall.'),
          expectedImpact: t('Modelled recovery of 30–45% of the concentrated arrears within the quarter.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Assessment records reconciliation')],
          risks: [t('Disputed assessments may require adjudication before recovery')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'revenue-anomaly',
      type: 'anomaly',
      domain: 'revenue',
      departmentId: 'dept-assessment',
      title: (w) => t('Assessment pattern requiring reconciliation in {0}', w),
      description: (w, p) =>
        t('A cohort of assessments at {0} in {1} shows a capital-value pattern inconsistent with comparable properties in the same locality. This is an anomaly requiring reconciliation - it is not an allegation of any kind.', p.locality, w),
      explanation:
        'Raised by statistical comparison against locality comparables. An anomaly indicates a pattern worth checking; it does not indicate fraud, error or wrongdoing by any person.',
      severityBase: 'medium',
      classification: 'restricted',
      generator: 'model',
      contributingDomains: ['revenue', 'property'],
      actions: [
        {
          title: t('Refer the cohort for assessment reconciliation'),
          rationale: t('Reconciliation establishes whether the pattern reflects genuine property characteristics or a recording issue.'),
          expectedImpact: t('Resolves the anomaly to either a valid explanation or a correction.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Assessment records'), t('Site verification where required')],
          risks: [t('Premature characterisation of an anomaly as an irregularity would be improper')],
          confidence: 'low',
        },
      ],
    },
    {
      key: 'procurement-extension',
      type: 'anomaly',
      domain: 'procurement',
      departmentId: 'dept-procurement',
      title: (w) => t('Repeated contract extension pattern on works in {0}', w),
      description: (w) =>
        t('A contract covering works in {0} has received a third time extension. Repeated extension is a delivery-risk indicator warranting review of the original programme assumptions.', w),
      explanation:
        'Raised at the third extension on a single contract. This indicates delivery risk and a possible planning issue. It is not a finding of impropriety against any party.',
      severityBase: 'medium',
      classification: 'confidential',
      generator: 'rule-engine',
      contributingDomains: ['procurement', 'projects'],
      actions: [
        {
          title: t('Review the original programme assumptions before further extension'),
          rationale: t('Repeated extension usually signals that the original programme was not achievable, which affects future tendering.'),
          expectedImpact: t('Improves realism of programme assumptions in comparable future tenders.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Contract file review')],
          risks: [t('None material')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'contractor-concentration',
      type: 'risk',
      domain: 'procurement',
      departmentId: 'dept-procurement',
      title: () => t('Delivery concentration across a single vendor in one category'),
      description: () =>
        t('A single empanelled vendor holds a high share of active contracts in one procurement category, creating delivery-continuity exposure if that vendor underperforms.'),
      explanation:
        'Raised on category concentration exceeding the departmental threshold. This is a delivery-continuity risk indicator; it makes no assertion about how contracts were awarded.',
      severityBase: 'medium',
      classification: 'confidential',
      generator: 'rule-engine',
      contributingDomains: ['procurement', 'projects'],
      actions: [
        {
          title: t('Assess continuity exposure and widen the empanelled pool'),
          rationale: t('Concentration is a continuity risk irrespective of vendor performance; a wider pool reduces single-point exposure.'),
          expectedImpact: t('Reduces category concentration below the departmental threshold over two cycles.'),
          effort: 'high',
          horizon: '30-days',
          dependencies: [t('Empanelment cycle timing')],
          risks: [t('Widening the pool may reduce average delivery performance initially')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'sewerage-overflow',
      type: 'service-deterioration',
      domain: 'sewerage',
      departmentId: 'dept-sewerage',
      applies: dense,
      title: (w) => t('Sewer overflow events clustering in {0}', w),
      description: (w, p) =>
        t('Overflow events on the trunk sewer network serving {0} have clustered over the past fortnight, concentrated at two manhole locations near {1} with a history of blockage.', w, p.locality),
      explanation:
        'Raised when overflow reports at the same nodes exceed three in a fortnight, indicating a structural rather than incidental blockage pattern.',
      severityBase: 'high',
      classification: 'internal',
      generator: 'correlation-engine',
      contributingDomains: ['sewerage', 'health'],
      citizensAffectedFactor: 0.08,
      actions: [
        {
          title: t('Undertake CCTV survey of the affected trunk reach'),
          rationale: t('Repeat blockage at fixed nodes typically indicates a structural defect or persistent obstruction requiring visual survey.'),
          expectedImpact: t('Identifies the structural cause within seven days.'),
          effort: 'medium',
          horizon: '7-days',
          dependencies: [t('CCTV survey unit availability')],
          risks: [t('Survey requires flow control, causing temporary local disruption')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'building-dilapidation',
      type: 'risk',
      domain: 'buildings',
      departmentId: 'dept-building',
      title: (w) => t('Structures with overdue structural audit in {0}', w),
      description: (w, p) =>
        t('A cohort of ageing structures in {0} has passed the statutory structural audit due date without a completed audit, concentrated in buildings over 40 years old around {1}.', w, p.locality),
      explanation:
        'Raised where the structural audit due date has passed without a completed audit for structures above the statutory age threshold.',
      severityBase: 'high',
      classification: 'confidential',
      generator: 'rule-engine',
      contributingDomains: ['buildings', 'emergency'],
      citizensAffectedFactor: 0.02,
      actions: [
        {
          title: t('Issue audit compliance notices and schedule ward inspections'),
          rationale: t('Overdue audits represent an unquantified life-safety exposure that cannot be assessed until the audits are completed.'),
          expectedImpact: t('Brings the overdue cohort into the assessed population within the quarter.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Empanelled structural auditor capacity')],
          risks: [t('Notice issue may generate representations requiring adjudication')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'environment-air',
      type: 'forecast',
      domain: 'environment',
      departmentId: 'dept-environment',
      title: (w) => t('Air quality deterioration indicated for {0} over the next 72 hours', w),
      description: (w, p) =>
        t('Meteorological conditions combined with local construction activity around {0} indicate a deterioration in air quality in {1} over the next 72 hours, with particulate levels likely to move into the poor band.', p.locality, w),
      explanation:
        'Forecast produced by combining the meteorological outlook with active construction and road works in the ward. Forecast, not measurement.',
      severityBase: 'medium',
      classification: 'public',
      generator: 'model',
      contributingDomains: ['environment', 'roads', 'health'],
      citizensAffectedFactor: 0.3,
      actions: [
        {
          title: t('Enforce dust mitigation at active construction sites'),
          rationale: t('Local construction is the largest modifiable contributor over a 72-hour window.'),
          expectedImpact: t('Modelled reduction of 8–14% in local particulate contribution.'),
          effort: 'medium',
          horizon: '24-hours',
          dependencies: [t('Ward enforcement staff')],
          risks: [t('Meteorological contribution is not modifiable')],
          confidence: 'low',
        },
      ],
    },
    {
      // The water-body protection signal. `dept-coastal` is the identifier every
      // corporation's water-body cell carries, whatever that cell is called
      // locally, so this family stays populated on an inland corporation too -
      // framed around its own bunds and catchment rather than a shoreline it
      // does not have.
      key: 'coastal-erosion',
      type: 'risk',
      domain: 'coastal',
      departmentId: 'dept-coastal',
      applies: (w) => waterEdge(w, medianSpots),
      title: (w) => t('{0} condition deteriorating in {1}', edge.protection, w),
      description: (w, p) =>
        t('Survey observations along {0} at {1} in {2} indicate deterioration in {3} condition at two reaches ahead of the {4}.', edge.frontage, p.locality, w, edge.asset, edge.peakWindow),
      explanation:
        'Raised on survey condition scores falling below the maintenance threshold at reaches classified as protecting occupied land.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'analyst',
      contributingDomains: ['coastal', 'monsoon'],
      citizensAffectedFactor: 0.04,
      actions: [
        {
          title: t('Programme reach repairs ahead of the {0}', edge.repairWindow),
          rationale: t('Repair effectiveness is materially higher when completed before, rather than during, the {0}.', edge.peakWindow),
          expectedImpact: t('Restores protection condition above the maintenance threshold at both reaches.'),
          effort: 'high',
          horizon: '30-days',
          dependencies: [edge.clearance, t('Contractor mobilisation')],
          risks: [t('Clearance timelines may exceed the available works window')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'mobility-congestion',
      type: 'service-deterioration',
      domain: 'mobility',
      departmentId: 'dept-mobility',
      title: (w, p) => t('Corridor speed degradation on the {0} through {1}', p.corridor, w),
      description: (w, p) =>
        t('Peak-hour speeds on the {0}, a primary route through {1}, have degraded against the trailing quarter, coinciding with an active utility trench and two signal outages.', p.corridor, w),
      explanation:
        'Raised when peak speed falls more than 15% against the trailing quarter with a concurrent works or signal condition on the same corridor.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'correlation-engine',
      contributingDomains: ['mobility', 'roads'],
      citizensAffectedFactor: 0.25,
      actions: [
        {
          title: t('Restore signal operation and compress the trench programme'),
          rationale: t('Signal restoration is immediate and low-cost; trench compression addresses the larger contribution.'),
          expectedImpact: t('Modelled recovery of 6–11% of peak-hour speed.'),
          effort: 'medium',
          horizon: '7-days',
          dependencies: [t('Signal maintenance contractor'), t('Utility agency coordination')],
          risks: [t('Utility agency programme is outside municipal control')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'asset-condition',
      type: 'asset-failure',
      domain: 'assets',
      departmentId: 'dept-estates',
      title: (w) => t('Municipal assets past design life without replacement programme in {0}', w),
      description: (w) =>
        t('Several municipal assets in {0} have passed their design life with condition indices below threshold and no replacement entry in the capital programme.', w),
      explanation:
        'Raised where an asset is past design life, has a condition index below threshold and no capital programme entry - a three-condition rule.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['assets', 'budget', 'planning'],
      actions: [
        {
          title: t('Enter the assets into the next capital programme cycle'),
          rationale: t('Assets past design life without a programme entry accumulate unquantified failure risk each year.'),
          expectedImpact: t('Brings the cohort into the funded replacement pipeline.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Capital programme cycle timing'), t('Budget headroom')],
          risks: [t('Programme competition may defer lower-criticality assets')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'workforce-strain',
      type: 'risk',
      domain: 'workforce',
      departmentId: 'dept-personnel',
      title: (w) => t('Field cadre vacancy affecting service response in {0}', w),
      description: (w) =>
        t('Deployed field strength in {0} is materially below sanctioned across two cadres, coinciding with a rise in average complaint resolution time.', w),
      explanation:
        'Raised when deployed strength falls below 80% of sanctioned in a cadre while the resolution-time indicator for the same service deteriorates.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'correlation-engine',
      contributingDomains: ['workforce', 'wards'],
      actions: [
        {
          title: t('Authorise temporary deployment from the zonal reserve'),
          rationale: t('Temporary deployment addresses the immediate service effect while recruitment proceeds on its own timescale.'),
          expectedImpact: t('Restores deployed strength above 90% of sanctioned within two weeks.'),
          effort: 'low',
          horizon: '7-days',
          dependencies: [t('Zonal reserve availability')],
          risks: [t('Reduces reserve capacity elsewhere in the zone')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'cross-domain-flood-access',
      type: 'cross-domain',
      domain: 'monsoon',
      departmentId: 'dept-disaster',
      applies: (w) => floodProne(w) && highRisk(w),
      title: (w) => t('Integrated urban risk: rainfall, drainage, road condition and hospital access in {0}', w),
      description: (w, p) =>
        t('Combining the rainfall outlook, drain capacity, road condition and hospital location for {0} produces an integrated exposure in which the primary hospital approach through {1} is at risk of becoming impassable under {2}.', w, p.locality, edge.coincidence),
      explanation:
        'Produced by the correlation engine from six domain inputs - rainfall, drain capacity, road condition, hospital location, traffic and ward vulnerability. No single domain view surfaces this exposure on its own.',
      severityBase: 'critical',
      classification: 'confidential',
      generator: 'correlation-engine',
      contributingDomains: ['monsoon', 'stormwater', 'roads', 'hospitals', 'mobility', 'wards'],
      citizensAffectedFactor: 0.34,
      actions: [
        {
          title: t('Designate and pre-clear an alternate hospital approach route'),
          rationale: t('An alternate approach removes the single-route dependency that produces the integrated exposure.'),
          expectedImpact: t('Maintains hospital access under the modelled coincidence scenario.'),
          effort: 'medium',
          horizon: '24-hours',
          dependencies: [t('Traffic police coordination'), t('Route condition verification')],
          risks: [t('Alternate route capacity is lower - assess for ambulance access only')],
          confidence: 'medium',
        },
        {
          title: t('Pre-position dewatering capacity at the primary approach'),
          rationale: t('Dewatering at the constraint point directly addresses the mechanism by which access is lost, which is that {0}.', edge.blockedOutfall),
          expectedImpact: t('Reduces modelled access-loss duration by an estimated 45 minutes.'),
          effort: 'medium',
          horizon: 'immediate',
          dependencies: [t('Pump availability'), t('Deployment crew')],
          risks: [t('Competing demand from other flood-prone wards')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'cross-domain-delivery',
      type: 'cross-domain',
      domain: 'projects',
      departmentId: 'dept-projects',
      title: (w) => t('Integrated service-delivery signal linking complaints, project delay and payment progress in {0}', w),
      description: (w, p) =>
        t('Rising complaints, a delayed capital work, repeated road defects on the {0} alignment and payment progress running ahead of physical progress in {1} together form a service-delivery review candidate.', p.corridor, w),
      explanation:
        'Produced by correlating five independent signals on the same geography and contract. This identifies a review candidate. It is not a finding, an allegation, or an assertion of impropriety by any party.',
      severityBase: 'high',
      classification: 'restricted',
      generator: 'correlation-engine',
      contributingDomains: ['projects', 'roads', 'procurement', 'wards', 'budget'],
      citizensAffectedFactor: 0.11,
      actions: [
        {
          title: t('Constitute a joint technical and financial review'),
          rationale: t('The signals span engineering and finance; a joint review avoids each function assessing only its own fragment.'),
          expectedImpact: t('Produces a single consolidated position within 21 days.'),
          effort: 'medium',
          horizon: '30-days',
          dependencies: [t('Chief Engineer and Chief Accountant nomination')],
          risks: [t('Review findings must not be pre-judged by the correlation itself')],
          confidence: 'medium',
        },
      ],
    },
    {
      key: 'emergency-response',
      type: 'risk',
      domain: 'emergency',
      departmentId: 'dept-fire',
      title: (w) => t('Response time drift in the fire station catchment covering {0}', w),
      description: (w, p) =>
        t('Average response time in the catchment covering {0}, worked from the station at {1}, has drifted above the service standard across the last 30 days, with vehicle availability reduced by scheduled maintenance.', w, p.locality),
      explanation:
        'Raised when the 30-day average response time exceeds the standard and vehicle availability is concurrently below full strength.',
      severityBase: 'high',
      classification: 'internal',
      generator: 'rule-engine',
      contributingDomains: ['emergency', 'mobility', 'roads'],
      citizensAffectedFactor: 0.15,
      actions: [
        {
          title: t('Re-sequence scheduled maintenance and confirm mutual aid cover'),
          rationale: t('Availability rather than crewing is the binding constraint; maintenance sequencing is directly controllable.'),
          expectedImpact: t('Restores catchment availability to full strength within seven days.'),
          effort: 'low',
          horizon: '7-days',
          dependencies: [t('Workshop scheduling'), t('Adjacent station confirmation')],
          risks: [t('Deferred maintenance carries its own reliability risk')],
          confidence: 'high',
        },
      ],
    },
    {
      key: 'planning-service-gap',
      type: 'forecast',
      domain: 'planning',
      departmentId: 'dept-planning',
      title: (w) => t('Projected infrastructure adequacy shortfall in {0}', w),
      description: (w, p) =>
        t('Projected population growth in {0} outpaces committed infrastructure capacity in water and sewerage over the five-year horizon, with the supply drawn from {1} already fully committed. This indicates a planning gap requiring capital consideration.', w, p.water),
      explanation:
        'Produced by projecting demand from population growth against committed capacity in the capital programme. A projection, not a measurement.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'model',
      contributingDomains: ['planning', 'water', 'sewerage', 'budget'],
      actions: [
        {
          title: t('Include the capacity gap in the next capital planning cycle'),
          rationale: t('Capacity lead times exceed the horizon at which the shortfall would become operationally visible.'),
          expectedImpact: t('Places the shortfall into the funded planning pipeline.'),
          effort: 'high',
          horizon: '30-days',
          dependencies: [t('Capital planning cycle'), t('Demand study validation')],
          risks: [t('Projection sensitivity to growth assumptions is material')],
          confidence: 'low',
        },
      ],
    },
    {
      key: 'ai-recommendation-resource',
      type: 'ai-recommendation',
      domain: 'monsoon',
      departmentId: 'dept-disaster',
      applies: floodProne,
      title: (w) => t('Recommended pre-positioning of dewatering resources in {0}', w),
      description: (w, p) =>
        t('Analysis of chronic waterlogging locations, current drain condition and the rainfall outlook supports pre-positioning additional dewatering capacity in {0}, at {1}, ahead of the forecast window.', w, p.locality),
      explanation:
        'Generated by the governed AI layer from structured platform evidence. The recommendation is advisory and requires a named officer to approve before any deployment occurs.',
      severityBase: 'medium',
      classification: 'internal',
      generator: 'model',
      contributingDomains: ['monsoon', 'stormwater', 'disaster'],
      actions: [
        {
          title: t('Approve pre-positioning of two additional dewatering units'),
          rationale: t('Chronic location density and current drain condition together justify additional standby capacity for this window.'),
          expectedImpact: t('Modelled reduction in clearance time of 30–50 minutes at chronic locations.'),
          effort: 'low',
          horizon: '24-hours',
          dependencies: [t('Central pump pool availability'), t('Deployment crew')],
          risks: [t('Resource is unavailable to other wards while deployed')],
          confidence: 'medium',
        },
      ],
    },
  ]
}

/** ---------------------------------------------------------------------
 * Instantiation
 * ------------------------------------------------------------------- */

const STATUSES: IntelligenceStatus[] = ['new', 'reviewed', 'assigned', 'in-progress', 'resolved', 'verified', 'closed']

/**
 * Floors that keep the operational surfaces legible on the smallest
 * corporation in the register. The feed is otherwise proportional to the
 * corporation's own ward count, which is what stops a five-ward corporation
 * carrying a Brihanmumbai-sized backlog.
 */
const MIN_INTELLIGENCE_ITEMS = 12
const MIN_ALERTS = 8

/** Share of a corporation's wards a single template is raised against. */
const TEMPLATE_WARD_SHARE = 0.3

function adjustSeverity(base: Severity, wardRisk: number, seed: string): Severity {
  const r = det(`sev:${seed}`)
  const ladder: Severity[] = ['info', 'low', 'medium', 'high', 'critical']
  let idx = ladder.indexOf(base)
  if (wardRisk >= 66 && r.chance(0.45)) idx += 1
  if (wardRisk <= 34 && r.chance(0.4)) idx -= 1
  return ladder[Math.min(ladder.length - 1, Math.max(0, idx))] as Severity
}

function pickConfidence(generator: IntelligenceGenerator, seed: string): ConfidenceLevel {
  const r = det(`conf:${seed}`)
  if (generator === 'rule-engine') return r.weighted([['high', 6], ['medium', 3], ['low', 1]] as const)
  if (generator === 'analyst') return r.weighted([['high', 4], ['medium', 5], ['low', 1]] as const)
  if (generator === 'correlation-engine') return r.weighted([['high', 2], ['medium', 6], ['low', 2]] as const)
  return r.weighted([['high', 2], ['medium', 5], ['low', 3]] as const)
}

/**
 * The places a single item's narrative names. Drawn from the corporation's own
 * published localities and water bodies; where it publishes none, `./naming.ts`
 * returns a plainly constructed sector or source label rather than borrowing a
 * real place from somewhere else.
 */
function placeFor(seed: string): PlaceContext {
  const locality = localityFor(seed)
  const firstAlternate = localityFor(`${seed}:neighbour`)
  const neighbour = firstAlternate === locality ? localityFor(`${seed}:neighbour-alt`) : firstAlternate
  return {
    locality,
    neighbour,
    corridor: landmarkName(`${seed}:corridor`, 'Corridor'),
    water: waterSourceNames(1)[0] ?? t('the principal source'),
  }
}

/** The wards a template's selection predicate admits, or all of them. */
function eligibleFor(template: IntelTemplate): Ward[] {
  return WARDS.filter((w) => (template.applies ? template.applies(w.id) : true))
}

function buildItems(): IntelligenceItem[] {
  const templates = intelTemplates()
  const pairs: Array<{ template: IntelTemplate; ward: Ward }> = []
  const taken = new Set<string>()

  for (const template of templates) {
    const eligible = eligibleFor(template)
    if (eligible.length === 0) continue
    const r = det(`tmpl:${template.key}`)

    // Three to seven instances was the Brihanmumbai figure across 24 wards.
    // Holding the same share of the corporation's own wards keeps the feed's
    // density per ward comparable instead of crowding a small corporation.
    const instanceCount = Math.max(
      1,
      Math.min(eligible.length, r.int(3, 7), Math.round(eligible.length * TEMPLATE_WARD_SHARE)),
    )

    for (const ward of r.sample(eligible, instanceCount)) {
      pairs.push({ template, ward })
      taken.add(`${template.key}:${ward.id}`)
    }
  }

  // Floor pass. A corporation with very few wards, or one whose wards fail most
  // selection predicates, must still open onto a populated feed rather than an
  // empty state that reads as a broken deployment.
  for (const template of templates) {
    if (pairs.length >= MIN_INTELLIGENCE_ITEMS) break
    for (const ward of eligibleFor(template)) {
      if (pairs.length >= MIN_INTELLIGENCE_ITEMS) break
      const key = `${template.key}:${ward.id}`
      if (taken.has(key)) continue
      pairs.push({ template, ward })
      taken.add(key)
    }
  }

  const items: IntelligenceItem[] = pairs.map(({ template, ward }, index) => {
    const id = `int-${String(index + 1).padStart(4, '0')}`
    const seed = `${template.key}:${ward.id}`
    const ir = det(`intel:${seed}`)
    const severity = adjustSeverity(template.severityBase, ward.riskScore, seed)
    const status = ir.weighted([
      ['new', 5],
      ['reviewed', 3],
      ['assigned', 3],
      ['in-progress', 3],
      ['resolved', 2],
      ['verified', 1],
      ['closed', 1],
    ] as const satisfies ReadonlyArray<readonly [IntelligenceStatus, number]>)
    const minutesAgo = ir.int(35, 60 * 24 * 12)
    const wardLabel = wardName(ward.id)
    const place = placeFor(seed)

    // Evidence is chosen from the ward's own records where possible so the
    // provenance chain is coherent when opened.
    const wardEvidence = EVIDENCE_ITEMS.filter((e) => e.wardIds.includes(ward.id))
    const evidencePool = wardEvidence.length >= 3 ? wardEvidence : EVIDENCE_ITEMS
    const evidenceIds = ir.sample(evidencePool, ir.int(2, 4)).map((e) => e.id)

    return {
      id,
      tenantId: TENANT_ID,
      title: template.title(wardLabel, place),
      description: template.description(wardLabel, place),
      explanation: template.explanation,
      type: template.type,
      domain: template.domain,
      severity,
      confidence: pickConfidence(template.generator, seed),
      wardIds: [ward.id],
      departmentId: template.departmentId,
      evidenceIds,
      recommendedActions: template.actions.map((a, ai) => ({
        ...a,
        id: `${id}-ra-${ai + 1}`,
        departmentId: template.departmentId,
        requiresHumanApproval: true as const,
      })),
      ownerId: status === 'new' ? undefined : `off-ward-${ward.id}`,
      status,
      generator: template.generator,
      citizensAffected: template.citizensAffectedFactor
        ? Math.round(ward.population * template.citizensAffectedFactor * ir.float(0.6, 1.25))
        : undefined,
      contributingDomains: template.contributingDomains,
      createdAt: isoFromAnchor(-minutesAgo),
      updatedAt: isoFromAnchor(-Math.round(minutesAgo * ir.float(0.05, 0.5))),
      classification: template.classification,
      freshness: buildFreshness(`intel:${id}`, {
        refreshIntervalMinutes: template.domain === 'monsoon' ? REFRESH_CADENCE.realtime * 6 : REFRESH_CADENCE.operational,
      }),
    }
  })

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export let INTELLIGENCE_ITEMS: IntelligenceItem[] = []
export let INTELLIGENCE_BY_ID: Map<string, IntelligenceItem> = new Map()

/** ---------------------------------------------------------------------
 * Alerts - the operational escalation surface derived from intelligence
 * ------------------------------------------------------------------- */

const ALERT_STATUSES: AlertStatus[] = ['open', 'acknowledged', 'assigned', 'escalated', 'resolved', 'closed']

/** Severities that escalate onto the alert surface of their own accord. */
const ESCALATING: ReadonlySet<Severity> = new Set<Severity>(['critical', 'high', 'medium'])

function buildAlerts(): Alert[] {
  const raised = INTELLIGENCE_ITEMS.filter((item) => ESCALATING.has(item.severity))

  // Where severity adjustment has left too few escalating items to fill the
  // alert surface, the next most severe items are drawn in rather than showing
  // a Situation Room with nothing in it.
  const source =
    raised.length >= MIN_ALERTS
      ? raised
      : [
          ...raised,
          ...INTELLIGENCE_ITEMS.filter((item) => !ESCALATING.has(item.severity))
            .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
            .slice(0, MIN_ALERTS - raised.length),
        ]

  return source.map((item, i) => {
    const r = det(`alert:${item.id}`)
    const slaHours = item.severity === 'critical' ? 4 : item.severity === 'high' ? 12 : 48
    const ageHours = r.round(0.5, slaHours * 1.9, 1)
    const status = r.weighted([
      ['open', 4],
      ['acknowledged', 3],
      ['assigned', 3],
      ['escalated', 1],
      ['resolved', 2],
      ['closed', 1],
    ] as const satisfies ReadonlyArray<readonly [AlertStatus, number]>)

    return {
      id: `alt-${String(i + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      title: item.title,
      description: item.description,
      domain: item.domain,
      severity: item.severity,
      wardIds: item.wardIds,
      departmentId: item.departmentId,
      source: item.generator === 'model' ? t('Intelligence model') : item.generator === 'analyst' ? t('Analyst review') : t('Rule engine'),
      confidence: item.confidence,
      status,
      ownerId: status === 'open' ? undefined : item.ownerId,
      createdAt: isoFromAnchor(-Math.round(ageHours * 60)),
      updatedAt: isoFromAnchor(-Math.round(ageHours * 60 * r.float(0.1, 0.6))),
      slaHours,
      slaRemainingHours: Math.round((slaHours - ageHours) * 10) / 10,
      evidenceIds: item.evidenceIds,
      intelligenceId: item.id,
      classification: item.classification,
    }
  })
}

export let ALERTS: Alert[] = []
export let ALERT_BY_ID: Map<string, Alert> = new Map()
export const ALERT_STATUS_VALUES = ALERT_STATUSES
export const INTELLIGENCE_STATUS_VALUES = STATUSES

/** ---------------------------------------------------------------------
 * Notifications
 * ------------------------------------------------------------------- */

/**
 * Institutional references quoted in notification bodies are held at the low
 * end of the series deliberately: a smaller corporation raises fewer decision
 * cases and fewer actions, and a notification quoting a reference that does
 * not exist in its own register reads as a broken deployment.
 */
function buildNotifications(): NotificationItem[] {
  return [
    {
      id: 'ntf-0001',
      tenantId: TENANT_ID,
      type: 'critical-alert',
      title: t('Critical: integrated flood and hospital access exposure'),
      body: t('Correlation engine has raised a critical cross-domain exposure affecting hospital approach routes in a flood-prone ward.'),
      createdAt: isoFromAnchor(-24),
      read: false,
      severity: 'critical',
      route: '/command/intelligence',
      recipientRoleIds: ['municipal-commissioner', 'disaster-management-officer', 'additional-commissioner'],
    },
    {
      id: 'ntf-0002',
      tenantId: TENANT_ID,
      type: 'decision-required',
      title: t('Decision case awaiting your approval'),
      body: t('DC-2026-0003 - Pre-monsoon dewatering resource allocation is under review and requires a decision by the competent authority.'),
      createdAt: isoFromAnchor(-92),
      read: false,
      severity: 'high',
      route: '/command/decisions',
      recipientRoleIds: ['municipal-commissioner', 'additional-commissioner', 'department-head'],
    },
    {
      id: 'ntf-0003',
      tenantId: TENANT_ID,
      type: 'sla-warning',
      title: t('Four alerts approaching SLA expiry'),
      body: t('Four high-severity alerts will breach their response SLA within the next six hours.'),
      createdAt: isoFromAnchor(-156),
      read: false,
      severity: 'high',
      route: '/command/alerts',
      recipientRoleIds: ['municipal-commissioner', 'ward-officer', 'department-head', 'operator'],
    },
    {
      id: 'ntf-0004',
      tenantId: TENANT_ID,
      type: 'assignment',
      title: t('Action assigned to you'),
      body: t('ACT-2026-0007 - Complete outstanding desilting on identified reaches has been assigned with a seven-day due date.'),
      createdAt: isoFromAnchor(-210),
      read: true,
      severity: 'medium',
      route: '/command/decisions',
      recipientRoleIds: ['ward-officer', 'department-head', 'chief-engineer'],
    },
    {
      id: 'ntf-0005',
      tenantId: TENANT_ID,
      type: 'ai-recommendation',
      title: t('AI recommendation pending human review'),
      body: t('A resource pre-positioning recommendation is awaiting approval. Recommendations are never executed without a named officer.'),
      createdAt: isoFromAnchor(-268),
      read: false,
      severity: 'medium',
      route: '/ai/recommendations',
      recipientRoleIds: ['municipal-commissioner', 'disaster-management-officer', 'ai-governance-officer'],
    },
    {
      id: 'ntf-0006',
      tenantId: TENANT_ID,
      type: 'security-event',
      title: t('Restricted access attempt recorded'),
      body: t('An access attempt against a restricted revenue record was denied by the permission engine and recorded in the audit trail.'),
      createdAt: isoFromAnchor(-312),
      read: false,
      severity: 'high',
      route: '/trust/security',
      recipientRoleIds: ['security-administrator', 'auditor', 'municipal-commissioner'],
    },
    {
      id: 'ntf-0007',
      tenantId: TENANT_ID,
      type: 'escalation',
      title: t('Alert escalated to your authority'),
      body: t('A pumping capacity alert has been escalated after exceeding its acknowledgement window.'),
      createdAt: isoFromAnchor(-380),
      read: true,
      severity: 'high',
      route: '/command/alerts',
      recipientRoleIds: ['municipal-commissioner', 'additional-commissioner', 'department-head'],
    },
    {
      id: 'ntf-0008',
      tenantId: TENANT_ID,
      type: 'sla-warning',
      title: t('Budget utilisation review due'),
      body: t('Three departments are trailing the phased capital plan by more than 15 percentage points at the reporting date.'),
      createdAt: isoFromAnchor(-620),
      read: true,
      severity: 'medium',
      route: '/governance/budget',
      recipientRoleIds: ['finance-officer', 'municipal-commissioner', 'auditor'],
    },
  ]
}

export let NOTIFICATIONS: NotificationItem[] = []

registerLayer(() => {
  INTELLIGENCE_ITEMS = buildItems()
  INTELLIGENCE_BY_ID = new Map(INTELLIGENCE_ITEMS.map((i) => [i.id, i]))
  ALERTS = buildAlerts()
  ALERT_BY_ID = new Map(ALERTS.map((a) => [a.id, a]))
  NOTIFICATIONS = buildNotifications()
})
